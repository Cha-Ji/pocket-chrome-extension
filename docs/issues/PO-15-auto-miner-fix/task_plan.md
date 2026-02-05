# Task Plan - Asset Switching Logic Verification (PO-15)

## 🎯 목표
`PayoutMonitor.switchAsset` 로직의 결함(특히 자산 목록 오픈 후 실제 항목 클릭 단계)을 해결하고, 자동 자산 전환의 안정성을 100% 확보한다.

## 📋 작업 목록

### Phase 1: 원인 분석 및 가설 설정
- [ ] 현재 `switchAsset` 로직 흐름 재검토 (Open -> Wait -> Find -> Click).
- [ ] **가설 1**: `forceClick`이 React 핸들러를 찾았지만, 이벤트 객체(`nativeEvent`) 구성이 부족하여 React가 거부했을 가능성.
- [ ] **가설 2**: `alist__item`이 아닌 `alist__link`에 직접 이벤트를 보내야 함 (현재 보완되었으나 재검증 필요).
- [ ] **가설 3**: 자산 목록이 열린 후 렌더링 지연이 800ms보다 길 수 있음.

### Phase 2: 검증 코드 작성 (Standalone Test)
- [ ] `tests/manual/test-switch.ts` 작성: 익스텐션 로직과 무관하게 콘솔에서 즉시 자산 전환을 시도하는 스크립트.
- [ ] 다양한 클릭 방식(React Hack, Human Simulation, Coordinate Click)을 순차적으로 시도하는 'Universal Clicker' 작성.

### Phase 3: 로직 수정 및 자체 검증
- [x] 검증된 방식을 `payout-monitor.ts` 및 `dom-utils.ts`에 반영.
- [x] 버전 `0.1.3`으로 빌드 후 팡 팡님께 수동 검증 요청.
- [x] v0.2.0 최종 빌드 및 라이브 테스트 (자산 순회 루프 정상 확인)

## 📅 일정
- 2026-02-03 07:30: 검증 스크립트 배포 및 결과 확인
- 2026-02-04 13:00: 최종 완료 (PO-15 Close)
