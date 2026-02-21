# Navigator 기능

**역할**: 관심 종목 순회 및 조건 발생 시 자산 자동 이동

## 핵심 설계
- 이동 시나리오: A 감시 → B 신호 발생 → B 이동 → 매매
- 자산 선택 UI 제어 또는 URL 파라미터 조작
- React Router 강제 리로딩 방지 고려

## 상태
- 설계 단계 (미구현)
- 선행 조건: 실시간 데이터 수집 안정화

## 관련 소스
- `src/content-script/executor.ts` (자산 전환 로직)
- `src/lib/types/index.ts` (DOMSelectors)
