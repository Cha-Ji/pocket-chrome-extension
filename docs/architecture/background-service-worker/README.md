# Background Service Worker 아키텍처

**역할**: 중앙 상태 관리, 메시지 라우팅, DB 저장, 자동매매 루프

## 핵심 정보
- Chrome Extension Service Worker (Manifest V3)
- 모든 모듈 간 메시지 허브
- IndexedDB(Dexie.js)를 통한 데이터 영속화
- 알람 API로 스케줄링

## 하위 모듈

| 모듈 | 설명 |
|------|------|
| auto-trading-loop | 전략 평가 → 신호 생성 → 거래 실행 루프 |
| tab-state | 활성 탭 추적, Content Script 주입 상태 관리 |
| scheduling | Chrome Alarms 기반 주기적 작업 (데이터 정리, 세션 관리) |

## 제약사항
- Service Worker 비활성화 가능 → 재시작 대응 필요
- 30초 idle timeout → 장기 작업은 알람/이벤트 기반으로 분할

## 관련 소스
- `src/background/index.ts` (진입점)
- `src/lib/db/index.ts` (DB 레이어)
