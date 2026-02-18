# Strategy Config Pipeline - Findings

## F1: 백테스트 전략 ID ↔ SignalGeneratorV2 전략 매핑

**발견**: 백테스트 시스템(`Strategy.generateSignal`)과 SignalGeneratorV2는 별도의 전략 실행 방식을 사용.
- 백테스트: `Strategy` 인터페이스, `generateSignal(candles, params)` → `StrategySignal`
- SignalGeneratorV2: 하드코딩된 함수 호출 (`rsiBBBounceStrategy`, `sbb120Strategy`, `zmr60WithHighWinRateConfig`)

**결정**: `registerBacktestStrategy()` API로 백테스트 전략을 SignalGeneratorV2에 주입.
config가 참조하는 strategyId는 백테스트 전략 ID이므로, 해당 전략 객체를 등록해야 실행 가능.

**영향**: 런타임에서 전략을 사용하려면 `initializeBacktest()`와 유사하게 전략 객체를 등록하는 초기화 코드가 필요.

## F2: Config 없을 때 후방호환

**결정**: `strategyConfig`가 `undefined`이거나 심볼에 해당하는 설정이 없으면 기존 하드코딩 로직(`selectStrategyDefault`)으로 동작.
기존 사용자/코드에 영향 없음.

## F3: Fallback 전략

**설계**: config 전략 우선순위 순서로 시도 → 모든 전략이 신호 없음/실패 → 기존 default 로직으로 fallback.
이중 안전망으로 config가 잘못되어도 기존 동작은 보장됨.

## F4: 데이터 소스 라벨

**결정**: `StrategyConfigFile.dataSource` 필드로 `demo | real | unknown` 구분.
현재는 demo 백테스트 데이터만 존재하므로 기본값 `unknown`.
향후 real 데이터가 확보되면 별도 config를 생성하여 구분 가능.

## F5: strategy-config.json 위치

CLI 스크립트 기본 출력 경로: 프로젝트 루트 `strategy-config.json`.
Chrome Extension에서는 `chrome.storage`나 빌드 타임 번들링으로 주입 가능 (2단계에서 결정).
