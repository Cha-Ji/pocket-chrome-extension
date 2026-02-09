# Bulk History DB 미저장 버그 - Findings

## 증상
- Tampermonkey WS 후킹으로 1500개 캔들 수신 확인
- 실시간 데이터(DOM 경유)는 DB 저장 정상
- 벌크 히스토리는 DB에 0건 저장

## 파이프라인 추적

```
[PO Server] → WS Frame (text: 42[...] 또는 binary: 451-[...]+ArrayBuffer)
     ↓
[Tampermonkey] extractPayload() + handleMessage()
     ↓ window.postMessage({ source: 'pq-bridge', payload, text, raw })
[websocket-interceptor.ts] handleBridgeMessage() → handleMessage()
     ↓ parsed.type === 'candle_history' 체크
[content-script/index.ts] onHistoryReceived 콜백
     ↓
[data-sender.ts] sendHistory() → POST /api/candles/bulk
     ↓
[data-collector-server.ts] SQLite INSERT
```

## 근본 원인 2가지

### 원인 1 (Binary 경로): interceptor가 `binary_payload`를 유효한 타입으로 오인

**파일**: `src/content-script/websocket-interceptor.ts:106-109`

```typescript
let parsed = data.parsed;
if (!parsed || typeof parsed.type !== 'string') {  // ← 여기가 문제
    parsed = this.parser.parse(data.text ?? data.raw);
}
```

**흐름**:
1. TM Bridge가 바이너리 히스토리를 `{ type: 'binary_payload', event: 'updateHistoryNewFast', data: ArrayBuffer }`로 전송
2. `typeof 'binary_payload' === 'string'` → true → **파서 호출 건너뜀**
3. `parsed.type === 'candle_history'`? → NO (binary_payload ≠ candle_history)
4. `historyCallbacks` 미호출 → DataSender 미호출 → DB 미저장

**아이러니**: 파서에 `socketio_binary_payload` 패턴(패턴 10)이 이미 구현되어 있지만, 호출 기회를 얻지 못함

### 원인 2 (Text 경로): Socket.IO 프리픽스 파싱 실패

**파일 2곳**:

A) `scripts/tampermonkey/inject-websocket.user.js:44-52` (extractPayload)
```javascript
const m = text.match(/^\d+-(.*)$/s);  // "451-[...]"만 매칭, "42[...]"는 실패
```
- `42["updateHistoryNewFast",...]` → `-`가 없어 regex 미매칭 → payload = null

B) `src/content-script/websocket-parser.ts:449-459` (parse)
```typescript
if (typeof data === 'string') {
    try { data = JSON.parse(data) }       // "42[...]"는 JSON 아님 → 실패
    catch { return { type: 'unknown' } }  // 즉시 포기, prefix 제거 미시도
}
```
- `JSON.parse("42[\"updateHistoryNewFast\",...]")` → SyntaxError → unknown 반환

## 실시간 데이터가 정상인 이유

실시간 경로는 WS 파이프라인을 우회:
```
CandleCollector (DOM MutationObserver) → onCandle → DataSender.sendCandle()
```
DOM 기반 수집은 WS 파싱과 무관하게 동작

## 영향 범위

| 경로 | 영향 |
|------|------|
| 바이너리 WS (451- + ArrayBuffer) | 원인 1로 실패 |
| 텍스트 WS (42[...]) | 원인 2로 실패 |
| 실시간 DOM 수집 | 영향 없음 (정상) |
| AutoMiner → requestNextChunk | 요청 전송은 정상, 응답 수신에서 실패 |

---

## 실환경 테스트 결과 (2026-02-08)

### 테스트 조건
- Fix 1 (interceptor VALID_PARSED_TYPES) + Fix 2 (parser Socket.IO prefix 제거) 적용 후 빌드
- PO 데모 환경에서 Miner 시작

### 결과: 파이프라인 검증 불가 — 자산 전환 단계에서 전부 실패

