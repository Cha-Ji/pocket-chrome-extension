# Findings - WebSocket Interceptor (PO-10)

## 📅 2026-02-01

### 기존 구현 분석

#### feature/websocket-interceptor 브랜치 구조
- `websocket-interceptor.ts`: Content Script에서 CustomEvent 수신 및 가격 데이터 추출
- `websocket-parser.ts`: 다양한 메시지 형식을 처리하는 파서 (패턴 매칭 방식)
- `inject-websocket.ts`: 페이지 컨텍스트에서 WebSocket 오버라이드

### 기술적 결정

#### WebSocket 가로채기 방식
- **방식**: 페이지 컨텍스트에 스크립트 주입 → 원본 WebSocket 오버라이드
- **이유**: Content Script는 페이지의 window 객체에 직접 접근 불가
- **통신**: CustomEvent를 통해 Content Script로 데이터 전달

#### 파서 패턴
1. `simple_price`: { symbol, price } 형태
2. `bid_ask`: { bid, ask } 형태 → mid price 계산
3. `ohlc_candle`: OHLC 데이터
4. `array_price`: [timestamp, price] 배열 형태
5. `nested_data`: { data: {...} } 중첩 구조
6. `pocket_option_action`: action/cmd 필드가 있는 메시지

### 제약/가정

- Pocket Option 사이트의 WebSocket URL 패턴: `wss://.*pocketoption`, `wss://.*po\.trade` 등
- 분석 모드 기본 활성화: 실제 메시지 패턴 발견 후 파서 확장 필요
- inject-websocket.js는 web_accessible_resources로 등록 필수
