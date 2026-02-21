# Side Panel UI 아키텍처

**역할**: React 기반 사용자 인터페이스 (상태 표시, 거래 제어, 로그/리포트)

## 핵심 정보
- React + Tailwind CSS
- Chrome Side Panel API 사용
- Background와 `chrome.runtime.sendMessage`로 통신

## 하위 모듈

| 모듈 | 설명 |
|------|------|
| controls | 자동매매 시작/중지, 전략 선택, 파라미터 조정 |
| logs | 거래 로그, 에러 히스토리 표시 |
| reports | 성과 리포트, 백테스트 결과, 수익 곡선 |

## 제약사항
- Side Panel은 독립 컨텍스트 → Background 경유 필수
- 실시간 업데이트는 메시지 리스너 기반

## 관련 소스
- `src/side-panel/App.tsx` (진입점)
- `src/side-panel/components/` (UI 컴포넌트)
