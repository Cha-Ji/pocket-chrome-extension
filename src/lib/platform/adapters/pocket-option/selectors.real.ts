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
  // Override selectors that differ in Real mode here
  // e.g. if Real mode uses a different balance display:
  // balanceDisplay: '.real-balance__value',
};

/**
 * Real-specific fallback chains.
 * Inherits from Demo fallbacks — extend or override as needed.
 */
export const PO_REAL_FALLBACKS: Record<string, string[]> = {
  ...PO_DEMO_FALLBACKS,
  // Override fallback chains that differ in Real mode here
};
