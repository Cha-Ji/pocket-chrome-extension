# Task Plan - Auto Miner Click Logic Fix (PO-15)

## 🎯 목표
Auto Miner의 자산 선택(Asset Selection) 클릭 동작 실패 원인을 규명하고, Playwright 기반 E2E 테스트 환경 구축을 통해 검증 가능한 해결책 마련

## 🚨 문제 상황
- `Start Auto Mining` 시 자산 목록은 열리지만, 특정 자산 클릭이 묵묵부답.
- `click()` 및 `MouseEvent` dispatch 모두 실패 추정.
- 단순 DOM 조작으로는 최신 SPA 프레임워크의 이벤트 핸들링을 뚫지 못하고 있음.

## 📋 작업 목록

### Phase 1: 진단 도구 강화
- [ ] `diagnostics.ts` 작성: 클릭 시도 시 이벤트 리스너가 반응하는지 확인하는 스크립트.
- [ ] 브라우저 콘솔에서 직접 실행 가능한 'Manual Trigger Snippet' 제공.

### Phase 2: 고급 클릭 기법 도입
- [ ] **좌표 기반 클릭 (Coordinates Click)**: `getBoundingClientRect()`로 위치를 찾아 `document.elementFromPoint(x, y).click()` 시도.
- [ ] **React Props 접근**: DOM 요소에 붙은 `__reactEventHandlers...` 또는 `__vue...` 속성을 찾아 핸들러 직접 호출.
- [ ] **Focus & Enter**: `focus()` 후 `Enter` 키보드 이벤트 전송.

### Phase 3: Playwright 테스트 환경
- [ ] `tests/e2e/auto-miner.spec.ts` 작성.
- [ ] 실제 PO 데모 계정으로 로그인하여 클릭 동작 자동화 테스트.

## 📅 일정
- 2026-02-03: 진단 및 고급 클릭 기법 적용
