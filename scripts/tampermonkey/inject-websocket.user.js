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

    let lastMessageInfo = null;

    const handleMessage = async ({ data, url }) => {
        const decoded = await decodeData(data);
        let payload = extractPayload(decoded.text);

        // [PO-17] Socket.IO Binary Placeholder 처리
        // 예: 451-["updateStream",{"_placeholder":true,"num":0}]
        if (payload && Array.isArray(payload) && payload[1]?._placeholder) {
            lastMessageInfo = { eventName: payload[0], url };
            return; // 실제 데이터는 다음 바이너리 프레임에 있음
        }

        // 이전 프레임이 플레이스홀더였고 현재 프레임이 바이너리인 경우 데이터 결합
        if (lastMessageInfo && decoded.type !== 'string') {
            // 바이너리 데이터를 객체로 변환 시도 (메시지 타입에 따라 다름)
            // 일단 원본 데이터를 payload로 보냄
            payload = { 
                type: 'binary_payload', 
                event: lastMessageInfo.eventName, 
                data: data // ArrayBuffer 또는 Blob
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
        
        // ws.send() 후킹 — 발신 메시지에서 자산 ID 캡처
        const originalSend = ws.send.bind(ws);
        ws.send = function(data) {
            if (typeof data === 'string') {
                // changeSymbol, subscribeMessage 등에서 asset ID 추출
                const assetMatch = data.match(/"asset"\s*:\s*"([^"]+)"/);
                if (assetMatch) {
                    window.postMessage({
                        source: 'pq-bridge',
                        type: 'ws-asset-change',
                        data: { asset: assetMatch[1], text: data.substring(0, 200), timestamp: Date.now() }
                    }, '*');
                }
            }
            return originalSend(data);
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

    // 외부(Content Script)로부터의 메시지 전송 요청 처리
    window.addEventListener('message', (event) => {
        if (event.data?.source !== 'pq-content' || event.data?.type !== 'ws-send') return;

        const payload = event.data.payload;
        const targetUrlPart = event.data.urlPart; // 특정 소켓에만 보내고 싶을 경우

        const activeWs = win._ws_instances.find(ws => 
            ws.readyState === WebSocket.OPEN && 
            (!targetUrlPart || ws.url.includes(targetUrlPart))
        );

        if (activeWs) {
            console.log(`${LOG_PREFIX} 📤 Sending direct message:`, LOG_STYLE, payload);
            activeWs.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
        } else {
            console.warn(`${LOG_PREFIX} ❌ No active WebSocket found to send message`, LOG_STYLE);
        }
    });

})();
