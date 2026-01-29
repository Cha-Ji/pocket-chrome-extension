# 작업 계획

## 단계별 체크리스트

- [x] 조사 및 범위 확정
- [x] 구현 계획 수립
- [~] 코드 변경
  - [x] 프로젝트 기반 (package.json, tsconfig, vite)
  - [x] Chrome Extension 구조 (manifest, background, content script)
  - [x] Side Panel UI (React + Tailwind)
  - [x] 데이터베이스 (Dexie.js)
  - [x] 기술 지표 (RSI, BB, MA, MACD)
  - [ ] DOM 셀렉터 (로그인 필요)
  - [ ] 자동매매 로직 (로그인 필요)
- [~] 검증/테스트
  - [x] 유닛 테스트 작성
  - [ ] E2E 테스트 (로그인 필요)
- [ ] 마무리 정리

## 다음 단계 (로그인 후)

1. **DOM 셀렉터 발견**
   - Chrome DevTools로 사이트 분석
   - 가격, 버튼, 잔액 등 핵심 요소 셀렉터 확인
   - `src/lib/types/index.ts`의 `DEFAULT_SELECTORS` 업데이트

2. **데이터 수집 검증**
   - MutationObserver 동작 확인
   - 가격 데이터 정확성 테스트

3. **자동매매 로직 구현**
   - 전략 기반 진입 조건 로직
   - CALL/PUT 버튼 클릭 시뮬레이션
   - 리스크 관리

4. **E2E 테스트 완성**
   - 실제 사이트에서 데이터 수집 테스트
   - (데모 계정으로) 매매 시뮬레이션 테스트
