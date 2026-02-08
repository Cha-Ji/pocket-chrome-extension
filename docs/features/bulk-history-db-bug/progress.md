# Progress

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
