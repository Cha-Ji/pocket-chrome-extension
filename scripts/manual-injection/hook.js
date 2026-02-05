// ============================================================
// Manual WebSocket Hook Script (Console Injection)
// ============================================================
// 자동 주입이 실패할 경우, 이 코드를 브라우저 콘솔(F12)에 붙여넣으세요.
// 실행 후 페이지를 새로고침(F5)해야 적용됩니다.
// ============================================================

(function() {
  'use strict';

  console.log('%c[PO-Spy] 🟢 Manual Hooking Started', 'color: #00ff00; font-size: 16px; font-weight: bold;');

  const previewText = (text, len = 200) => {
    if (typeof text !== 'string') return text;
    return text.length > len ? text.slice(0, len) + '…' : text;
  };

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
    const m = text.match(/^\d+-(.*)$/s);
    const candidate = m ? m[1] : text;
    if (candidate.startsWith('{') || candidate.startsWith('[')) {
      try { return JSON.parse(candidate); } catch (_) { return null; }
    }
    return null;
  };

  const handleMessage = async ({ data, url }) => {
    const decoded = await decodeData(data);
    const payload = extractPayload(decoded.text);

    let logData = data;
    if (decoded.text) logData = previewText(decoded.text);
    else if (data instanceof ArrayBuffer) logData = `ArrayBuffer(${data.byteLength})`;
    else if (data instanceof Blob) logData = `Blob(${data.size})`;    /*
    if (payload) console.log('[PO-Spy] ✅ PARSED:', payload);
    */

    window.postMessage({
      source: 'pq-bridge',
      type: 'ws-message',
      data: { url, raw: data, text: decoded.text || null, payload: payload || null, dataType: decoded.type, timestamp: Date.now() }
    }, '*');
  };

  // 이미 후킹되었는지 확인
  if (window.__pocketQuantWsHook) {
      console.log('[PO-Spy] ⚠️ Already hooked, skipping...');
      return;
  }
  window.__pocketQuantWsHook = true;

  const OldWebSocket = window.WebSocket;
  window._ws_instances = [];

  // WebSocket 생성자 오버라이드
  window.WebSocket = function(...args) {
    console.log('%c[PO-Spy] 🔌 WebSocket Constructor Called!', 'color: yellow; font-weight: bold;', args);
    
    const ws = new OldWebSocket(...args);
    window._ws_instances.push(ws);
    const url = ws.url;

    console.log(`[PO-Spy] Target URL: ${url}`);

    // addEventListener 가로채기
    const originalAdd = ws.addEventListener.bind(ws);
    ws.addEventListener = function(type, listener, options) {
      if (type === 'message') {
        const wrappedListener = function(event) {
          if (event.data) {
            handleMessage({ data: event.data, url });
          }
          
          // 원본 리스너 실행
          if (typeof listener === 'function') listener.call(ws, event);
          else listener.handleEvent(event);
        };
        return originalAdd(type, wrappedListener, options);
      }
      return originalAdd(type, listener, options);
    };
    
    // onmessage 프로퍼티 가로채기 (Setter Hook)
    Object.defineProperty(ws, 'onmessage', {
        set(listener) {
            console.log('[PO-Spy] 🪝 onmessage setter hooked!');
            const wrappedListener = function(event) {
                if (event.data) {
                    handleMessage({ data: event.data, url });
                }
                if (typeof listener === 'function') listener.call(ws, event);
            };
            originalAdd('message', wrappedListener);
        }
    });

    return ws;
  };

  // 프로토타입 체인 복구
  window.WebSocket.prototype = OldWebSocket.prototype;
  Object.assign(window.WebSocket, OldWebSocket);

  console.log('%c[PO-Spy] ✅ Hooking Complete. PLEASE REFRESH PAGE NOW.', 'color: #00ff00; font-size: 14px;');
  
  // Bridge Ready 신호
  window.postMessage({ source: 'pq-bridge', type: 'bridge-ready' }, '*');

})();
