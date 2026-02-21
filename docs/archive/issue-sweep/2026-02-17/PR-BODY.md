# Issue sweep (2026-02-17)

이번 PR은 과거 이슈를 현재 main 기준으로 전수 검토하고, 이슈별로 1커밋 원칙으로 정리합니다.

- **Merge policy: DO NOT SQUASH** (keep commits per issue)

## Summary by issue

### CLOSE (resolved, auto-close on merge)
- **#50**: CLOSE — 메모리 누수 3가지 모두 해결됨 (messageBuffer 미사용, candle FIFO 500, connections Map 제거)
  - Evidence: commits 9030c79, e966a22, 817a43c
  - Changes: audit doc only
- **#54**: CLOSE — Content Script 관심사 분리 완료 (PR #96, 559→30줄, 5모듈 분리)
  - Evidence: commit 670e0b3, PR #96 merged
  - Changes: audit doc only
- **#57**: CLOSE — Candle 벌크 인서트 bulkPut 최적화 완료 (PR #91, 복합키 마이그레이션)
  - Evidence: commit 6944222, PR #91 merged
  - Changes: audit doc only
- **#58**: DO-NOW — README.md 신규 작성 (프로젝트 개요, 설치 가이드, 아키텍처)
  - Changes: README.md created + audit doc
- **#70**: CLOSE — SQLite 백테스트 파이프라인 구현 완료 (backtest-from-sqlite.ts 853줄)
  - Evidence: PR #65 merged (feat/63)
  - Changes: audit doc only
- **#71**: CLOSE — 데이터 정제 파이프라인 완료 (feat/63 머지, tick-resampler, payout filter)
  - Evidence: PR #65, PR #104 merged
  - Changes: audit doc only

### UPDATE (scope/status updated, issues remain open)
- **#49**: UPDATE — any 타입 193→241건 증가, 91% 테스트 파일 집중, 스코프 재정의 필요
- **#52**: UPDATE — Demo Mode 안전 체크 ~50% 구현 (DOM 폴링 있음, WebSocket 검증 없음)
- **#53**: UPDATE — 테스트 커버리지 34%→60.19% 상승, 목표 80% 미달
- **#55**: UPDATE — console.log 501건, 로거 채택률 2.5%
- **#56**: UPDATE — 에러 처리 혼재, POError 채택 7.5%, Result<T> 미활용
- **#59**: UPDATE — selector-resolver 폴백만 구현, 헬스체크/알림 3개 항목 미완
- **#60**: UPDATE — app/ DI 패턴 도입, 나머지 글로벌 상태 미전환
- **#72**: UPDATE — V3 전략 코드 존재하나 엔진 미등록
- **#73**: UPDATE — 피드백 루프 인프라만 존재 (~40%)

## Closing keywords
- Closes #50
- Closes #54
- Closes #57
- Closes #58
- Closes #70
- Closes #71

## Quality gates
- `npm run lint`: ✅ 0 errors (343 warnings)
- `npm test` (CI): ✅ 916/916 tests passed
- `npm run build`: ✅ successful
- `tsc --noEmit`: ✅ clean

## Notes / Follow-ups
- UPDATE 이슈(#49, #52, #53, #55, #56, #59, #60, #72, #73)는 이슈 본문/코멘트로 스코프 갱신 필요
  - 각 감사 문서(`docs/issue-sweep/2026-02-17/gh-<N>.md`)에 갱신 제안사항 상세 기록
- 모든 감사 문서는 `docs/issue-sweep/2026-02-17/` 에 위치
- 이슈 스냅샷: `docs/issue-sweep/2026-02-17/issues.json`, `issues.md`

https://claude.ai/code/session_01P626ehoGQchEhvM36QMghQ
