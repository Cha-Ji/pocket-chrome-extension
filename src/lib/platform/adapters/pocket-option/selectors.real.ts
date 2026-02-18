// ============================================================
// Real (Live) Environment Selectors — Pocket Option Real mode
// ============================================================

import type { DOMSelectors } from '../../../types';
import { PO_DEMO_SELECTORS, PO_DEMO_FALLBACKS } from './selectors.demo';

/**
 * Pocket Option Real (Live) mode DOM selectors.
 * Inherits from Demo — override only selectors that differ in Real mode.
 */
export const PO_REAL_SELECTORS: DOMSelectors = {
  ...PO_DEMO_SELECTORS,
  // Real 환경에서도 동일한 셀렉터 사용 (명시적 선언)
  balanceDisplay: '.balance-info-block__balance',
};

/**
 * Real-specific fallback chains.
 * Inherits from Demo fallbacks — extend or override as needed.
 */
export const PO_REAL_FALLBACKS: Record<string, string[]> = {
  ...PO_DEMO_FALLBACKS,
  // Real 환경 전용 잔액 fallback (js-balance-real 클래스 포함)
  balanceDisplay: [
    '.balance-info-block__balance',
    '.js-balance-real-USD',
    'span.js-hd[data-hd-show]',
    '.balance-info-block__value',
  ],
};
