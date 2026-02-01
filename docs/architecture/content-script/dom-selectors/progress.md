# DOM Selectors - Progress

## 완료된 작업

### 2026-01-29
- [x] 브라우저 릴레이로 실제 DOM 구조 분석
- [x] 데모 모드 감지 셀렉터 발견 (3중 체크)
- [x] 매수/매도 버튼 셀렉터 확정
- [x] 잔액 표시 셀렉터 확정
- [x] 페이아웃 정보 셀렉터 발견
- [x] 자산 목록 셀렉터 발견
- [x] 실제 데모 거래 2회 실행 성공

## 현재 이슈

### 🔴 Critical: 실시간 가격 데이터 수집
- **문제:** 차트 가격을 직접 읽을 수 없음 (Canvas 기반)
- **영향:** RSI 계산이 부정확
- **해결 방안:**
  1. 페이지 내 RSI 지표값 직접 읽기 (화면에 이미 표시됨)
  2. WebSocket 메시지 가로채기
  3. 캔들 데이터 API 찾기

### 🟡 Medium: 거래 결과 추적
- **문제:** 거래 승/패 결과 자동 감지 필요
- **해결:** 잔액 변화 모니터링 또는 거래 히스토리 파싱

## 검증된 셀렉터

| 용도 | 셀렉터 | 상태 |
|------|--------|------|
| 데모 감지 (URL) | `window.location.pathname.includes('demo')` | ✅ 작동 |
| 데모 라벨 | `.balance-info-block__label` | ✅ 작동 |
| 잔액 | `.balance-info-block__value` | ✅ 작동 |
| 매수 버튼 | `.switch-state-block__item:first-child` | ✅ 작동 |
| 매도 버튼 | `.switch-state-block__item:last-child` | ✅ 작동 |
| 현재 자산 | `.current-symbol` | ✅ 작동 |
| 페이아웃 | `.block--payout .value__val-start` | ✅ 작동 |
| 자산 목록 | `.alist__item` | ✅ 작동 |
| 자산 이름 | `.alist__label` | ✅ 작동 |
| 자산 수익률 | `.alist__profit` | ✅ 작동 |
| 검색창 | `textbox[placeholder="검색"]` | ✅ 작동 |
| RSI 지표 | (조사 필요) | 🔄 진행중 |

## 다음 마일스톤

1. **실시간 가격 수집** - WebSocket 또는 API 분석
2. **거래 결과 추적** - 승/패 자동 감지
3. **인디케이터 값 읽기** - 페이지 내 RSI, 스토캐스틱 값 추출
