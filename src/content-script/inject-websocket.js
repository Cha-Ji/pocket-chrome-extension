;(function() {
  'use strict';

  // [DEBUG] 최상단 로깅: 스크립트 실행 여부 확인
  console.log('%c[PO-Spy] 🟢 Script Execution Started (Aggressive Mode)', 'color: #00ff00; font-size: 16px; font-weight: bold;');

  // 중복 실행 방지
  if (window.__pocketQuantWsHook) {
      console.log('[PO-Spy] ⚠️ Already hooked, skipping...');
      return;
  }
  window.__pocketQuantWsHook = true;

  // 원본 WebSocket 저장 (없으면 아직 정의되지 않은 것)
  let OriginalWebSocket = window.WebSocket;
  const _ws_instances = [];
  window._ws_instances = _ws_instances;

  // 프록시 WebSocket 클래스 정의
  const ProxyWebSocket = function(...args) {
    console.log('%c[PO-Spy] 🔌 WebSocket Constructor Called!', 'color: yellow; font-weight: bold;', args);
    
    // OriginalWebSocket이 늦게 로드될 경우를 대비해 호출 시점에 다시 확인
    if (!OriginalWebSocket) OriginalWebSocket = window.WebSocket;

    const ws = new OriginalWebSocket(...args);
    _ws_instances.push(ws);
    const url = ws.url;

    console.log(`[PO-Spy] Target URL: ${url}`);

    // addEventListener 가로채기
    const originalAdd = ws.addEventListener.bind(ws);
    ws.addEventListener = function(type, listener, options) {
      if (type === 'message') {
        const proxyListener = function(event) {
          // [DEBUG] Socket.IO 메시지 로깅
          if (typeof event.data === 'string' && (event.data.startsWith('42') || event.data.startsWith('2'))) {
               console.log('[PO-Spy] 📨 Socket.IO Message:', event.data.substring(0, 100));
          }
          
          window.postMessage({
              source: 'pq-bridge',
              type: 'ws-message',
              data: {
                  url: url,
                  raw: event.data,
                  timestamp: Date.now()
              }
          }, '*');
          
          if (typeof listener === 'function') listener.call(ws, event);
          else listener.handleEvent(event);
        };
        return originalAdd(type, proxyListener, options);
      }
      return originalAdd(type, listener, options);
    };

    return ws;
  };

  // 정적 속성 복사 함수
  function copyStaticProperties(Target, Source) {
      if (!Source) return;
      Target.CONNECTING = Source.CONNECTING;
      Target.OPEN = Source.OPEN;
      Target.CLOSING = Source.CLOSING;
      Target.CLOSED = Source.CLOSED;
      Target.prototype = Source.prototype;
  }

  // 이미 WebSocket이 있다면 즉시 덮어쓰기
  if (OriginalWebSocket) {
      copyStaticProperties(ProxyWebSocket, OriginalWebSocket);
      window.WebSocket = ProxyWebSocket;
      console.log('[PO-Spy] ✅ WebSocket Overridden Immediately');
  }

  // 아직 없다면(또는 덮어써질 것을 대비해) defineProperty로 함정 설치
  Object.defineProperty(window, 'WebSocket', {
      get() {
          return ProxyWebSocket;
      },
      set(newValue) {
          console.log('[PO-Spy] ⚠️ Someone tried to set WebSocket!');
          OriginalWebSocket = newValue;
          copyStaticProperties(ProxyWebSocket, newValue);
      },
      configurable: true
  });

  console.log('%c[PO-Spy] 🪝 Hooking Complete (Getter/Setter Trap)', 'color: #00ff00; font-size: 14px;');
  window.postMessage({ source: 'pq-bridge', type: 'bridge-ready' }, '*');

  // Remote Click Listener
  window.addEventListener('message', (event) => {
    if (event.data?.source === 'pq-isolated' && event.data.type === 'remote-click') {
        const { selector, text } = event.data.payload;
        console.log(`[PO-Spy] 🎯 Remote Click: ${selector}`);
        const el = document.querySelector(selector);
        if (el) el.click();
    }
  });

})();