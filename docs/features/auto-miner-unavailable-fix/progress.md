# Progress: Auto Miner 자산 전환 실패 수정

## 2026-02-08

### 세션 시작
- 사용자 제공 로그 분석 완료
- 4가지 버그 원인 식별
- task_plan.md, findings.md 작성

### Bug 1~4 수정 완료
- `payout-monitor.ts`: tryReloadInactive → 폴링 기반 + waitForCondition 유틸 추가
- `payout-monitor.ts`: switchAsset → 피커 닫기 후 2초 대기 + 일시적 unavailable 재확인
- `auto-miner.ts`: consecutiveUnavailable → isAssetUnavailable 기반 실제 unavailable만 카운트
- `auto-miner.ts`: CONSECUTIVE_UNAVAILABLE_THRESHOLD 3→5 상향
- 빌드 성공 확인