Miner가 `loadHistoryPeriod` WS 요청을 보내는 단계까지 도달하지 못함.
모든 OTC 자산이 `.asset-inactive` 오버레이로 "이용 불가" 상태.

### 콘솔 로그 요약

```
[Miner] 🚀 Starting Bulk History Mining...
[Monitor] Found 10 available assets (payout ≥ 92%)
[Monitor] 🔄 Switching to: American Express OTC
[Monitor] 🔍 Unavailable detected: Pattern 1 (.asset-inactive)
  → "죄송합니다. 이 거래 도구는 현재 이용이 불가능합니다."
[Monitor] 🔄 tryReloadInactive() 시도 → 실패 (오버레이 유지)
[Miner] ⛔ American Express OTC is unavailable, skipping...

... (모든 자산 동일 패턴 반복) ...

[Miner] 🌙 연속 5개 자산 이용 불가 — OTC 시장 닫힘 판단, 5분 후 재시도
```

### 분석

- ❌ ~~가설 A: OTC 시장 시간 문제~~ — 사용자 확인: 해당 OTC 자산들은 개장 상태. 미개장 시 목록 자체에 표시 안됨
- ✅ **가설 B: `.asset-inactive` 감지 오류** — 근본 원인 3가지 확인:
  1. **타이밍 부족**: 차트 전환 시 `.asset-inactive` 오버레이가 일시적으로 나타남. 고정 대기(2s+2s=4s)가 부족
  2. **스코프 부재**: `document.querySelector('.asset-inactive')`가 전체 DOM을 탐색 → 피커 리스트 내 요소도 감지
  3. **조기 클릭 간섭**: `tryReloadInactive()`가 로딩 중 오버레이를 클릭 → 자연스러운 차트 로딩을 방해
- 이 문제는 **자산 전환 버그**이며, Fix 1/Fix 2의 **파이프라인 버그**와는 별개

### Fix 3: 자산 전환 unavailable 오탐 수정 (2026-02-08)

**수정 파일**: `src/content-script/payout-monitor.ts`

**변경 사항 3가지**:

1. **폴링 기반 대기 (고정 대기 → 15초 폴링)**
   - 기존: `wait(2s) → detect → wait(2s) → detect` (총 4초 passive)
   - 변경: `waitForCondition(15s, 1s 간격)` (최대 15초 passive 대기)
   - 차트 로딩이 완료되면 즉시 진행, 타임아웃 후에만 리로드 시도

2. **차트 영역 스코핑**
   - 기존: `document.querySelector('.asset-inactive')` (전체 DOM)
   - 변경: `.chart-item` 또는 `.chart-block` 내부로 스코프 제한
   - `findChartInactiveEl()` 헬퍼 추출 (가시성 체크 포함)

3. **추가 가시성 체크**
   - `offsetParent` 외에 `getBoundingClientRect()` 크기 체크 추가
   - 크기 0인 요소는 보이지 않는 것으로 판정 → 무시
   - 디버그 로깅 강화 (rect 크기, 부모 클래스 출력)

### Fix 3 실환경 실패 → Fix 3b로 전환

**Fix 3 실패 원인**: `.asset-inactive` 오버레이의 텍스트가 "다시 로드하려면 클릭" — 일시적 로딩이 아닌 **사용자 클릭이 필요한 상태**. 15초 passive 대기는 무의미.

**Fix 3b 접근 (성공)**:
- `dismissStaleInactive()`, `detectAssetUnavailable()`, `tryReloadInactive()` 삭제 (106줄 제거)
- `.current-symbol` 텍스트 변경으로 전환 성공 확인 → 오버레이 있으면 1회 클릭 → **무조건 성공 반환**
- 실제 가용 여부는 WS 히스토리 응답 타임아웃으로 판단 (auto-miner 쪽)

### Fix 4: WS 히스토리 타임아웃 — Asset ID 오류

