# Task Plan - History Data Collection Fix (PO-16)

## 🎯 목표
`AutoMiner`가 차트를 스크롤할 때 수신되는 **WebSocket 과거 데이터(History Packets)**를 정확히 파싱하여, 끊겨 있는 `DataSender` 연결 고리를 복구한다. 실제 DB(`market-data.db`)에 데이터가 쌓이게 만든다.

## 📋 작업 목록

### Phase 1: 파서 엔진 강화 (The Eye)
- [ ] **`src/content-script/websocket-parser.ts` 수정**
    - [ ] `candle_history` 메시지 타입 정의 추가.
    - [ ] 배열(Array) 형태의 캔들 데이터 감지 패턴(`candle_array`) 구현.
    - [ ] 중첩된 데이터(`data: [...]`, `payload: [...]`) 내의 배열 재귀 탐색 로직 강화.

### Phase 2: 인터셉터 파이프라인 연결 (The Pipe)
- [ ] **`src/content-script/websocket-interceptor.ts` 수정**
    - [ ] `onHistoryReceived` 콜백 인터페이스 추가.
    - [ ] 파싱 결과가 `candle_history`일 경우 콜백 트리거 로직 추가.
    - [ ] 불필요한 단일 틱(PriceUpdate)과의 중복 처리 방지.

### Phase 3: 데이터 전송 연동 (The Hand)
- [ ] **`src/content-script/index.ts` (Main) 수정**
    - [ ] `wsInterceptor` 초기화 시 `onHistoryReceived` 리스너 등록.
    - [ ] 수신된 히스토리 데이터를 `DataSender.sendHistory()`로 즉시 전달.

### Phase 4: 서버 사이드 검증 (The Storage)
- [ ] 로컬 서버(`data-collector-server.ts`) 실행 가이드 작성.
- [ ] 실제 스크롤 시 DB 파일 용량(`ls -l`) 변화 확인.

## 📅 예상 시나리오
1. `AutoMiner` 스크롤 시작.
2. Pocket Option 서버가 캔들 100~500개 덩어리를 WS로 전송.
3. `WebSocketParser`가 이를 `candle_history`로 식별.
4. `index.ts`가 이를 받아 `DataSender`에게 전달.
5. `localhost:3001` 서버가 SQLite에 Bulk Insert.
6. DB 파일 사이즈 증가.
