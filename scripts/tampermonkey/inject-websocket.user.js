// ==UserScript==
// @name         Pocket Option WS Hook (Legacy Style)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  WebSocket Hooking for Pocket Quant (Legacy Migration)
// @author       Pocket Quant
// @match        https://pocketoption.com/*
// @match        https://po.trade/*
// @run-at       document-start
// @grant        unsafeWindow
// ==/UserScript==

(function() {
    'use strict';
    
    // Main World 접근 (unsafeWindow가 있으면 사용, 없으면 window)
    const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    
    // 로깅 스타일
    const LOG_PREFIX = '%c[TM-Spy]';
    const LOG_STYLE = 'color: #00ffff; font-weight: bold; font-size: 12px;';

    console.log(`${LOG_PREFIX} 🟢 Tampermonkey Hook Started`, LOG_STYLE);

    // 중복 실행 방지
    if (win.__pocketQuantWsHook) {
        console.log(`${LOG_PREFIX} ⚠️ Already hooked, skipping...`, LOG_STYLE);
        return;
    }
    win.__pocketQuantWsHook = true;

    // 원본 WebSocket 저장
    const OldWebSocket = win.WebSocket;
    win._ws_instances = []; // 디버깅용 인스턴스 저장소

    // WebSocket 생성자 오버라이드
    win.WebSocket = function(...args) {
        console.log(`${LOG_PREFIX} 🔌 WebSocket Constructor Called!`, LOG_STYLE, args);
        
        const ws = new OldWebSocket(...args);
        win._ws_instances.push(ws);
        const url = ws.url;

        // 메시지 리스너 가로채기
        ws.addEventListener('message', function(event) {
            const data = event.data;
            
            // [DEBUG] Socket.IO 메시지 로깅 (42["update..."])
            if (typeof data === 'string' && (data.startsWith('42') || data.startsWith('2'))) {
                 // console.log(`${LOG_PREFIX} 📨 WS Msg:`, LOG_STYLE, data.substring(0, 50) + '...');
            }
            
            // Chrome Extension으로 데이터 전송 (Bridge)
            window.postMessage({
                source: 'pq-bridge',
                type: 'ws-message',
                data: {
                    url: url,
                    raw: data,
                    timestamp: Date.now()
                }
            }, '*');
        });

        return ws;
    };

    // 프로토타입 체인 및 정적 속성 복구
    win.WebSocket.prototype = OldWebSocket.prototype;
    Object.assign(win.WebSocket, OldWebSocket);

    console.log(`${LOG_PREFIX} ✅ Hooking Complete`, LOG_STYLE);
    
    // Bridge Ready 신호
    window.postMessage({ source: 'pq-bridge', type: 'bridge-ready' }, '*');

})();
