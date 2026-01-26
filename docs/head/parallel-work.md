# 병렬 작업 분류

서로 의존도가 낮아 동시에 진행 가능한 작업을 묶어 관리합니다.

## 상태 규칙

- `- [ ]` 시작 전
- `- [~]` 진행 중
- `- [x]` 완료

## 트랙 A: Content Script

- [ ] 데이터 캡처 방식 정리 (`docs/architecture/content-script/data-capture/`, `docs/architecture/content-script/data-capture/task_plan.md`)
- [ ] DOM 셀렉터 조사/정리 (`docs/architecture/content-script/dom-selectors/`, `docs/architecture/content-script/dom-selectors/task_plan.md`)
- [ ] UI 시뮬레이션 대상 정의 (`docs/architecture/content-script/ui-simulation/`, `docs/architecture/content-script/ui-simulation/task_plan.md`)

## 트랙 B: Background Service Worker

- [ ] 자동 매매 루프 조건/상태 설계 (`docs/architecture/background-service-worker/auto-trading-loop/`, `docs/architecture/background-service-worker/auto-trading-loop/task_plan.md`)
- [ ] 탭 상태 모델 및 이벤트 처리 (`docs/architecture/background-service-worker/tab-state/`, `docs/architecture/background-service-worker/tab-state/task_plan.md`)
- [ ] 스케줄링/재시도 정책 (`docs/architecture/background-service-worker/scheduling/`, `docs/architecture/background-service-worker/scheduling/task_plan.md`)

## 트랙 C: Side Panel UI

- [ ] 제어 패널 항목 정의 (`docs/architecture/side-panel-ui/controls/`, `docs/architecture/side-panel-ui/controls/task_plan.md`)
- [ ] 로그 화면/필터 설계 (`docs/architecture/side-panel-ui/logs/`, `docs/architecture/side-panel-ui/logs/task_plan.md`)
- [ ] 리포트 항목/시각화 정의 (`docs/architecture/side-panel-ui/reports/`, `docs/architecture/side-panel-ui/reports/task_plan.md`)

## 트랙 D: Local Database

- [ ] 스키마/인덱스 상세화 (`docs/architecture/local-database/schema/`, `docs/architecture/local-database/schema/task_plan.md`)
- [ ] 보관/정리 정책 수립 (`docs/architecture/local-database/retention/`, `docs/architecture/local-database/retention/task_plan.md`)
- [ ] 내보내기 범위/형식 결정 (`docs/architecture/local-database/export/`, `docs/architecture/local-database/export/task_plan.md`)

## 트랙 E: Feature 설계

- [ ] 데이터 수집 기능 정리 (`docs/features/data-collector/`, `docs/features/data-collector/task_plan.md`)
- [ ] 티커 이동 자동화 정리 (`docs/features/navigator/`, `docs/features/navigator/task_plan.md`)
- [ ] 주문 실행/리스크 관리 정리 (`docs/features/executor/`, `docs/features/executor/task_plan.md`)
- [ ] 지표/오버레이 설계 (`docs/features/technical-analyst/`, `docs/features/technical-analyst/task_plan.md`)
- [ ] 백테스트/로깅 흐름 정리 (`docs/features/backtester-logger/`, `docs/features/backtester-logger/task_plan.md`)
