// ============================================================
// Pocket Option DOM Selectors — Aggregator
// ============================================================
// Re-exports environment-specific selectors from sub-modules.
// Provides detectEnvironment() and getSelectorsForEnvironment()
// for environment-aware selector resolution.
// ============================================================

import type { DOMSelectors } from '../../../types';

// ─── Re-exports from sub-modules ────────────────────────────

export type { PlatformEnvironment } from './selectors.common';
export {
  SELECTOR_VERSION,
  PO_DOMAINS,
  PO_PAYOUT_SELECTORS,
  PO_PRICE_SELECTORS,
  PO_DEMO_DETECTION,
  PO_REAL_DETECTION,
  CRITICAL_SELECTOR_KEYS,
  NON_CRITICAL_SELECTOR_KEYS,
} from './selectors.common';

export { PO_DEMO_SELECTORS, PO_DEMO_FALLBACKS } from './selectors.demo';
export { PO_REAL_SELECTORS, PO_REAL_FALLBACKS } from './selectors.real';

// ─── Internal imports for logic ─────────────────────────────

import type { PlatformEnvironment } from './selectors.common';
import { PO_DOMAINS as PO_DOMAINS_INTERNAL } from './selectors.common';
import { PO_DEMO_SELECTORS, PO_DEMO_FALLBACKS } from './selectors.demo';
import { PO_REAL_SELECTORS, PO_REAL_FALLBACKS } from './selectors.real';

// ─── Legacy backward-compat re-export ───────────────────────

/**
 * Legacy fallback chains export.
 * @deprecated Use getFallbacksForEnvironment(env) instead.
 */
export const PO_SELECTOR_FALLBACKS: Record<string, string[]> = PO_DEMO_FALLBACKS;

// ─── Environment Detection ──────────────────────────────────

/**
 * Detect the current platform environment (demo/real/unknown).
 *
 * Uses a 3-point check:
 * 1. URL path contains 'demo'
 * 2. Chart element has '.is-chart-demo' class
 * 3. Balance label text contains 'demo'
 *
 * Returns 'unknown' when signals are mixed or insufficient.
 */
export function detectEnvironment(): PlatformEnvironment {
  // 1. URL check (most reliable)
  const urlHasDemo = window.location.pathname.includes('demo');
  const hasQuickHighLowPath = window.location.pathname.includes('/quick-high-low');
  const hasCabinetPath = window.location.pathname.includes('/cabinet/');
  const isPocketOptionHost = PO_DOMAINS_INTERNAL.some((domain: string) =>
    window.location.hostname.includes(domain),
  );
  const isTradingPage = hasQuickHighLowPath || hasCabinetPath;

  // 2. CSS class check
  const hasChartDemoClass = !!document.querySelector('.is-chart-demo');

  // 3. Balance label check
  const labelText =
    document.querySelector('.balance-info-block__label')?.textContent?.toLowerCase() ?? '';
  const labelHasDemo = labelText.includes('demo');

  // Strong demo signals
  if (urlHasDemo) return 'demo';
  if (hasChartDemoClass && labelHasDemo) return 'demo';

  // Strong real signal on trading page: no demo markers and we are on PO trading routes.
  // This avoids transient `unknown` states when labels are not yet populated at init.
  if (
    isPocketOptionHost &&
    isTradingPage &&
    !urlHasDemo &&
    !hasChartDemoClass &&
    !labelHasDemo
  ) {
    return 'real';
  }

  // Strong real signals: no demo indicators AND label has meaningful text
  if (!hasChartDemoClass && !labelHasDemo && labelText.length > 0) return 'real';

  // Mixed or insufficient signals
  return 'unknown';
}

/** Get the primary selector set for the detected environment */
export function getSelectorsForEnvironment(env: PlatformEnvironment): DOMSelectors {
  switch (env) {
    case 'demo':
      return PO_DEMO_SELECTORS;
    case 'real':
      return PO_REAL_SELECTORS;
    case 'unknown':
      return PO_DEMO_SELECTORS; // safe default
  }
}

/** Get the fallback chains for the detected environment */
export function getFallbacksForEnvironment(env: PlatformEnvironment): Record<string, string[]> {
  switch (env) {
    case 'demo':
      return PO_DEMO_FALLBACKS;
    case 'real':
      return PO_REAL_FALLBACKS;
    case 'unknown':
      return PO_DEMO_FALLBACKS; // safe default
  }
}
