// ============================================================
// Demo Environment Selectors — Pocket Option Demo mode
// ============================================================

import type { DOMSelectors } from '../../../types';

/** Pocket Option Demo mode DOM selectors */
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

/** Demo-specific fallback chains (priority order) */
export const PO_DEMO_FALLBACKS: Record<string, string[]> = {
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
  balanceDisplay: [
    '.balance-info-block__value',
    '.user-balance',
    '.header__balance-value',
  ],
};
