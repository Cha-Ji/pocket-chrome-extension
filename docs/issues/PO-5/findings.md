# Findings - [Panel] 실시간 손익(P/L) 그래프 및 통계 카드 (PO-5)

## 📅 2026-02-01

### 디자인 고려 사항
- Pocket Option의 메인 테마 색상(#2a2e39, #00b073, #ff5a5f)을 적극 활용.
- 제한된 Side Panel 너비(약 300px~400px)를 고려하여 세로형 레이아웃 최적화 필요.

### 라이브러리 선택
- 복잡한 라이브러리(Recharts 등)보다는 번들 크기를 위해 가벼운 Custom SVG/Canvas 기반 그래프 고려.
