/**
 * WS Bridge Injector — CDP를 통한 WebSocket Hook 자동 주입
 *
 * 문제:
 *   마이닝 파이프라인은 Tampermonkey가 Main World에서 WebSocket을 후킹해야 동작합니다.
 *   하지만 E2E 테스트에서는 Tampermonkey가 설치되어 있지 않으므로
 *   파이프라인이 사일런트 실패합니다 (에러 없이 데이터가 0).
 *
 * 해결:
 *   CDP의 `Page.addScriptToEvaluateOnNewDocument`를 사용하면
 *   페이지 로드 전에 Main World에 스크립트를 주입할 수 있습니다.
 *   이것은 Tampermonkey의 `@run-at document-start`와 동일한 효과입니다.
 *
 * 사용법:
 *   const cdp = await page.context().newCDPSession(page)
 *   await injectWSBridge(cdp)
 *   await page.goto('https://pocketoption.com/...')
 *   // 이제 마이닝 파이프라인이 정상 동작
 */

import type { CDPSession } from '@playwright/test'

/**
 * Tampermonkey의 inject-websocket.user.js와 동일한 WS Hook을
 * CDP를 통해 Main World에 주입합니다.
 *
 * 반드시 page.goto() 이전에 호출해야 합니다.
 * (addScriptToEvaluateOnNewDocument는 이후 모든 네비게이션에 적용됩니다)
 */
export async function injectWSBridge(cdp: CDPSession): Promise<void> {
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: WS_HOOK_SCRIPT,
    worldName: '', // empty = Main World (페이지와 동일한 컨텍스트)
  })
}

/**
 * scripts/tampermonkey/inject-websocket.user.js의 핵심 로직을
 * Tampermonkey 의존성 없이 재구성한 스크립트.
 *
 * 변경점:
 *   - unsafeWindow 제거 (이미 Main World)
 *   - @grant/@match 등 Tampermonkey 메타데이터 제거
 *   - 로깅 접두사를 [CDP-Bridge]로 변경하여 구분 가능
 */
const WS_HOOK_SCRIPT = `
(function() {
  'use strict';

  // 중복 실행 방지
  if (window.__pocketQuantWsHook) {
    console.log('[CDP-Bridge] Already hooked, skipping...');
    return;
  }
  window.__pocketQuantWsHook = true;

  const LOG_PREFIX = '[CDP-Bridge]';

  console.log(LOG_PREFIX, 'WS Hook Starting (injected via CDP)');

  // ── 유틸리티 ──────────────────────────────────────

  const decodeData = async (data) => {
    if (typeof data === 'string') return { text: data, type: 'string' };
    if (data instanceof ArrayBuffer) {
      const text = new TextDecoder('utf-8').decode(new Uint8Array(data));
      return { text, type: 'arraybuffer' };
    }
    if (data instanceof Blob) {
      const buf = await data.arrayBuffer();
      const text = new TextDecoder('utf-8').decode(new Uint8Array(buf));
      return { text, type: 'blob' };
    }
    return { text: null, type: typeof data };
  };

  const extractPayload = (text) => {
    if (!text || typeof text !== 'string') return null;
    const m = text.match(/^\\d+-(.*)$/s);
    const candidate = m ? m[1] : text;
    if (candidate.startsWith('{') || candidate.startsWith('[')) {
      try { return JSON.parse(candidate); } catch (_) { return null; }
    }
    return null;
  };

  // ── 메시지 핸들러 ────────────────────────────────

  let lastMessageInfo = null;

  const handleMessage = async ({ data, url }) => {
    const decoded = await decodeData(data);
    let payload = extractPayload(decoded.text);

    // Socket.IO Binary Placeholder 처리
    if (payload && Array.isArray(payload) && payload[1]?._placeholder) {
      lastMessageInfo = { eventName: payload[0], url };
      return;
    }

    if (lastMessageInfo && decoded.type !== 'string') {
      payload = {
        type: 'binary_payload',
        event: lastMessageInfo.eventName,
        data: data
      };
      lastMessageInfo = null;
    } else {
      lastMessageInfo = null;
    }

    window.postMessage({
      source: 'pq-bridge',
      type: 'ws-message',
      data: {
        url,
        raw: data,
        text: typeof data === 'string' ? data : null,
        payload: payload || null,
        dataType: decoded.type,
        timestamp: Date.now()
      }
    }, '*');
  };

  // ── WebSocket 생성자 오버라이드 ───────────────────

  const OldWebSocket = window.WebSocket;
  window._ws_instances = [];

  window.WebSocket = function(...args) {
    const ws = new OldWebSocket(...args);
    window._ws_instances.push(ws);
    const url = ws.url;

    // addEventListener 후킹
    const originalAdd = ws.addEventListener.bind(ws);
    ws.addEventListener = function(type, listener, options) {
      if (type === 'message') {
        const wrappedListener = function(event) {
          if (event.data) {
            handleMessage({ data: event.data, url });
          }
          if (typeof listener === 'function') {
            listener.call(ws, event);
          } else {
            listener.handleEvent(event);
          }
        };
        return originalAdd(type, wrappedListener, options);
      }
      return originalAdd(type, listener, options);
    };

    // onmessage setter 후킹
    Object.defineProperty(ws, 'onmessage', {
      set(listener) {
        const wrappedListener = function(event) {
          if (event.data) {
            handleMessage({ data: event.data, url });
          }
          if (typeof listener === 'function') {
            listener.call(ws, event);
          }
        };
        originalAdd('message', wrappedListener);
      }
    });

    return ws;
  };

  // 프로토타입 및 정적 속성 복구
  window.WebSocket.prototype = OldWebSocket.prototype;
  Object.assign(window.WebSocket, OldWebSocket);

  console.log(LOG_PREFIX, 'Hooking Complete');

  // Bridge Ready 신호
  window.postMessage({ source: 'pq-bridge', type: 'bridge-ready' }, '*');

  // Content Script → WebSocket 전송 핸들러
  window.addEventListener('message', (event) => {
    if (event.data?.source !== 'pq-content' || event.data?.type !== 'ws-send') return;

    const payload = event.data.payload;
    const targetUrlPart = event.data.urlPart;

    const activeWs = window._ws_instances.find(ws =>
      ws.readyState === WebSocket.OPEN &&
      (!targetUrlPart || ws.url.includes(targetUrlPart))
    );

    if (activeWs) {
      console.log(LOG_PREFIX, 'Sending WS message:', typeof payload === 'string' ? payload.slice(0, 100) : payload);
      activeWs.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
    } else {
      console.warn(LOG_PREFIX, 'No active WebSocket found');
    }
  });
})();
`