**증상**: 자산 전환은 성공하나, `loadHistoryPeriod` WS 요청이 모든 자산에서 15초 타임아웃 × 3 = skip

**근본 원인**: `resolveAssetId()` fallback이 display name 기반 변환 → 잘못된 ID 생성
- "Apple OTC" → `#APPLE_otc` (❌ 부정확)
- PO 서버는 `#AAPL_otc` (티커 기반) 사용 → 존재하지 않는 ID는 묵살 → 응답 없음

**원인 2**: TM 스크립트가 `ws.send()`를 후킹하지 않아 발신 `changeSymbol`의 real asset ID 미캡처

**Fix 4 수정 (코드 적용 완료, 실환경 실패)**:
1. TM: `ws.send()` 후킹 → `"asset"` 필드 regex 캡처 → `ws-asset-change` 이벤트
2. Interceptor: `ws-asset-change` 핸들러 → `lastAssetId` 업데이트
3. `resolveAssetId()` 3단계: WS tracked → DOM 추출 → fallback(WARNING)

### Fix 4 실환경 실패 분석 → Fix 5로 해결

**Fix 4 실패 근본 원인 3가지 확인**:

1. **interceptor changeSymbol 추적 = 죽은 코드**: `Array.isArray(parsed)` 체크가 `ParsedMessage` 객체에 대해 항상 false → `changeSymbol` 수신 감지 불가
2. **수신 WS 메시지 asset 추적 전무**: TM ws.send() 후킹(발신)에만 의존 → PO가 자산 전환 시 WS send를 사용하지 않으면 캡처 불가
3. **DOM asset ID 추출 미스매치**: `data-id`, `data-asset`, `data-active-asset` 셀렉터가 실제 PO DOM에 존재하지 않음

**Fix 5 접근**: TM send 후킹(발신) 대신 **서버가 보내는 수신 메시지**에서 asset ID를 자동 추적
- 전략 A: 파싱된 `price_update` 결과의 `symbol` (updateStream 등)
- 전략 B: 원본 raw 텍스트의 `"asset":"..."` 패턴 (changeSymbol 응답, 히스토리 응답 등)
- auto-miner: 자산 전환 후 최대 6초 대기하며 WS 수신에서 asset ID 캡처 확인

**기대 동작 흐름**:
```
1. switchAsset("Apple OTC") → DOM 클릭 → PO 내부 자산 전환
2. PO 서버가 새 자산의 updateStream 전송 → "42["updateStream",[["#AAPL_otc",...]]]"
3. TM bridge → interceptor handleMessage → parser → price_update (symbol: "#AAPL_otc")
4. trackAssetFromMessage() → lastAssetId = "#AAPL_otc"
5. waitForAssetId() → 6초 내 캡처 확인 → resolveAssetId() → "#AAPL_otc" 사용
6. loadHistoryPeriod 요청에 올바른 asset ID 사용 → PO 서버 응답 → 히스토리 수신
```

### Fix 7 (필요): switchAsset "UI did not update" → 연쇄 오분류 버그

**발견**: 2026-02-08 세션 12

**증상**:
- DataSender(passive)는 정상 동작 — `Bulk saved: 1449 candles (symbol: #AAPL_OTC)`
- AutoMiner(active)는 자산 전환 100% 실패 → 5개 연속 후 "OTC 시장 닫힘" 판단

**로그 흐름**:
```
[Monitor] ❌ Switch failed (UI did not update).
[Monitor] Closing picker...
[DOM] Requesting Remote Click on: <A class="pair-number-wrap"> "Apple OTC"
[Miner] ⛔ VISA OTC is unavailable, skipping...
[Miner] 🌙 연속 5개 자산 이용 불가 — OTC 시장이 닫혀있는 것으로 판단, 5분 후 재시도
```

**근본 원인**: `payout-monitor.ts:226-228` — **기술적 전환 실패를 자산 이용 불가로 오분류**

