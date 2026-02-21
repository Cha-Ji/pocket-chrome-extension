# Pocket-Server Legacy Analysis (Success Case)

## 📌 개요
과거 성공했던 프로젝트(`pocket-server`)의 WebSocket 데이터 수집 방식을 분석하여, 현재 Chrome Extension(`pocket-chrome-extension`)의 `PO-16` 이슈(데이터 수집 실패)를 해결하기 위한 기술적 토대를 마련한다.

## 🔑 핵심 성공 요인 (Key Success Factors)

### 1. 시점 (Timing is Everything)
*   **Legacy (`pocket-server`):** Playwright의 `page.add_init_script()`를 사용하여 **페이지 로드 전(Preload)**에 스크립트를 주입함.
*   **Current (`extension`):** `manifest.json`의 `run_at: "document_start"`를 사용했으나, Chrome Extension의 주입 시점이 웹사이트의 초기 스크립트 실행보다 늦는 경우(Race Condition)가 발생함.

### 2. 후킹 방식 (Monkey Patching)
*   `window.WebSocket` 생성자를 오버라이딩(Overriding)하여, 사이트가 생성하는 모든 웹소켓 인스턴스를 `window._ws_instances` 배열에 탈취함.
*   `message` 이벤트 리스너를 강제로 부착하여 모든 수신 데이터를 `window._ws_messages` 버퍼에 저장.

### 3. 데이터 파싱 (Socket.IO Protocol)
*   Pocket Option은 **Socket.IO** 프로토콜을 사용함.
*   데이터 형식: `42["이벤트명", 데이터]` (숫자 접두어 + JSON 배열)
*   **이전 파서 로직:** 정규식(`r'^\d+-\["([^"]+)",(.+)\]$'`)을 사용하여 이벤트 타입과 페이로드를 정확히 분리함.
*   **현재 문제:** 단순 JSON 파싱만 시도하다가 Socket.IO의 숫자 접두어(`42` 등) 때문에 파싱 에러가 났을 가능성 높음.

## 🛠️ 이식 전략 (Migration Strategy)

### Phase 1: 주입 시점 확보 (Inject via Manifest)
*   `inject-websocket.js`를 `manifest.json`의 `content_scripts`에 등록하되, **`world: "MAIN"`** 설정을 필수적으로 사용해야 함. (동적 주입 방식은 너무 느림)
*   CSP 이슈는 `web_accessible_resources` 등록으로 해결.

### Phase 2: Socket.IO 파서 이식
*   `websocket-parser.ts`에 Socket.IO 전용 파싱 로직 추가.
*   `42["updateStream", ...]` 패턴을 처리할 수 있도록 정규식 도입.

### Phase 3: 브릿지(Bridge) 통신
*   `inject-websocket.js` (Main World) ↔ `index.ts` (Isolated World) 간의 통신은 `window.postMessage`만 사용.
*   `chrome.runtime` API 호출은 오직 `index.ts`에서만 수행.

## 📝 Reference Code (`websocket_hook.py`)
```javascript
window._ws_instances = [];
const OldWebSocket = window.WebSocket;
window.WebSocket = function(...args) {
  const ws = new OldWebSocket(...args);
  window._ws_instances.push(ws);
  ws.addEventListener('message', function(event) {
    // 버퍼링 대신 즉시 전송 방식으로 변경 예정 (Extension 특성상)
    window.postMessage({ type: 'ws-message', data: event.data }, '*');
  });
  return ws;
};
window.WebSocket.prototype = OldWebSocket.prototype;
```
