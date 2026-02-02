/**
 * Findings - Asset Switching Logic (PO-15)
 */

## 2026-02-03 07:35

### 자산 전환 실패 핵심 원인 추정
1. **React Synthetic Event 제약**: 단순히 `onClick()`을 호출할 때 넘겨주는 이벤트 객체가 React가 기대하는 구조(예: `persist()`, `isPropagationStopped()`)와 완벽히 일치하지 않으면 로직이 중단될 수 있음.
2. **이벤트 전파(Bubbling) 중단**: Pocket Option의 React 구조상 `alist__link`의 부모나 자식에서 이벤트를 가로채거나, 특정 상태(`active` 클래스 등)가 아니면 클릭을 무시할 수 있음.
3. **Trigger 미작동**: 자산 목록을 여는 버튼(`pair-number-wrap`)을 클릭했으나, 실제로 목록이 시각적으로만 보이고 내부 상태는 '닫힘'인 상태일 수 있음.

### 해결 전략: 'Brute Force Clicker'
단일 방식에 의존하지 않고, 0.1초 간격으로 **React Call -> Coordinate Click -> Native Click**을 연쇄적으로 퍼붓는 방식을 채택함.