```typescript
// payout-monitor.ts:225-229
if (!isSwitched) {
   log.warn('❌ Switch failed (UI did not update).')
   this.markAssetUnavailable(assetName)  // ← UI 미갱신 ≠ 자산 이용 불가!
   await this.closeAssetPicker()
   return false
}
```

**연쇄 메커니즘**:
1. `switchAsset()` → `.current-symbol` 텍스트에 target 미포함 → `markAssetUnavailable()` 호출
2. `auto-miner.ts:244` — `isAssetUnavailable()` → `true` (방금 마킹됨)
3. `consecutiveUnavailable++` → 5개 도달 → "시장 닫힘" 판정 → 5분 대기

auto-miner에 기술적 실패 vs 실제 unavailable 구분 로직이 있지만 (`auto-miner.ts:243-252`), switchAsset이 이미 `markAssetUnavailable`을 호출해버려서 항상 "실제 unavailable"로 판정됨.

**"UI did not update" 자체의 원인 후보**:
1. `.current-symbol` 텍스트 형식이 피커 이름과 불일치 (예: "AAPL" vs "Apple OTC")
2. `wait(2000)`이 부족 — PO React 렌더링이 더 느릴 수 있음
3. `forceClick`이 PO React 이벤트 시스템에서 무시됨

**DataSender vs AutoMiner 역할 (레거시 아님)**:

| | DataSender (passive) | AutoMiner (active) |
|---|---|---|
| 트리거 | PO가 자발적으로 보내는 히스토리 수신 | 능동적으로 자산 전환 + WS 요청 |
| 범위 | 현재 보고 있는 자산 1개만 | 여러 자산을 자동 순회 |
| 연결 | `index.ts:156` — `onHistoryReceived` → `sendHistory()` | `index.ts:159` — 같은 콜백에서 `onHistoryResponse()` |

AutoMiner는 레거시가 아님. 다수 자산 데이터 수집에 필수. 자산 전환 검증 버그로 무력화 상태.

**Fix 7 수정 방향**:
1. `switchAsset`에서 "UI did not update" 실패 시 `markAssetUnavailable()` 제거 → 단순 `false` 반환
2. `.current-symbol` 체크를 폴링 방식으로 변경 (최대 5초, 500ms 간격) — `waitForCondition` 활용
3. `.current-symbol` 외에 `.pair-number-wrap` 텍스트도 확인하여 전환 성공 판정
4. (진단 선행) 브라우저 콘솔에서 전환 후 `.current-symbol?.textContent` 직접 확인 필요

### 현재 상태 정리

| 영역 | 상태 | 비고 |
|------|------|------|
| Fix 1 (interceptor) | ✅ 실환경 검증 완료 | 콘솔 테스트로 확인 |
| Fix 2 (parser) | ✅ 실환경 검증 완료 | 콘솔 테스트로 확인 |
| Fix 3b (자산 전환) | ✅ 실환경 검증 완료 | 오버레이 클릭 방식 |
| Fix 4 (Asset ID - TM) | ❌ 실환경 실패 | PO가 자산 전환 시 WS send 미사용 |
| Fix 5 (Asset ID - 수신) | ⏸ 코드 적용 완료 | 실환경 검증 필요 |
| Fix 6 (TM 의존성 제거) | ✅ 실환경 성공 | Extension 내장 WS 후킹 |
| **Fix 7 (switchAsset 오분류)** | **⏸ 미착수** | **findings 분석 완료, 코드 수정 필요** |
| 단위 테스트 | ✅ 25/25 통과 | |
| 파이프라인 E2E | ⏸ 미완료 | Fix 7 적용 후 재검증 |

---

## 콘솔 파이프라인 독립 검증 가이드

Miner의 자산 전환을 우회하여 파이프라인(interceptor → parser → DataSender → DB)만 직접 테스트.

### 사전 조건

