# Architecture ↔ Feature 매핑

아키텍처 관점과 기능 관점의 작업을 서로 참조할 수 있도록 매핑합니다.

## Content Script

- 관련 기능
  - `docs/features/data-collector/`
  - `docs/features/navigator/`
  - `docs/features/executor/`
- 세부 작업
  - `docs/architecture/content-script/data-capture/`
  - `docs/architecture/content-script/dom-selectors/`
  - `docs/architecture/content-script/ui-simulation/`

## Background Service Worker

- 관련 기능
  - `docs/features/executor/`
  - `docs/features/backtester-logger/`
- 세부 작업
  - `docs/architecture/background-service-worker/auto-trading-loop/`
  - `docs/architecture/background-service-worker/tab-state/`
  - `docs/architecture/background-service-worker/scheduling/`

## Side Panel UI

- 관련 기능
  - `docs/features/executor/`
  - `docs/features/technical-analyst/`
  - `docs/features/backtester-logger/`
- 세부 작업
  - `docs/architecture/side-panel-ui/controls/`
  - `docs/architecture/side-panel-ui/logs/`
  - `docs/architecture/side-panel-ui/reports/`

## Local Database

- 관련 기능
  - `docs/features/data-collector/`
  - `docs/features/backtester-logger/`
- 세부 작업
  - `docs/architecture/local-database/schema/`
  - `docs/architecture/local-database/retention/`
  - `docs/architecture/local-database/export/`
