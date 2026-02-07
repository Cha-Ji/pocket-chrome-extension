# Content Script 아키텍처

**역할**: 실시간 가격/차트 캡처, UI 이벤트 시뮬레이션, WebSocket 데이터 수신

## 핵심 정보
- MutationObserver로 가격 변화 감지
- WebSocket 인터셉트 (Tampermonkey Bridge 경유)
- 매수/매도/티커 변경 버튼 클릭 시뮬레이션

## 제약사항
- DOM 구조 변경 시 셀렉터 유지보수 필요
- Isolated World에서 실행 → Main World 접근 불가 (Bridge 필요)

## 하위 모듈

| 모듈 | 설명 | 문서 |
|------|------|------|
| dom-selectors | DOM 셀렉터 카탈로그, 데모 모드 감지 | [상세 문서](dom-selectors/) |
| data-capture | MutationObserver 기반 가격 캡처 | 구현체: `src/content-script/data-collector.ts` |
| ui-simulation | CALL/PUT 버튼 클릭, 자산 전환 | 구현체: `src/content-script/executor.ts` |

## 관련 소스
- `src/content-script/index.ts` (진입점)
- `src/content-script/websocket-interceptor.ts` (WS 수신)
- `src/content-script/data-collector.ts` (가격 캡처)
- `src/content-script/executor.ts` (거래 실행)
