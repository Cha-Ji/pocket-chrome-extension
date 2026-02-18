// ============================================================
// Environment Detection — Demo / Real / Unknown
// ============================================================
// Provides a best-effort detection of the current Pocket Option
// environment.  When detection is uncertain, returns 'unknown'
// so that callers can log/tag data accordingly.
// ============================================================

/**
 * The three possible Pocket Option environments.
 * 'unknown' is the safe default when detection is inconclusive.
 */
export type PocketOptionEnvironment = 'demo' | 'real' | 'unknown';

export interface EnvironmentDetectionResult {
  environment: PocketOptionEnvironment;
  confidence: 'high' | 'medium' | 'low';
  signals: EnvironmentSignals;
}

export interface EnvironmentSignals {
  urlHasDemo: boolean | null;
  chartDemoClass: boolean | null;
  balanceLabelHasDemo: boolean | null;
}

/**
 * Detect current environment from URL and DOM hints.
 *
 * Detection strategy (additive signals):
 *  1. URL path contains '/demo/' → demo signal
 *  2. `.is-chart-demo` element exists → demo signal
 *  3. Balance label text contains 'demo' (case-insensitive) → demo signal
 *
 * Confidence:
 *  - high   : 2+ signals agree
 *  - medium : exactly 1 signal detected
 *  - low    : 0 signals or contradictory
 *
 * Returns 'unknown' when no DOM is available (e.g., service worker, test env).
 */
export function detectEnvironment(): EnvironmentDetectionResult {
  // Guard: no DOM available (background worker, Node tests, etc.)
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return {
      environment: 'unknown',
      confidence: 'low',
      signals: { urlHasDemo: null, chartDemoClass: null, balanceLabelHasDemo: null },
    };
  }

  const signals: EnvironmentSignals = {
    urlHasDemo: null,
    chartDemoClass: null,
    balanceLabelHasDemo: null,
  };

  // Signal 1: URL path
  try {
    signals.urlHasDemo = window.location.pathname.includes('/demo');
  } catch {
    signals.urlHasDemo = null;
  }

  // Signal 2: Chart demo class
  try {
    signals.chartDemoClass = document.querySelector('.is-chart-demo') !== null;
  } catch {
    signals.chartDemoClass = null;
  }

  // Signal 3: Balance label text
  try {
    const label = document.querySelector('.balance-info-block__label');
    if (label?.textContent) {
      signals.balanceLabelHasDemo = label.textContent.toLowerCase().includes('demo');
    } else {
      signals.balanceLabelHasDemo = null;
    }
  } catch {
    signals.balanceLabelHasDemo = null;
  }

  return resolveEnvironment(signals);
}

/**
 * Pure function that resolves environment from collected signals.
 * Exported for testability.
 */
export function resolveEnvironment(signals: EnvironmentSignals): EnvironmentDetectionResult {
  const demoSignals = [signals.urlHasDemo, signals.chartDemoClass, signals.balanceLabelHasDemo];
  const trueCount = demoSignals.filter((s) => s === true).length;
  const falseCount = demoSignals.filter((s) => s === false).length;
  const nullCount = demoSignals.filter((s) => s === null).length;

  // All signals null → can't determine
  if (nullCount === 3) {
    return { environment: 'unknown', confidence: 'low', signals };
  }

  // Strong demo: 2+ signals say demo
  if (trueCount >= 2) {
    return { environment: 'demo', confidence: 'high', signals };
  }

  // Strong real: 2+ signals say NOT demo, none say demo
  if (falseCount >= 2 && trueCount === 0) {
    return { environment: 'real', confidence: 'high', signals };
  }

  // Single demo signal
  if (trueCount === 1 && falseCount === 0) {
    return { environment: 'demo', confidence: 'medium', signals };
  }

  // Single non-demo signal
  if (falseCount === 1 && trueCount === 0) {
    return { environment: 'real', confidence: 'medium', signals };
  }

  // Mixed or contradictory → unknown
  return { environment: 'unknown', confidence: 'low', signals };
}
