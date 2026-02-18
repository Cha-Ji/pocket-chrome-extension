// ============================================================
// Demo Environment Selectors — Pocket Option Demo mode
// ============================================================

import type { DOMSelectors } from '../../../types';

/** Pocket Option Demo mode DOM selectors (updated 2026-02-18) */
export const PO_DEMO_SELECTORS: DOMSelectors = {
  callButton: '.btn-call',
  putButton: '.btn-put',
  amountInput: '#put-call-buttons-chart-1 input',
  expirationDisplay: '.block--expiration-inputs .value__val',
  balanceDisplay: '.balance-info-block__balance',
  balanceLabel: '.balance-info-block__label',
  tickerSelector: '.chart-item .pair',
  chartContainer: '.chart-item',
  priceDisplay: '.chart-item .value__val',
  demoIndicator: '.balance-info-block__label',
};

/** Demo-specific fallback chains (priority order, updated 2026-02-18) */
export const PO_DEMO_FALLBACKS: Record<string, string[]> = {
  callButton: [
    '.btn-call',
    '.switch-state-block__item:first-child',
    '.trading-panel__buttons-item--up',
  ],
  putButton: [
    '.btn-put',
    '.switch-state-block__item:last-child',
    '.trading-panel__buttons-item--down',
  ],
  amountInput: [
    '#put-call-buttons-chart-1 input',
    '[class*="amount"] input',
  ],
  priceDisplay: [
    '.chart-item .value__val',
    '.chart-block__price .value',
    '.current-price',
    '[data-test="current-price"]',
  ],
  balanceDisplay: [
    '.balance-info-block__balance',
    'span.js-hd[data-hd-show]',
    '.balance-info-block__value',
  ],
};
