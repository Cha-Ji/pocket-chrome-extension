# Findings - Root Cause Analysis (PO-16)

## 🚨 핵심 문제: "빈 수레가 요란하다"
사용자는 화면이 스크롤되니 "채굴 중"이라고 생각했으나, 실제로는 **데이터가 공중분해** 되고 있었음.

### 1. 연결 고리 단절 (Missing Link)
*   **기존 로직:** `HistoryMiner` 모듈(`src/content-script/history-miner.ts`)이 존재했으나, `index.ts`에서 초기화만 되고 실제 데이터 수집부(`onCandleCaptured`)가 그 어디에도 연결되어 있지 않았음.
*   **현재 상황:** `AutoMiner`는 단순히 휠 이벤트만 발생시킴. 이로 인해 로딩된 네트워크 패킷(WebSocket)은 브라우저 메모리에 들어오지만, 익스텐션이 이를 낚아채는(Capture) 로직이 없음.

### 2. 파서의 한계 (Blind Parser)
*   `WebSocketParser`는 현재 `price_update` (단일 틱)와 `candle_data` (단일 캔들)만 인식함.
*   스크롤 시 서버는 **배열(Array)** 형태의 덩어리 데이터를 보내는데, 파서는 이를 "알 수 없는 메시지"(`unknown`)로 분류하거나 무시하고 있었음.

### 3. 서버 상태 (Dormant Server)
*   `market-data.db`의 타임스탬프가 2일 전으로 멈춰 있음.
*   클라이언트(익스텐션)가 데이터를 보내지 않으니 서버는 할 일이 없어 휴면 상태.

## 🛠 해결 전략
굳이 `HistoryMiner`를 되살려 DOM을 긁는 비효율적인 방식(OCR/Text Parsing)을 쓸 필요가 없음. 이미 `WebSocketInterceptor`가 패킷을 보고 있으므로, **WS 패킷을 직접 파싱**하는 것이 가장 빠르고 정확함.

**결론:** DOM 스크래핑 방식 폐기 -> **WS 패킷 스니핑 방식**으로 전면 전환.
