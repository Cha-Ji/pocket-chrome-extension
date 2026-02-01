# Task Plan - [Panel] 실시간 손익(P/L) 그래프 및 통계 카드 (PO-5)

## 🎯 목표
Side Panel의 거래 성과 대시보드를 더 직관적이고 시각적으로 풍부하게 고도화하여 사용자가 한눈에 상태를 파악할 수 있게 함.

## 📋 작업 목록
- [x] 기존 `StatusCard` 및 `SignalPanel` 디자인 검토
- [ ] `Dashboard.tsx` 신규 컴포넌트 생성
- [ ] 실시간 승률/손익 그래프 컴포넌트 구현 (SVG 기반 가벼운 차트)
- [ ] 자산별 성과 통계 테이블 UI 구현
- [ ] `App.tsx` 내 'Status' 탭을 'Dashboard'로 교체 및 통합
- [ ] PR 생성 및 Merge (자동화 프로세스 테스트)
