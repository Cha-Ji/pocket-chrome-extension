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
        else if (data instanceof Blob) logData = `Blob(${data.size})`;        /*
        if (payload) {
            console.log(`${LOG_PREFIX} ✅ PARSED:`, LOG_STYLE, payload);
        }
        */

        window.postMessage({
            source: 'pq-bridge',
            type: 'ws-message',
            data: {
                url,
                raw: data,
                text: decoded.text || null,
                payload: payload || null,
                dataType: decoded.type,
                timestamp: Date.now()
            }
        }, '*');
    };

    // 중복 실행 방지
    if (win.__pocketQuantWsHook) {
        console.log(`${LOG_PREFIX} ⚠️ Already hooked, skipping...`, LOG_STYLE);
        return;
    }
    win.__pocketQuantWsHook = true;

    // 원본 WebSocket 저장
    const OldWebSocket = win.WebSocket;
    win._ws_instances = []; // 디버깅용 인스턴스 저장소

    // win.WebSocket = function(...args) {
    //     console.log(`${LOG_PREFIX} 🔌 WebSocket Constructor Called!`, LOG_STYLE, args);
    //     ...
    // };
    // 위 방식 대신 Proxy나 Class Extends를 쓸 수 있지만, 여기서는 가장 안정적인 방식 사용
    win.WebSocket = function(...args) {
        // console.log(`${LOG_PREFIX} 🔌 WebSocket Constructor Called!`, LOG_STYLE, args);
        
        const ws = new OldWebSocket(...args);
        win._ws_instances.push(ws);
        const url = ws.url;

        // 메시지 리스너 가로채기 (더 공격적인 방식: addEventListener 오버라이드)
        const originalAdd = ws.addEventListener.bind(ws);
        ws.addEventListener = function(type, listener, options) {
            if (type === 'message') {
                const wrappedListener = function(event) {
                    if (event.data) {
                        handleMessage({ data: event.data, url });
                    }
                    
                    // 원본 리스너 호출
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
        
        // onmessage 프로퍼티 후킹 (Setter Trap)
        Object.defineProperty(ws, 'onmessage', {
            set(listener) {
                // console.log(`${LOG_PREFIX} 🪝 onmessage setter hooked!`, LOG_STYLE);
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

    // 프로토타입 체인 및 정적 속성 복구
    win.WebSocket.prototype = OldWebSocket.prototype;
    Object.assign(win.WebSocket, OldWebSocket);

    console.log(`${LOG_PREFIX} ✅ Hooking Complete`, LOG_STYLE);
    
    // Bridge Ready 신호
    window.postMessage({ source: 'pq-bridge', type: 'bridge-ready' }, '*');

})();
