# CDP Testing 핵심 발견사항

## 설계 결정

### Playwright 내장 CDP 사용
- `page.context().newCDPSession(page)` — 추가 의존성 없음
- Puppeteer/chrome-remote-interface 불필요
- Playwright가 내부적으로 CDP를 사용하므로 호환성 보장

### 기존 console-monitor와 공존
- CDP Inspector는 console-monitor를 **대체하지 않고 보완**
- console-monitor: 빠른 파이프라인 단계 확인 (regex 기반)
- CDP Inspector: 원본 데이터 검증, 네트워크 상세, 메모리 진단

## 기술적 제약

### CDP 세션 스코프
- `newCDPSession(page)`은 해당 페이지 탭에만 연결
- Service Worker에 연결하려면 `Target.attachToTarget` 필요 (Phase 2)
- 한 페이지에 여러 CDP 세션 부착 가능하지만 이벤트가 중복될 수 있음

### WebSocket 프레임 캡처 한계
- `Network.webSocketFrameReceived`는 텍스트 프레임만 payload를 제공
- 바이너리 프레임은 base64 인코딩으로 전달 (디코딩 필요)
- Socket.IO Binary Placeholder (451-) 패턴은 별도 파싱 로직 필요

### Socket.IO 프레임 구조
```
숫자접두사 + JSON 배열
예: 42["eventName",{...}]
    451-["eventName",{"_placeholder":true,"num":0}]
```
- `parseSocketIOFrame()` 함수로 이벤트 이름 추출
- 451- 접두사는 바이너리 첨부가 있다는 의미

## 핵심 CDP 도메인 활용

| 도메인 | 이벤트 | 용도 |
|--------|--------|------|
| Network | webSocketCreated | WS 연결 감지 |
| Network | webSocketFrameReceived/Sent | WS 프레임 캡처 |
| Network | requestWillBeSent | DataSender HTTP 요청 감시 |
| Network | responseReceived | HTTP 응답 상태코드 확인 |
| Runtime | exceptionThrown | 미포착 JS 예외 수집 |
| Performance | getMetrics | 힙 메모리, DOM 노드 수 |
