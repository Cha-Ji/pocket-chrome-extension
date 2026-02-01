# DOM Selectors - Findings

**최종 업데이트:** 2026-01-29 21:00 KST

## 핵심 발견 사항

### ⚠️ 데모 모드 감지 (CRITICAL!)

실계좌 보호를 위한 3중 체크 구현 완료:

```javascript
// 방법 1: URL 체크 (가장 신뢰도 높음)
window.location.pathname.includes('demo')
// Demo: /ko/cabinet/demo-quick-high-low/
// Live: /ko/cabinet/quick-high-low/ (추정)

// 방법 2: Chart 클래스 체크
document.querySelector('.is-chart-demo')

// 방법 3: 잔액 라벨 텍스트 체크
document.querySelector('.balance-info-block__label')
// "QT Demo" = 데모 계정
```

### 💰 계정 정보

```javascript
// 잔액
'.balance-info-block__value'
// 예: "72,364.93"

// 계정 유형
'.balance-info-block__label'
// 예: "QT Demo"
```

### 🔘 거래 버튼

```javascript
// 매수 (CALL/Higher)
'.switch-state-block__item:first-child'

// 매도 (PUT/Lower)
'.switch-state-block__item:last-child'

// 부모 컨테이너
'#put-call-buttons-chart-1'
```

### 📊 자산 정보

```javascript
// 현재 자산명
'.current-symbol'
// 예: "Apple OTC"

// 자산 선택기 열기
'.pair-number-wrap' // 클릭

// 자산 목록 (열린 후)
'.alist__item'        // 각 자산
'.alist__label'       // 자산명
'.alist__profit'      // 페이아웃 ("+92%")

// 검색
'textbox[placeholder="검색"]'
```

### 💵 거래 설정

```javascript
// 페이아웃 표시
'.block--payout .value__val-start'
// 예: "+92%"

// 금액 입력
'#put-call-buttons-chart-1 input[type="text"]'

// 만료 시간
'.block--expiration-inputs .value__val'
// 예: "00:01:00"
```

### 📈 인디케이터 (화면 표시)

페이지에 이미 표시된 인디케이터:
- **RSI 14** - 값 추출 셀렉터 찾기 필요
- **볼린저 밴드 20 2**
- **스토캐스틱 오실레이터 14 3 3**

```javascript
// 인디케이터 정보 영역
'.chart-indicator-info'
// 예: "볼린저 밴드 20 2"

// TODO: 실제 수치값 셀렉터 찾기
```

### 📋 거래 현황

```javascript
// 진행 중인 거래 표시
// "Apple OTC +92% 00:28 $1 $1.92 +$0.92 더블 업"

// 베팅 카운터
// "베팅 1" - 활성 거래 수

// 거래 히스토리 링크
'a[href*="trading-history"]'
```

---

## 92% 페이아웃 자산 목록 (2026-01-29 기준)

| 자산 | 페이아웃 | 유형 |
|------|----------|------|
| Apple OTC | +92% | Stock |
| FACEBOOK INC OTC | +92% | Stock |
| McDonald's OTC | +92% | Stock |
| Advanced Micro Devices OTC | +92% | Stock |
| Amazon OTC | +92% | Stock |
| Marathon Digital Holdings OTC | +92% | Stock |
| VISA OTC | +92% | Stock |

**참고:** 페이아웃은 실시간으로 변동됨

---

## 실제 거래 테스트 결과

### 테스트 1: RSI 데모 봇 (2026-01-29)

**설정:**
- 자산: Apple OTC (92%)
- 전략: RSI 과매수/과매도
- 금액: $1
- 만료: 1분

**결과:**
- 거래 2회 실행
- 버튼 클릭 정상 작동
- RSI 계산 문제 (시뮬레이션 가격 사용)

**개선 필요:**
- 실제 가격 데이터 필요
- 페이지 RSI 지표값 활용 권장

---

## 미해결 과제

### 🔴 가격 데이터 수집
- Canvas 차트에서 직접 가격 읽기 불가
- 해결책: WebSocket 분석 또는 페이지 내 지표값 사용

### 🟡 거래 결과 추적
- 승/패 자동 감지 로직 필요
- 잔액 변화 모니터링으로 간접 추적 가능

### 🟢 인디케이터 수치
- RSI, 스토캐스틱 등 실제 값 읽는 셀렉터 탐색 필요

---

## 코드 예시

### 안전한 거래 실행

```javascript
// 데모 모드 확인 필수!
if (!window.location.pathname.includes('demo')) {
  throw new Error('NOT DEMO MODE - REFUSING TO TRADE');
}

// 페이아웃 확인
const payoutEl = document.querySelector('.block--payout .value__val-start');
const payout = parseInt(payoutEl?.textContent?.match(/(\d+)/)?.[1] || '0');
if (payout < 90) {
  console.log('Payout too low, skipping...');
  return;
}

// 거래 실행
const direction = 'CALL'; // or 'PUT'
const btn = direction === 'CALL' 
  ? document.querySelector('.switch-state-block__item:first-child')
  : document.querySelector('.switch-state-block__item:last-child');
btn?.click();
```

### 자산 전환

```javascript
// 자산 목록 열기
document.querySelector('.pair-number-wrap')?.click();

// 검색
await new Promise(r => setTimeout(r, 500));
const searchBox = document.querySelector('input[placeholder="검색"]');
searchBox.value = 'Apple';
searchBox.dispatchEvent(new Event('input', { bubbles: true }));

// 선택
await new Promise(r => setTimeout(r, 500));
const items = document.querySelectorAll('.alist__item');
for (const item of items) {
  if (item.textContent.includes('Apple OTC') && item.textContent.includes('92%')) {
    item.querySelector('.alist__link')?.click();
    break;
  }
}
```
