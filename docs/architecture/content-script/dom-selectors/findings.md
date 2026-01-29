# DOM Selectors - Findings

## 결정 사항

- (2026-01-29) 셀렉터 발견 전까지 플레이스홀더 값 사용
- (2026-01-29) data-testid 기반 셀렉터 우선, 없으면 class/id 조합 사용
- (2026-01-29) 셀렉터는 chrome.storage.local에 저장하여 업데이트 용이하게

## 제약/가정

- DOM 구조는 사이트 업데이트로 변경될 수 있음
- 다국어 버전에서 셀렉터가 다를 수 있음
- Shadow DOM 사용 여부 확인 필요

## 발견된 셀렉터

### 가격 표시
```
// TODO: 로그인 후 확인
selector: TBD
example: <div class="???">1.0850</div>
```

### CALL 버튼
```
// TODO: 로그인 후 확인
selector: TBD
notes: 녹색 버튼, "Higher" 또는 "CALL" 텍스트
```

### PUT 버튼
```
// TODO: 로그인 후 확인
selector: TBD
notes: 빨간색 버튼, "Lower" 또는 "PUT" 텍스트
```

### 잔액 표시
```
// TODO: 로그인 후 확인
selector: TBD
```

### 티커 선택
```
// TODO: 로그인 후 확인
selector: TBD
```

### 차트 컨테이너
```
// TODO: 로그인 후 확인
selector: TBD
notes: Canvas 또는 SVG 기반일 가능성
```

## 셀렉터 탐색 방법

1. Chrome DevTools 열기 (F12)
2. Elements 탭에서 요소 검사
3. Console에서 테스트:
   ```javascript
   document.querySelector('your-selector')
   ```
4. 여러 페이지/자산에서 일관성 확인

## 코드 스니펫

현재 플레이스홀더 (src/lib/types/index.ts):
```typescript
export const DEFAULT_SELECTORS: DOMSelectors = {
  priceDisplay: '[data-testid="price"]', // TBD
  callButton: '[data-testid="call-btn"]', // TBD
  putButton: '[data-testid="put-btn"]', // TBD
  balanceDisplay: '[data-testid="balance"]', // TBD
  tickerSelector: '[data-testid="ticker"]', // TBD
  chartContainer: '[data-testid="chart"]', // TBD
}
```
