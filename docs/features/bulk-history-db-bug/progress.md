# Progress

## 2026-02-08 (10) - Fix 6: TM 의존성 제거 — Extension 내장 WS 후킹 활성화

- **실환경 테스트 결과 (Fix 5)**: `Asset ID tracked` 로그 전혀 없음 → WS 수신 메시지 자체가 interceptor에 도달하지 않음
- **근본 원인**: TM(Tampermonkey) bridge가 동작하지 않음. interceptor의 `injectScript()`가 `[PO-16]`으로 비활성화 → WS 후킹 스크립트 미주입
- **Fix 6 적용**:
  1. `inject-websocket.js`: TM 스크립트와 동일한 수준으로 완전 재작성 (1.81KB → 3.04KB)
     - onmessage setter 후킹 추가
     - ws.send() 후킹 → asset ID 캡처 (`ws-asset-change`)
     - Extension → WS 전송 핸들러 (`ws-send`)
     - Socket.IO Binary Placeholder 처리
     - decodeData/extractPayload 메시지 디코딩
  2. `websocket-interceptor.ts`: `injectScript()` 활성화 — `<script>` 태그로 Main World에 주입
- 빌드 성공 (8.62s), 테스트 25/25 통과
- **다음 행동**: 익스텐션 리로드 후 실환경 테스트
  - `[PO-Spy] 🟢 Extension WS Hook Started` → 주입 성공
  - `[PO] [WS] Main World Bridge Connected` → bridge 연결
  - `Asset ID tracked (stream):` 또는 `Asset ID tracked (raw):` → WS 수신에서 ID 캡처
  - TM은 이제 불필요 (비활성화해도 됨)

## 2026-02-08 (9) - Fix 5: 수신 WS 메시지에서 Asset ID 자동 추적

- 근본 원인 3가지 발견 + interceptor trackAssetFromMessage() 추가
- 실환경 실패: WS 수신 메시지 자체가 interceptor에 미도달 → Fix 6으로 이어짐

## 2026-02-08 (8) - Fix 4 실환경 테스트 실패

- TM 스크립트 업데이트 + 빌드 후 실환경 테스트 수행
- **결과: 여전히 실패** — 정확한 실패 로그 미수집 (다음 세션에서 상세 진단 필요)
- 가능한 원인:
  1. TM ws.send() 후킹이 동작하지 않음 → `ws-asset-change` 이벤트 미발생 → fallback ID 사용
  2. TM 후킹은 동작하나 PO가 `changeSymbol`을 WS가 아닌 REST로 처리
  3. Asset ID는 올바르지만 send 경로 자체가 동작하지 않음 (TM send handler 미수신)
  4. PO 서버가 응답하지만 TM onmessage 후킹에서 캐치 못함
- **다음 행동**: 브라우저 콘솔에서 단계별 수동 진단 필수
  - `window._ws_instances` 상태 확인
  - 수동 ws.send() 테스트
  - TM 로그 확인 (`[TM-Spy]` 접두사)
  - 콘솔 로그에서 `Asset ID (WS tracked)` vs `FALLBACK` 확인

## 2026-02-08 (7) - WS 히스토리 타임아웃 근본 원인: Asset ID 오류 (Fix 4)

- 자산 전환 Fix 3b 적용 후 전환은 성공하나, WS 히스토리 요청이 모든 자산에서 타임아웃
- **근본 원인 발견**: `resolveAssetId()` fallback이 display name → asset ID 변환 시 오류
  - "Apple OTC" → `#APPLE_otc` (❌ 잘못된 ID, PO는 `#AAPL_otc` 형식 사용)
  - PO 서버가 존재하지 않는 asset ID 요청을 묵살 → 응답 없음 → 타임아웃
- **원인 2**: TM 스크립트가 `ws.send()`를 후킹하지 않아 발신 `changeSymbol` 이벤트의 real asset ID 미캡처
- Fix 4 적용:
  1. TM `ws.send()` 후킹 → 발신 메시지에서 `"asset"` 필드 캡처 → `ws-asset-change` 이벤트로 전달
  2. Interceptor `ws-asset-change` 핸들러 추가 → `lastAssetId` 업데이트
  3. `resolveAssetId()` 3단계 체인: WS tracked → DOM 추출 → fallback(WARNING 로깅)
- 빌드 성공, 테스트 25/25 통과
- **다음 행동**: TM 스크립트 업데이트 후 실환경 테스트. 콘솔 로그에서 `Asset ID (WS tracked)` 또는 `FALLBACK` 확인

