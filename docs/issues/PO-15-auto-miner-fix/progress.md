# Progress - Auto Miner Click Logic Fix (PO-15)

## 2026-02-03
- [x] `src/lib/dom-utils.ts` 생성: React Hack 및 좌표 기반 클릭 로직 구현.
- [x] `src/lib/dom-utils.ts` 고도화: `alist__item` 내의 `.alist__link` 자식 요소까지 React Props 탐색 범위를 확장.
- [x] `src/content-script/payout-monitor.ts` 셀렉터 수정: 수익률 요소가 `.alist__profit`에서 `.alist__payout`으로 변경됨을 확인 후 반영.
- [x] `fetchPayouts` 로직 개선: 페이아웃 데이터를 찾지 못할 경우 더 적극적으로 picker를 열고 대기하도록 수정.
- [x] `openAssetPicker` 시각적 검증 강화: 단순히 존재 여부가 아닌 실제 뷰포트 내 위치와 가시성을 체크.
