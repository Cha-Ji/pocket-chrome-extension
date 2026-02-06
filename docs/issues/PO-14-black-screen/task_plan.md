# Task Plan - Side Panel Black Screen Fix (PO-14)

## 🎯 목표
확장 프로그램 사이드 패널이 검은 화면으로 표시되는 오류를 해결하고 정상 작동 복구

## 📊 현상
- 사이드 패널 로드 시 검은 화면만 표시됨 (Content 미렌더링)
- `inject-websocket.js` 수정 후 발생
- 빌드는 성공하지만 런타임 에러 추정

## 📋 작업 목록

### Phase 1: 원인 분석
- [ ] 사이드 패널 콘솔 로그 확인 (디버깅)
- [ ] `App.tsx` 렌더링 로직 검토
- [ ] 최근 변경된 `AutoMinerControl` 및 `App.tsx` 통합 부분 검토

### Phase 2: 수정 및 복구
- [ ] `App.tsx`의 조건부 렌더링 로직 수정
- [ ] 에러 경계(Error Boundary) 추가 (선택사항)
- [ ] 빌드 및 테스트

### Phase 3: 검증
- [ ] 확장 프로그램 로드 테스트
- [ ] 사이드 패널 정상 표시 확인
- [ ] Auto Miner 기능 동작 확인
