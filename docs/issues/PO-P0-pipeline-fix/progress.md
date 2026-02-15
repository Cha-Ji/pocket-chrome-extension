# P0 Bug Fix Progress

## 2026-02-15 — P2 구조 개선 완료

### 완료 항목
- **P2-1**: GET_DB_MONITOR_STATUS에 candleDatasets 메타 추가 + DBMonitorDashboard UI 섹션
- **P2-2**: Leaderboard에 절대 점수(A-F grade) 통합 — calculateScore() 연동
- **P2-3**: CI workflow에 format:check 스텝 추가

### P2 파일 변경 목록
| 파일 | 변경 유형 |
|------|----------|
| `src/content-script/app/message-handler.ts` | P2-1: CandleDatasetRepository.getAll() 추가 |
| `src/side-panel/components/DBMonitorDashboard.tsx` | P2-1: Candle Datasets 섹션 추가 |
| `src/lib/backtest/leaderboard-types.ts` | P2-2: absoluteScore/grade 필드 추가 |
| `src/lib/backtest/leaderboard.ts` | P2-2: calculateScore() 호출, grade 리포트 |
| `src/side-panel/components/Leaderboard.tsx` | P2-2: GradeBadge 컴포넌트 + 상세 표시 |
| `.github/workflows/ci.yml` | P2-3: format:check 스텝 추가 |

### 테스트 결과
- 전체: 855 tests passed (45 suites)
- TypeScript: 0 errors

---

## 2026-02-15 — P0 버그 수정 + P1 고도화 완료

### 완료 항목
- **P0-1**: TickRepository.bulkPut() — 기존 코드 검증, 이미 정상
- **P0-2**: handleNewSignal() onlyRSI → evaluateSignalGates() 교체 (7 tests 추가)
- **P0-3**: settleTrade() clearTimeout + 즉시 delete (2 tests 추가)
- **P0-4**: WS_PRICE_UPDATE → RELAY_MESSAGE_TYPES 등록 + 500ms throttle (7 tests 추가)
- **P1-1**: candleCount 델타→총량 수정 (3 tests 추가)
- **P1-2**: sendResponse .catch 추가 (background + content-script) (1 test 추가)
- **P1-3**: validateConfigUpdate() 순수 함수 + SET_CONFIG_V2 통합 (9 tests 추가)

### P0/P1 파일 변경 목록
| 파일 | 변경 유형 |
|------|----------|
| `src/content-script/app/trade-lifecycle.ts` | P0-2: evaluateSignalGates 사용, P0-3: clearTimeout |
| `src/content-script/app/trade-lifecycle.test.ts` | 7 tests (P0-2) + 2 tests (P0-3) 추가 |
| `src/lib/port-channel.ts` | P0-4: WS relay types + throttle |
| `src/lib/port-channel.test.ts` | **신규** — 7 tests |
| `src/content-script/app/ws-handlers.ts` | P1-1: candleCount 총량 사용 |
| `src/lib/db/candle-dataset.test.ts` | **신규** — 3 tests |
| `src/background/index.ts` | P1-2: sendResponse .catch |
| `src/content-script/app/message-handler.ts` | P1-2: sendResponse .catch, P1-3: validateConfigUpdate |
| `src/content-script/app/message-handler.test.ts` | 9 tests (P1-3) + 1 test (P1-2) 추가 |

### 테스트 결과
- 전체: 855 tests passed (45 suites)
- 신규: 27 tests 추가
- TypeScript: 0 errors