1. `data-collector-server`가 `localhost:3001`에서 실행 중
2. PO 사이트가 열려있고, 익스텐션이 로드된 상태
3. 브라우저 콘솔(F12) 열기

### 테스트 A: 가짜 히스토리로 파이프라인 전체 검증

Tampermonkey가 보내는 것과 동일한 형식의 `window.postMessage`를 직접 호출.
interceptor → parser → index.ts 콜백 → DataSender → DB 전체 경로를 검증.

```javascript
// [테스트 A] 가짜 히스토리 2개 캔들을 Bridge 경유로 전송
window.postMessage({
  source: 'pq-bridge',
  type: 'ws-message',
  data: {
    url: 'wss://test-pipeline-verification',
    dataType: 'string',
    text: '42["updateHistoryNewFast",{"asset":"#EURUSD_otc","data":[{"open":1.08500,"high":1.08600,"low":1.08400,"close":1.08550,"time":1707100000,"volume":100},{"open":1.08550,"high":1.08700,"low":1.08500,"close":1.08600,"time":1707100060,"volume":150}]}]',
    timestamp: Date.now()
  }
}, '*')
```

**기대하는 콘솔 로그**:
```
[PO] [WS-Interceptor] Candle History Detected! Count: 2
[PO] [WS] History/Bulk Captured: 2 candles for ...
[PO] 📜 History Captured: 2 candles for EURUSD-OTC
[PO] [DataSender] Sending 2 candles (...KB) to http://localhost:3001/api/candles/bulk
[PO] [DataSender] Bulk saved: 2 candles (symbol: EURUSD-OTC)
```

**실패 시 확인할 것**:
- `Candle History Detected!` 안 나오면 → parser가 `candle_history` 타입을 못 반환 (Fix 2 문제)
- `History Captured` 안 나오면 → interceptor의 `historyCallbacks`가 비어있음 (콜백 미등록)
- `Bulk saved` 안 나오면 → DataSender 전송 실패 (서버 미실행 또는 데이터 검증 실패)

### 테스트 B: 배열 형식 캔들 (PO에서 실제로 보내는 형식)

PO는 캔들을 `[timestamp, open, close, high, low]` 배열로 보내기도 함.

```javascript
// [테스트 B] 배열 형식 캔들 3개
window.postMessage({
  source: 'pq-bridge',
  type: 'ws-message',
  data: {
    url: 'wss://test-pipeline-verification',
    dataType: 'string',
    text: '42["updateHistoryNewFast",[[1707100000,1.085,1.0855,1.086,1.084,100],[1707100060,1.0855,1.086,1.087,1.085,150],[1707100120,1.086,1.0865,1.087,1.0855,120]]]',
    timestamp: Date.now()
  }
}, '*')
```

### 테스트 C: 실제 WS를 통해 서버에 히스토리 요청

Tampermonkey Bridge 경유로 실제 PO 서버에 히스토리 요청 전송.
실제 WS 응답이 돌아와야 하므로 Tampermonkey 스크립트 활성 + WS 연결 상태여야 함.

```javascript
// [테스트 C] 실제 히스토리 요청 (현재 시간 기준 24시간)
window.postMessage({
  source: 'pq-content',
  type: 'ws-send',
  payload: '42["loadHistoryPeriod",{"asset":"#EURUSD_otc","index":' + (Math.floor(Date.now()/1000) * 100 + 42) + ',"time":' + Math.floor(Date.now()/1000) + ',"offset":86400,"period":60}]'
}, '*')
```

**기대 결과**: PO 서버가 `42["updateHistoryNewFast",...]`로 응답 → Tampermonkey가 브릿지로 전달 → interceptor → parser → DB

### 결과 확인 방법

```javascript
// 서버 헬스 체크
fetch('http://localhost:3001/health').then(r => r.json()).then(console.log)

// DB에 저장된 캔들 확인
fetch('http://localhost:3001/api/candles?symbol=EURUSD-OTC&limit=5').then(r => r.json()).then(console.log)
```
