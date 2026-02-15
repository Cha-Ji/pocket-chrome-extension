// ============================================================
// Pocket Option DOM Selectors - 플랫폼별 셀렉터 정의
// ============================================================
// 기존 DEFAULT_SELECTORS, ROBUST_SELECTORS, 각 모듈의 로컬 셀렉터를
// 한 곳에 모아 관리한다. PO Real 어댑터는 이 파일을 상속/오버라이드한다.
// ============================================================

import type { DOMSelectors } from '../../../types';

/** Pocket Option Demo 전용 셀렉터 */
export const PO_DEMO_SELECTORS: DOMSelectors = {
  callButton: '.switch-state-block__item:first-child',
  putButton: '.switch-state-block__item:last-child',
  amountInput: '#put-call-buttons-chart-1 input[type="text"]',
  expirationDisplay: '.block--expiration-inputs .value__val',
  balanceDisplay: '.balance-info-block__value',
  balanceLabel: '.balance-info-block__label',
  tickerSelector: '.chart-item .pair',
  chartContainer: '.chart-item',
  priceDisplay: '.chart-item .value__val',
  demoIndicator: '.balance-info-block__label',
};

/** 페이아웃 모니터용 셀렉터 */
export const PO_PAYOUT_SELECTORS = {
  assetList: '.assets-block__alist.alist',
  assetItem: '.alist__item',
  assetLabel: '.alist__label',
  assetProfit: '.alist__payout',
  pairTrigger: '.current-symbol',
  overlay: '.modal-overlay',
} as const;

/** 가격 수집용 셀렉터 */
export const PO_PRICE_SELECTORS = {
  currentPrice: '.chart-item .value, .chart-block__price .value',
  priceValue: '.chart-item .value__val, .chart-block__price .value__val',
  chartCanvas: 'canvas.chart-area',
  chartContainer: '.chart-item, .chart-block',
  assetName: '.chart-item .pair, .chart-block .pair',
  serverTime: '.server-time, .time-block',
} as const;

/** 데모 감지용 CSS 셀렉터 */
export const PO_DEMO_DETECTION = {
  demoChartClass: '.is-chart-demo',
  balanceLabel: '.balance-info-block__label',
} as const;

/** Pocket Option Real (Live) 전용 셀렉터 — Demo와 동일 구조, 차이점만 오버라이드 */
export const PO_REAL_SELECTORS: DOMSelectors = {
  ...PO_DEMO_SELECTORS,
  // Real 모드에서 다를 수 있는 셀렉터를 여기에 오버라이드
};

/** Real 모드 감지 셀렉터 */
export const PO_REAL_DETECTION = {
  /** Real 모드에는 .is-chart-demo 클래스가 없음 */
  balanceLabel: '.balance-info-block__label',
} as const;

/** 셀렉터 fallback 체인 — 셀렉터 키별 대체 후보 (우선순위순) */
export const PO_SELECTOR_FALLBACKS: Record<string, string[]> = {
  callButton: [
    '.switch-state-block__item:first-child',
    '.btn-call',
    '.trading-panel__buttons-item--up',
  ],
  putButton: [
    '.switch-state-block__item:last-child',
    '.btn-put',
    '.trading-panel__buttons-item--down',
  ],
  priceDisplay: [
    '.chart-item .value__val',
    '.chart-block__price .value',
    '.current-price',
    '[data-test="current-price"]',
  ],
  balanceDisplay: ['.balance-info-block__value', '.user-balance', '.header__balance-value'],
};

/** Pocket Option 도메인 패턴 */
export const PO_DOMAINS = ['pocketoption.com', 'po.trade', 'po2.trade'] as const;
