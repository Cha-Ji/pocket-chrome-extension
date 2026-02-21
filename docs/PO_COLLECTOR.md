# Pocket Option 1m Candle Collector

## 목적
- Pocket Option **리얼 계정**에서 **1분(60s) 캔들(OHLCV)** 을 24/7 수집
- 수집 데이터는 로컬 SQLite(`data/market-data.db`)에 저장

## 구성요소
1) `data-collector` (Express + SQLite)
- 수집 API: `POST /api/candle` / `POST /api/tick`

2) `po-1m-collector` (Playwright)
- Pocket Option 웹 페이지에서 현재가 DOM을 관찰하여 tick을 생성
- tick → 1분 캔들로 집계 → `/api/candle`로 전송

## 실행
### 1) DB 서버(collector) 실행
```bash
npm run collector:start
# 또는
npm run collector
```

### 2) PO 수집기 실행
```bash
npm run po:collector:start
# 또는 단독 실행
npm run po:collector
```

## 환경변수
- `PO_URL` (default: https://pocketoption.com)
- `PO_SYMBOL` (default: EURUSD)
- `PO_HEADLESS` (default: 1)
- `PO_USER_DATA_DIR` (default: ./data/po-session)
- `PO_MEM_RESTART_MB` (default: 2500)
- `PO_MEM_CHECK_EVERY_MS` (default: 15000)
- `COLLECTOR_URL` (default: http://127.0.0.1:3001)

## 최초 1회 세션(로그인)
- `PO_USER_DATA_DIR`는 Playwright **persistent context**용 폴더다.
- 최초 실행 시 로그인이 필요하면 **headless를 잠시 끄고(PO_HEADLESS=0)** 수동 로그인 후, 이후에는 headless로 유지하는 방식을 권장.

## 메모리 이슈 대응
- Pocket Option은 메모리를 많이 사용하므로 `process.memoryUsage().rss` 기준으로 임계치(`PO_MEM_RESTART_MB`)를 넘으면 프로세스가 종료되고 PM2가 재시작한다.

## 주의
- 이 수집기는 거래를 수행하지 않는다(읽기 전용).
- UI 셀렉터가 바뀌면 가격 DOM 셀렉터(`PRICE_SELECTORS`) 업데이트가 필요할 수 있다.
