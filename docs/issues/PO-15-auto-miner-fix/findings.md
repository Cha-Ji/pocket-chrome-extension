# Findings - Auto Miner Click Logic Fix (PO-15)

## 📅 2026-02-03

### 왜 클릭이 안 먹힐까? (가설)

1.  **Event Delegation 문제**:
    - `alist__item` 자체에는 클릭 리스너가 없고, 상위 컨테이너(`assets-block__alist`)에서 이벤트를 위임받아 처리할 수 있습니다.
    - 이 경우 `bubbles: true` 옵션이 필수인데, 이미 적용했지만 실패했다면 이벤트 타겟이 `alist__item`이 아니라 그 내부의 `alist__link`나 `alist__label`이어야 할 수도 있습니다.

2.  **Pointer Events 차단**:
    - CSS `pointer-events: none`이 적용된 요소일 수 있습니다.
    - 투명한 오버레이가 가리고 있을 수 있습니다.

3.  **React Synthetic Events**:
    - React는 네이티브 이벤트를 래핑(SyntheticEvent)하여 처리하므로, `dispatchEvent`로 보낸 네이티브 이벤트가 React 내부 로직과 연결되지 않을 수 있습니다.
    - 해결책: React Props(`__reactProps...`)를 찾아 `onClick` 핸들러를 직접 호출하는 방식이 가장 확실합니다.

### 해결책 적용: `forceClick` 전략

1.  **React Hack**:
    - `__reactProps$` 또는 `__reactEventHandlers$` 접두사로 시작하는 내부 속성을 탐색.
    - 해당 객체의 `onClick` 메서드를 직접 실행하여 React Synthetic Event 시스템을 우회.
2.  **Coordinate Click**:
    - React Hack이 실패하거나 핸들러가 없을 경우, `getBoundingClientRect()`로 정확한 중앙 좌표 산출.
    - `document.elementFromPoint(x, y)`를 통해 실제 마우스 아래에 있는 최상위 요소를 찾아 `click()` 이벤트 전송.
3.  **Human Simulation**:
    - `mouseenter` -> `mousedown` -> `mouseup` -> `click` 순차 이벤트를 50ms 간격으로 발생시켜 보안 스크립트 우회 시도.
