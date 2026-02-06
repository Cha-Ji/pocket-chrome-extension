# Task Plan - Legacy Migration (Pocket Server)

## 🎯 목표
`pocket-server`의 검증된 WebSocket 후킹 및 파싱 로직을 `pocket-chrome-extension`에 이식하여, 데이터 수집의 안정성을 100% 확보한다.

## 📋 작업 목록

### 1. `inject-websocket.js` 전면 개편 (The Spy)
- [ ] `window._ws_instances` 추적 로직 추가 (Legacy 차용).
- [ ] `window.WebSocket` 오버라이딩 로직을 `pocket-server` 스타일로 단순화.
- [ ] **중요:** Socket.IO 메시지(`42[...]`)를 그대로 `postMessage`로 전송 (파싱은 파서에게 위임).

### 2. `websocket-parser.ts` 엔진 교체 (The Brain)
- [ ] 기존 JSON 파싱 로직 보강 -> **Socket.IO 프로토콜 파서** 추가.
- [ ] 정규식 `^\d+(?:-\d+)?\[.*\]` 패턴 매칭 구현.
- [ ] `updateHistoryNewFast`, `updateStream` 등 핵심 이벤트 타입 식별.

### 3. `manifest.json` 확정 (The Gate)
- [ ] `inject-websocket.js`를 `world: "MAIN"`, `run_at: "document_start"`로 고정.
- [ ] `index.ts`는 `world: "ISOLATED"` 유지.

### 4. 검증 (Verification)
- [ ] `AutoMiner` 실행 시 `[PO] [WS] Socket.IO Message Detected` 로그 확인.
- [ ] DB에 캔들 데이터 적재 확인.

## 📅 실행 계획
지금 바로 `inject-websocket.js`부터 수정 시작.
