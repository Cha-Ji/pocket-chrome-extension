# Task Plan - Fix Side Panel Crash (PO-14 REVISIT)

## 🎯 목표
사이드 패널 크래시(`TypeError: ... toFixed`) 완전 제거 및 재발 방지

## 🚨 문제 상황
- `AutoTradePanel` 외에 `Dashboard`, `SignalPanel`, `StatusCard` 등 다른 컴포넌트에도 `.toFixed()` 호출이 남아있음.
- 부분적인 수정으로는 해결되지 않음.
- **모든** 컴포넌트의 `.toFixed()`를 안전한 헬퍼 함수(`formatNumber` 등)로 교체해야 함.

## 📋 작업 목록

### Phase 1: 전수 조사 및 수정
- [ ] `src/side-panel/components/Dashboard.tsx` 수정
- [ ] `src/side-panel/components/SignalPanel.tsx` 수정
- [ ] `src/side-panel/components/StatusCard.tsx` 수정
- [ ] `src/side-panel/App.tsx` (핸들러 내부) 수정
- [ ] 그 외 `src/side-panel/**/*.tsx` 전체 검색 및 수정

### Phase 2: 검증
- [ ] `grep` 명령어로 `.toFixed`가 완전히 사라졌는지(또는 안전하게 감싸졌는지) 확인
- [ ] 빌드 테스트

### Phase 3: 안전 장치 강화
- [ ] 향후 `.toFixed` 직접 사용을 금지하는 린트 규칙 제안 (옵션)
