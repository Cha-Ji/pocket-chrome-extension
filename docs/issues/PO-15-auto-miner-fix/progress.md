# Progress - Auto Miner Click Logic Fix (PO-15)

## 2026-02-03 07:45 (v0.1.6 준비)

### 1. 현상 분석 (팡 팡님 리포트 기반)
*   **자산 목록 오픈 루프:** PayoutMonitor가 페이아웃 데이터를 찾지 못해 계속 Picker를 열려고 시도함. (`Payouts insufficient` 로그 반복)
*   **클릭 로그 부재:** `forceClick`의 Phase 로그가 자산 항목(Item)에 대해서는 찍히지 않음. (트리거에 대해서만 Phase 2까지 실행됨)
*   **자산 목록 닫히지 않음:** 전환 클릭이 실제로 먹히지 않아 목록이 상주함.

### 2. 기술적 원인 진단
*   **목록 오픈 후 데이터 인식 실패:** Picker가 열린 후 `scrapePayoutsFromDOM`이 즉시 실행되면서, React가 리스트를 렌더링하기 전의 빈 상태를 읽고 있음.
*   **`forceClick` 실행 누락:** `switchAsset` 내부에서 자산을 찾는 루프가 실패하여 `forceClick` 자체가 호출되지 않고 있음.

### 3. 해결책 (v0.1.6)
*   **동적 대기 도입:** `scrapePayoutsFromDOM` 실행 전 요소가 실제로 나타날 때까지 기다리는 `waitForSelector` 로직 강화.
*   **`forceClick` 로그 전면 개편:** 5단계 클릭 과정의 성공/실패 여부를 상세히 로깅하도록 수정.
*   **AutoMiner 동기화:** `Completed Assets` 리스트 업데이트가 누락되지 않도록 상태 관리 보강.
