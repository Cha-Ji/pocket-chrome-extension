# Findings - Side Panel Black Screen (PO-14)

## 📅 2026-02-03

### 잠재적 원인 분석

1.  **React 렌더링 에러**: `App.tsx`나 하위 컴포넌트(`AutoMinerControl`)에서 런타임 에러가 발생하면 전체 앱이 렌더링을 멈추고 흰색/검은색 화면이 됩니다.
    - 특히 `chrome.tabs.sendMessage` 호출 부분에서 `tabs[0]?.id`가 없는 경우 등의 예외 처리가 미흡할 수 있음.

2.  **Tailwind CSS/스타일 문제**: `bg-gray-900` 등의 클래스가 적용되었으나 컨텐츠 높이가 0이거나 보이지 않는 경우.

3.  **Vite 빌드 문제**: `inject-websocket.js` 이슈는 해결되었으나, 사이드 패널 쪽 번들링에 문제가 생겼을 가능성.

### `AutoMinerControl.tsx` 의심 구간

```typescript
useEffect(() => {
  const fetchStatus = () => {
    // 여기서 chrome API 호출 실패 시 에러가 발생할 수 있음
    chrome.tabs.query(...)
  }
  const interval = setInterval(fetchStatus, 1000)
  return () => clearInterval(interval)
}, [])
```
- 만약 활성 탭을 찾지 못하거나 메시지 전송이 실패하면 에러가 발생할 수 있음.
- 사이드 패널은 탭 컨텍스트가 아니므로 `chrome.tabs.query` 사용 시 주의 필요.

### 조치 계획
1. `App.tsx`를 단순화하여 렌더링 여부 확인
2. `AutoMinerControl`의 에러 핸들링 강화
