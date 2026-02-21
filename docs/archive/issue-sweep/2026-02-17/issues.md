# Issue Sweep Snapshot — 2026-02-17

전수 검토 대상 이슈 목록 (GitHub Issues, 2026-02-17 기준)

## Open Issues (13)

| # | Title | Labels | URL |
|---|-------|--------|-----|
| 49 | any 타입 193개 제거 - TypeScript 타입 안전성 강화 | refactor, p1 | https://github.com/Cha-Ji/pocket-chrome-extension/issues/49 |
| 50 | 메모리 누수 - WebSocket 버퍼/캔들 맵 무한 성장 | bug, performance, p2 | https://github.com/Cha-Ji/pocket-chrome-extension/issues/50 |
| 52 | Demo Mode 안전 체크 강화 | enhancement, security, p2 | https://github.com/Cha-Ji/pocket-chrome-extension/issues/52 |
| 53 | 테스트 커버리지 확대 - 현재 ~34% → 목표 80% | enhancement, testing, p2 | https://github.com/Cha-Ji/pocket-chrome-extension/issues/53 |
| 55 | console.log 490건 정리 - 구조화된 로깅 시스템 적용 | refactor, p2 | https://github.com/Cha-Ji/pocket-chrome-extension/issues/55 |
| 56 | 에러 처리 패턴 통일 (throw/return/silent 혼재 정리) | refactor, p2 | https://github.com/Cha-Ji/pocket-chrome-extension/issues/56 |
| 58 | README.md 작성 | documentation, enhancement, p3 | https://github.com/Cha-Ji/pocket-chrome-extension/issues/58 |
| 59 | DOM 셀렉터 자동 검증 및 알림 시스템 | enhancement, p3 | https://github.com/Cha-Ji/pocket-chrome-extension/issues/59 |
| 60 | 글로벌 뮤터블 상태 → 상태 관리 시스템 도입 | refactor, p3 | https://github.com/Cha-Ji/pocket-chrome-extension/issues/60 |
| 70 | SQLite 수집 데이터 기반 백테스트 리포트 | feat | https://github.com/Cha-Ji/pocket-chrome-extension/issues/70 |
| 71 | 데이터 정제 파이프라인 구축 — feat/63 머지 | feat, p0 | https://github.com/Cha-Ji/pocket-chrome-extension/issues/71 |
| 72 | 백테스트 전략 고도화 — V3 추세 전략 통합 | feat, p1 | https://github.com/Cha-Ji/pocket-chrome-extension/issues/72 |
| 73 | 백테스트 결과 → 실전 전략 피드백 루프 구축 | feat, p1 | https://github.com/Cha-Ji/pocket-chrome-extension/issues/73 |

## Closed Issues (2)

| # | Title | Labels | URL |
|---|-------|--------|-----|
| 54 | Content Script 관심사 분리 | refactor, p2 | https://github.com/Cha-Ji/pocket-chrome-extension/issues/54 |
| 57 | Candle 데이터 벌크 인서트 성능 최적화 | enhancement, performance, p3 | https://github.com/Cha-Ji/pocket-chrome-extension/issues/57 |

## Decision Summary

| # | Decision | Rationale |
|---|----------|-----------|
| 49 | UPDATE | any 수 241개로 증가, 스코프 재정의 필요 |
| 50 | CLOSE | 3가지 메모리 누수 모두 해결됨 |
| 52 | UPDATE | ~50% 구현됨, WebSocket 검증 미구현 |
| 53 | UPDATE | 커버리지 60.19%로 상승, 수치/목표 갱신 필요 |
| 54 | CLOSE | PR #96으로 완료됨 |
| 55 | UPDATE | ~501건 여전히 존재, 로거 모듈 활용률 2.5% |
| 56 | UPDATE | 패턴 혼재 지속, POError 채택률 7.5% |
| 57 | CLOSE | bulkPut 최적화 완료 (PR #91) |
| 58 | DO-NOW | README.md 작성 |
| 59 | UPDATE | selector-resolver 구현됨, 헬스체크/알림 미구현 |
| 60 | UPDATE | content-script/app/ 컨텍스트 패턴 도입됨, 나머지 미완 |
| 70 | CLOSE | backtest-from-sqlite.ts 구현 완료 |
| 71 | CLOSE | feat/63 머지 + tick-resampler 구현 완료 |
| 72 | UPDATE | V3 전략 코드 존재하나 엔진에 미등록 |
| 73 | UPDATE | 인프라만 존재, 자동화 연결 미구현 |
