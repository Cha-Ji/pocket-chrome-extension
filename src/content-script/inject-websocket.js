// ============================================================
// Extension 내장 WebSocket Hook (Main World)
// ============================================================
// Extension이 직접 WebSocket을 후킹합니다.
// manifest.json의 world: MAIN 설정으로 Main World에서 실행됩니다.
// postMessage bridge 프로토콜로 Isolated World의 interceptor와 통신합니다.
// ============================================================

;(function() {
    'use strict';

    // 중복 실행 방지 (TM 스크립트와 플래그 공유)
    if (window.__pocketQuantWsHook) {
        console.log('[PO-Spy] ⚠️ Already hooked (TM or Extension), skipping...');
        return;
    }
    window.__pocketQuantWsHook = true;

    console.log('%c[PO-Spy] 🟢 Extension WS Hook Started', 'color: #00ff00; font-weight: bold;');

    // ── 메시지 디코딩 ────────────────────────────────────

    var decodeData = function(data) {
        if (typeof data === 'string') return Promise.resolve({ text: data, type: 'string' });
        if (data instanceof ArrayBuffer) {
            var text = new TextDecoder('utf-8').decode(new Uint8Array(data));
            return Promise.resolve({ text: text, type: 'arraybuffer' });
        }
        if (data instanceof Blob) {
            return data.arrayBuffer().then(function(buf) {
                var text = new TextDecoder('utf-8').decode(new Uint8Array(buf));
                return { text: text, type: 'blob' };
            });
        }
        return Promise.resolve({ text: null, type: typeof data });
    };

    var extractPayload = function(text) {
        if (!text || typeof text !== 'string') return null;
        // Socket.IO prefix 제거: "451-[...]" → "[...]"
        var m = text.match(/^\d+-(.*)$/s);
        var candidate = m ? m[1] : text;
        if (candidate.charAt(0) === '{' || candidate.charAt(0) === '[') {
            try { return JSON.parse(candidate); } catch (_) { return null; }
        }
        return null;
    };

    // ── Socket.IO Binary Placeholder 추적 ────────────────

    var lastMessageInfo = null;

    var handleMessage = function(info) {
        var data = info.data;
        var url = info.url;

        decodeData(data).then(function(decoded) {
            var payload = extractPayload(decoded.text);

            // Socket.IO Binary Placeholder 처리
            // 예: 451-["updateStream",{"_placeholder":true,"num":0}]
            if (payload && Array.isArray(payload) && payload[1] && payload[1]._placeholder) {
                lastMessageInfo = { eventName: payload[0], url: url };
                return;
            }

            // 이전 프레임이 플레이스홀더 → 현재가 바이너리 데이터
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

            // [#47] targetOrigin을 명시하여 같은 origin에서만 수신 가능하도록
            window.postMessage({
                source: 'pq-bridge',
                type: 'ws-message',
                data: {
                    url: url,
                    raw: data,
                    text: typeof data === 'string' ? data : null,
                    payload: payload || null,
                    dataType: decoded.type,
                    timestamp: Date.now()
                }
            }, window.location.origin);
        });
    };

    // ── WebSocket 오버라이드 ──────────────────────────────

    var OldWebSocket = window.WebSocket;
    var _ws_instances = [];
    window._ws_instances = _ws_instances;

    window.WebSocket = function() {
        var args = Array.prototype.slice.call(arguments);
        var ws = new (Function.prototype.bind.apply(OldWebSocket, [null].concat(args)))();
        _ws_instances.push(ws);
        var url = ws.url;

        // addEventListener 후킹 — 수신 메시지 가로채기
        var originalAdd = ws.addEventListener.bind(ws);
        ws.addEventListener = function(type, listener, options) {
            if (type === 'message') {
                var wrappedListener = function(event) {
                    if (event.data) handleMessage({ data: event.data, url: url });
                    if (typeof listener === 'function') listener.call(ws, event);
                    else listener.handleEvent(event);
                };
                return originalAdd(type, wrappedListener, options);
            }
            return originalAdd(type, listener, options);
        };

        // ws.send() 후킹 — 발신 메시지에서 asset ID 캡처
        var originalSend = ws.send.bind(ws);
        ws.send = function(data) {
            if (typeof data === 'string') {
                var assetMatch = data.match(/"asset"\s*:\s*"([^"]+)"/);
                if (assetMatch) {
                    // [#47] targetOrigin 명시
                    window.postMessage({
                        source: 'pq-bridge',
                        type: 'ws-asset-change',
                        data: { asset: assetMatch[1], text: data.substring(0, 200), timestamp: Date.now() }
                    }, window.location.origin);
                }
            }
            return originalSend(data);
        };

        // onmessage setter 후킹
        Object.defineProperty(ws, 'onmessage', {
            set: function(listener) {
                var wrappedListener = function(event) {
                    if (event.data) handleMessage({ data: event.data, url: url });
                    if (typeof listener === 'function') listener.call(ws, event);
                };
                originalAdd('message', wrappedListener);
            }
        });

        return ws;
    };

    // 프로토타입/정적 속성 복구
    window.WebSocket.prototype = OldWebSocket.prototype;
    Object.assign(window.WebSocket, OldWebSocket);

    console.log('%c[PO-Spy] ✅ Hooking Complete', 'color: #00ff00; font-weight: bold;');
    // [#47] targetOrigin 명시
    window.postMessage({ source: 'pq-bridge', type: 'bridge-ready' }, window.location.origin);

    // ── Extension → WS 전송 핸들러 ──────────────────────

    window.addEventListener('message', function(event) {
        // [#47] Origin 검증: 같은 페이지에서만 수신
        if (event.origin !== window.location.origin) return;
        if (!event.data || event.data.source !== 'pq-content' || event.data.type !== 'ws-send') return;

        var payload = event.data.payload;
        var targetUrlPart = event.data.urlPart;

        var activeWs = _ws_instances.find(function(ws) {
            return ws.readyState === WebSocket.OPEN &&
                (!targetUrlPart || ws.url.indexOf(targetUrlPart) !== -1);
        });

        if (activeWs) {
            console.log('[PO-Spy] 📤 Sending:', typeof payload === 'string' ? payload.substring(0, 120) : payload);
            activeWs.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
        } else {
            console.warn('[PO-Spy] ❌ No active WebSocket found to send message');
        }
    });

    // ── Remote Click (forceClick 지원) ───────────────────

    window.addEventListener('message', function(event) {
        // [#47] Origin 검증: 같은 페이지에서만 수신
        if (event.origin !== window.location.origin) return;
        if (!event.data || event.data.source !== 'pq-isolated' || event.data.type !== 'remote-click') return;
        var selector = event.data.payload && event.data.payload.selector;
        if (selector) {
            var el = document.querySelector(selector);
            if (el) {
                console.log('[PO-Spy] 🎯 Remote Click:', selector);
                el.click();
            }
        }
    });
})();
