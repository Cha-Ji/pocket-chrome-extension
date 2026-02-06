## 변경 요약
<!--
3줄 이내로 핵심만. 차지님이 1분 안에 이해할 수 있도록 한국어로 작성
예시:
- WebSocket 파서에 null 체크 추가하여 크래시 방지
- 영향범위: backtest 모듈만 (API 변경 없음)
-->



## 구현 상세 (LLM Context)
<!--
다른 LLM이 나중에 이 PR 컨텍스트 이해할 수 있도록 영어로 상세 작성
아래 구조 참고하여 작성:
-->

**Key changes:**
-

**Technical details:**
- Files modified:
- Dependencies:
- Breaking changes:

**Implementation notes:**
-



## 테스트 결과
- [ ] 유닛 테스트 통과 (N/N)
- [ ] 로컬 수동 테스트 완료
- [ ] 관련 모듈 회귀 테스트 확인



## 수동 검증 필요
<!--
차지님이 직접 확인해야 하는 항목만 작성.
자동 테스트로 커버되면 이 섹션 삭제.

표시 기준:
- 작성: 실제 API 연동, DB 마이그레이션, 성능 측정, 실제 거래소 연결 필요
- 삭제: 유닛 테스트로 충분한 경우

예시:
- [ ] 실제 거래소 WebSocket 연결하여 10분 이상 안정성 확인
- [ ] Chrome DevTools Network 탭에서 메시지 파싱 에러 로그 없는지 확인
-->



## 관련 이슈
<!--
Closes #PO-17
또는
Relates to #PO-17, #PO-18
-->



---
**Reviewed by**: <!-- LLM 에이전트명 (Claude Opus 4.5 / Cursor / Gemini 등) -->
**Merged by**: 차지

---

<!--
===================
LLM 작성 가이드
===================

1. "변경 요약": 한국어 3줄 이내, 비개발자도 이해 가능하게
2. "구현 상세": 영어로 기술적 세부사항, 파일명/함수명/라이브러리 명시
3. "수동 검증 필요": 자동 테스트로 안 되는 것만 (예: 실제 API 연동)
4. 간단한 변경(typo, 포맷팅)도 "구현 상세"는 간략하게라도 작성

타입별 작성 예시:

[fix 타입 PR]
변경 요약:
- WebSocket 크래시 원인 수정 (null 체크 누락)
- 영향: backtest 모듈만, API 변경 없음

구현 상세:
**Key changes:**
- Added optional chaining to message.data.candles[0].timestamp
- Refactored parseWebSocketMessage() for early return on invalid data

**Technical details:**
- Files: src/utils/dom-utils.js, src/parsers/websocket-parser.js
- Dependencies: None
- Breaking changes: None

[feat 타입 PR]
변경 요약:
- 전략 성과 리더보드 UI 추가
- 승률/MDD/샤프지수 기준 정렬 지원

구현 상세:
**Key changes:**
- Implemented sortable strategy ranking table
- Added 2 new API endpoints for ranking data

**Technical details:**
- Files: src/components/Leaderboard.jsx, src/api/strategies.js
- Dependencies: react-table@8.10.7
- Breaking changes: None

**Implementation notes:**
- Sort state persists in localStorage
- API: GET /api/strategies/ranking, POST /api/strategies/compare
-->