## 2026-02-08 (6) - 자산 전환: 오버레이 클릭 리로드 방식 전환 (Fix 3b)

- Fix 3 접근(15초 passive 대기) 실패 — .asset-inactive가 "다시 로드하려면 클릭" 상태
- 핵심 발견: .current-symbol은 정상 업데이트 → 전환 성공, 차트만 미로딩 상태
- Fix 3b: dismissStaleInactive/detectAssetUnavailable/tryReloadInactive 삭제 (106줄 제거)
  - 전환 확인 후 오버레이 있으면 클릭 1회 → 무조건 성공 반환
  - WS 타임아웃이 실제 가용성 판단

## 2026-02-08 (5) - 자산 전환 unavailable 오탐 Fix 3 적용

- 근본 원인 분석: 타이밍 부족(4s) + 스코프 부재(전체 DOM) + 조기 클릭 간섭
- Fix 3 적용 (`payout-monitor.ts`):
  1. 고정 대기(2s+2s) → `waitForCondition(15s, 1s)` 폴링으로 교체
  2. `.asset-inactive` 탐색을 차트 영역(`.chart-item`/`.chart-block`)으로 스코프 제한
  3. `getBoundingClientRect()` 크기 0 체크 추가
  4. `findChartInactiveEl()` 헬퍼 추출 → `tryReloadInactive`, `dismissStaleInactive` 공유
  5. 디버그 로깅 강화 (rect 크기, 부모 클래스)
- 빌드 성공 (8.66s), 테스트 25/25 통과
- **다음 행동**: Miner 실행하여 자산 전환 성공 → loadHistoryPeriod → DB 저장 E2E 검증

## 2026-02-08 (4) - 파이프라인 독립 검증 성공!

- 콘솔에서 `window.postMessage`로 가짜 히스토리 전송 → **전체 파이프라인 정상 동작 확인**
- 확인된 로그 순서:
  1. `[WS Parser] ✅ History parsed: 2 candles from event 'updateHistoryNewFast'`
  2. `[PO] [WS-Interceptor] Candle History Detected! Count: 2`
  3. `[PO] [WS] History/Bulk Captured: 2 candles for #EURUSD_otc`
  4. `[PO] 📜 History Captured: 2 candles for #EURUSD_otc`
  5. `[PO] [DataSender] ✅ Bulk saved: 2 candles (symbol: #EURUSD_OTC)`
- **결론**: Fix 1 (interceptor VALID_PARSED_TYPES) + Fix 2 (parser Socket.IO prefix) 실환경 검증 완료
- 남은 문제: Miner 자산 전환 실패 (`.asset-inactive` 감지 오류) → 별도 이슈

## 2026-02-08 (3) - 콘솔 파이프라인 독립 검증 가이드 작성

- 사용자 피드백: OTC 자산은 개장 상태 → 가설 A(시장 시간) 기각
- 자산 전환 실패는 별도 버그(`.asset-inactive` 감지 오류)로 분리
- 파이프라인 독립 검증 가이드 작성 (findings.md에 추가)

## 2026-02-08 (2) - 실환경 테스트 → 자산 전환 단계에서 실패

- Fix 1 + Fix 2 적용된 빌드로 PO 데모 환경에서 Miner 실행
- **결과**: 파이프라인 검증 불가 — WS 히스토리 요청 단계에 도달하지 못함
- 원인: 개장된 OTC 자산인데도 `.asset-inactive` 오버레이로 이용 불가 감지
  - `detectAssetUnavailable()` Pattern 1 오탐 가능성 → 별도 이슈로 분리
- 파이프라인 Fix 1/Fix 2와는 무관한 별개 문제

## 2026-02-08 (1) - 원인 분석 완료, 코드 수정

- 전체 파이프라인 6개 파일 추적 (TM → interceptor → parser → index.ts → data-sender → server)
- 근본 원인 2가지 확인:
  1. interceptor의 `typeof parsed.type !== 'string'` 체크가 `binary_payload`를 유효 타입으로 오인
  2. parser의 JSON.parse가 Socket.IO prefix(`42[...]`)를 처리 못함
- 실시간 데이터는 DOM 경유로 WS 파이프라인과 무관하게 정상 동작 확인
- Fix 1 적용: `VALID_PARSED_TYPES` Set으로 유효 타입 체크, `binary_payload`는 파서에 재전달
- Fix 2 적용: `parse()` 진입부에 `^\d+[-]?([\[{].*)` regex로 Socket.IO prefix 제거
- 테스트 5케이스 추가: `42[...]` prefix, `451-[...]` prefix, history object/array 형식
- 빌드 성공, 테스트 25/25 통과
