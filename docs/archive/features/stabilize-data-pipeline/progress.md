# Data Pipeline Stabilization — Progress

**최종 업데이트:** 2026-02-15

## (2026-02-15) 전체 작업 완료

### 완료 항목

**WS-A: DataSender 통계/재시도 로직 정확화 + 운영 UX**
- `bulkRetryCount` 이중 카운팅 버그 수정 (attempt > 0 시 정확히 1회만 증가)
- `DRAIN_SENDER_RETRY_QUEUE` 메시지 타입 추가 (types + handler)
- DBMonitorDashboard에 "Drain Queue" 버튼 + 재시도 큐/카운트 표시 추가
- `_resetForTesting()` 메서드 추가, 5개 신규 테스트

**WS-B: CandleDataset 업서트 키 정리**
- Option 2 채택: source = 마지막 업데이트 소스 (informational)
- Dexie v10: candleDatasets에서 미사용 source 인덱스 제거
- JSDoc으로 upsert 키 정책 문서화, 1개 신규 테스트

**WS-C: Tick 파이프라인 성능/메모리 최적화**
- `tickHistory` 중복 배열 제거 → `ticksByTicker`에서 합성
- `notifyBackground()` 퍼-티커 throttle 추가 (default 500ms)
- 비활성 ticker 정리 (5분 비활성 → 버퍼 삭제)
- Observability: `notifySent`, `notifyThrottled`, `activeTickers`, `totalTicksInMemory`
- 4개 신규/수정 테스트

**WS-D: CI 강화**
- `format:check` 스텝 CI에 추가

### 테스트 결과
- 전체: 907 tests passed (46 suites), 0 failures
- TypeScript: 0 errors
- Build: success
- Backtest smoke: 56 passed

### 변경 파일 요약
| 파일 | 변경 |
|------|------|
| `src/lib/data-sender.ts` | retryCount 수정, `_resetForTesting()` 추가 |
| `src/lib/data-sender.test.ts` | 5개 테스트 추가 |
| `src/lib/db/index.ts` | CandleDataset JSDoc, Dexie v10 |
| `src/lib/db/candle-dataset.test.ts` | 1개 테스트 추가 |
| `src/lib/types/index.ts` | `DRAIN_SENDER_RETRY_QUEUE` 타입 추가 |
| `src/content-script/app/message-handler.ts` | drain 핸들러 추가 |
| `src/content-script/candle-collector.ts` | notify throttle, tickHistory 제거, stale cleanup |
| `src/content-script/candle-collector.test.ts` | 4개 테스트 추가/수정 |
| `src/side-panel/components/DBMonitorDashboard.tsx` | Drain Queue 버튼, 재시도 표시 |
| `.github/workflows/ci.yml` | format:check 추가 |

### 다음 행동
- 커밋 & 푸시
- (선택) A-3: retryQueue IndexedDB 영속화
- (선택) D-2: Playwright basic CI 추가
