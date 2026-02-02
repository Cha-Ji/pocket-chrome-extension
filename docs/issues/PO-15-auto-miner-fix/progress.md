# Progress - Auto Miner Click Logic Fix (PO-15)

## 2026-02-03
- [x] `src/lib/dom-utils.ts` 생성: React Hack 및 좌표 기반 클릭 로직 구현.
- [x] `src/lib/dom-utils.ts` 고도화: `alist__item` 내의 `.alist__link` 자식 요소까지 React Props 탐색 범위를 확장.
- [x] `src/content-script/payout-monitor.ts` 고도화: `openAssetPicker` 및 `closeAssetPicker`에도 `forceClick` 적용, 탐색 타겟 정교화 (`.pair-number-wrap`).
- [x] `switchAsset` 로직 안정화: 재시도 메커니즘 및 대기 시간 조정.
- [ ] Playwright 테스트 환경 구축 및 실검증.
