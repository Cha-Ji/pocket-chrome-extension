# DOM Selectors - Findings

## 결정 사항

- ✅ (2026-01-29) 셀렉터 발견 완료! 브라우저 릴레이로 직접 확인함
- ✅ (2026-01-29) 데모 모드 감지 로직 3중 체크 구현
- (2026-01-29) 셀렉터는 chrome.storage.local에 저장하여 업데이트 용이하게

## 제약/가정

- DOM 구조는 사이트 업데이트로 변경될 수 있음
- 다국어 버전에서 셀렉터가 다를 수 있음 (현재: 한국어 버전)
- Shadow DOM 사용 안 함 (확인됨)

---

## ⚠️ 데모 모드 감지 (CRITICAL!)

실계좌 보호를 위해 3중 체크 구현:

### 방법 1: URL 체크 (가장 신뢰도 높음)
```javascript
window.location.pathname.includes('demo')
// Demo: /ko/cabinet/demo-quick-high-low/
// Live: /ko/cabinet/quick-high-low/ (추정)
```

### 방법 2: Chart 클래스 체크
```javascript
document.querySelector('.is-chart-demo')
// 존재하면 데모 모드
```

### 방법 3: 잔액 라벨 텍스트 체크
```javascript
document.querySelector('.balance-info-block__label')
// "QT Demo" = 데모 계정
// "Live" 또는 다른 텍스트 = 실계정 (추정)
```

---

## 발견된 셀렉터

### 잔액 표시
```javascript
// 라벨 (계정 유형)
selector: '.balance-info-block__label'
example: "QT Demo"

// 잔액 금액
selector: '.balance-info-block__value'  
example: "72,364.93"
```

### 매수 버튼 (CALL/Higher)
```javascript
selector: '.switch-state-block__item:first-child'
text: "매수" (한국어)
parent: '.switch-state-block__in'
```

### 매도 버튼 (PUT/Lower)
```javascript
selector: '.switch-state-block__item:last-child'
text: "매도" (한국어)
parent: '.switch-state-block__in'
```

### 금액 입력
```javascript
selector: '#put-call-buttons-chart-1 input[type="text"]'
parent class: 'value__val'
grandparent class: 'control__value value value--several-items'
```

### 만료 시간 표시
```javascript
selector: '.block--expiration-inputs .value__val'
example: "00:01:00"
```

### 현재 자산/티커
```javascript
selector: '.chart-item .pair'
example: "Alibaba OTC"
```

### 차트 컨테이너
```javascript
selector: '.chart-item'
// 또는 더 구체적으로
selector: '.chart-item.is-quick'
// 데모 여부 확인용
selector: '.is-chart-demo' (데모일 때만 존재)
```

### 지불금 표시
```javascript
selector: '.block--payout'
// 내부 구조
// - .payout__number: "+92"
// - .payout__symbol: "%"
```

---

## 기타 발견된 클래스들

### 계정 관련
- `.balance-info-block` - 전체 잔액 블록
- `.h-btn--deposit` - 충전 버튼

### 자산 목록
- `.assets-favorites-list` - 즐겨찾기 자산 목록
- `.assets-favorites-item` - 개별 자산 항목

### 거래 패널
- `.call-put-block` - 거래 컨트롤 전체
- `.control-panel` - 컨트롤 패널
- `#put-call-buttons-chart-1` - 거래 버튼 컨테이너
- `.trading-panel` - 거래 패널

### 차트 관련
- `.chart-container` - 차트 영역
- `.chart-indicator-info` - 인디케이터 정보
- `.is-chart-demo` - 데모 모드 표시 (중요!)
- `.is-quick` - 퀵 트레이딩 모드

---

## 코드 스니펫

### 현재 구현 (src/lib/types/index.ts)
```typescript
export const DEFAULT_SELECTORS: DOMSelectors = {
  callButton: '.switch-state-block__item:first-child',
  putButton: '.switch-state-block__item:last-child',
  amountInput: '#put-call-buttons-chart-1 input[type="text"]',
  expirationDisplay: '.block--expiration-inputs .value__val',
  balanceDisplay: '.balance-info-block__value',
  balanceLabel: '.balance-info-block__label',
  tickerSelector: '.chart-item .pair',
  chartContainer: '.chart-item',
  priceDisplay: '.chart-item',
  demoIndicator: '.balance-info-block__label',
}
```

---

## 셀렉터 확인 방법

```javascript
// Chrome DevTools Console에서 테스트:

// 데모 모드 확인
window.location.pathname.includes('demo') // true = 데모
document.querySelector('.is-chart-demo') // null 아니면 데모

// 잔액 확인
document.querySelector('.balance-info-block__value')?.textContent

// 버튼 확인
document.querySelectorAll('.switch-state-block__item')
// [0] = 매수, [1] = 매도
```

---

## 향후 확인 필요

1. **실계좌 URL 패턴** - `/ko/cabinet/quick-high-low/` 추정 (미확인)
2. **실계좌 라벨 텍스트** - "Live" 또는 다른 값일 수 있음 (미확인)
3. **가격 데이터 추출** - Canvas 기반이라 직접 읽기 어려울 수 있음
4. **WebSocket 가격 피드** - DOM 대신 WS로 가격 받는 게 더 정확할 수 있음
