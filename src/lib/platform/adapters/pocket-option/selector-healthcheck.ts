// ============================================================
// Selector Healthcheck — startup validation + MutationObserver
// ============================================================
// Validates all required DOM selectors on extension load.
// Re-validates when DOM changes structurally.
// Broadcasts results via chrome.runtime.sendMessage.
// ============================================================

import { createLogger } from '../../../logger';
import type { PlatformEnvironment } from './selectors.common';
import {
  SELECTOR_VERSION,
  CRITICAL_SELECTOR_KEYS,
  NON_CRITICAL_SELECTOR_KEYS,
} from './selectors.common';
import {
  detectEnvironment,
  getSelectorsForEnvironment,
  getFallbacksForEnvironment,
} from './selectors';

const logger = createLogger('SelectorHealthcheck');

// ─── Types ──────────────────────────────────────────────────

export interface SelectorCheckResult {
  key: string;
  found: boolean;
  usedSelector: string;
  critical: boolean;
}

export interface HealthcheckResult {
  environment: PlatformEnvironment;
  timestamp: number;
  version: string;
  results: SelectorCheckResult[];
  passed: boolean;
  tradingHalted: boolean;
  criticalFailures: string[];
  nonCriticalFailures: string[];
  /** DOM snapshot for unknown environments (key → exists). No sensitive data. */
  snapshot?: Record<string, boolean>;
}

// ─── Debounce interval for MutationObserver re-validation ───

const REVALIDATION_DEBOUNCE_MS = 5_000;

// ─── Healthcheck Class ──────────────────────────────────────

export class SelectorHealthcheck {
  private observer: MutationObserver | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastResult: HealthcheckResult | null = null;
  private onResultCallback: ((result: HealthcheckResult) => void) | null = null;

  /**
   * Run the healthcheck: detect environment, validate all selectors.
   * Returns the result and caches it internally.
   */
  run(): HealthcheckResult {
    const environment = detectEnvironment();
    const selectors = getSelectorsForEnvironment(environment);
    const fallbacks = getFallbacksForEnvironment(environment);

    const results: SelectorCheckResult[] = [];
    const criticalFailures: string[] = [];
    const nonCriticalFailures: string[] = [];

    // Check all selector keys
    const allKeys = [
      ...CRITICAL_SELECTOR_KEYS,
      ...NON_CRITICAL_SELECTOR_KEYS,
    ];

    for (const key of allKeys) {
      const isCritical = CRITICAL_SELECTOR_KEYS.includes(key);
      const primarySelector = selectors[key];
      const fallbackChain = fallbacks[key] ?? [];

      // Try primary selector
      let found = false;
      let usedSelector = primarySelector || '';

      if (primarySelector && document.querySelector(primarySelector)) {
        found = true;
        usedSelector = primarySelector;
      } else {
        // Try fallback chain
        for (const fb of fallbackChain) {
          if (document.querySelector(fb)) {
            found = true;
            usedSelector = fb;
            logger.info(`Healthcheck fallback hit: ${key} → ${fb}`);
            break;
          }
        }
      }

      results.push({ key, found, usedSelector, critical: isCritical });

      if (!found) {
        if (isCritical) {
          criticalFailures.push(key);
          logger.error(`CRITICAL selector missing: ${key} (primary: ${primarySelector})`);
        } else {
          nonCriticalFailures.push(key);
          logger.warn(`Non-critical selector missing: ${key}`);
        }
      }
    }

    const tradingHalted = criticalFailures.length > 0;
    const passed = criticalFailures.length === 0 && nonCriticalFailures.length === 0;

    // For unknown environments, save a research snapshot (no sensitive info)
    let snapshot: Record<string, boolean> | undefined;
    if (environment === 'unknown') {
      snapshot = {};
      for (const r of results) {
        snapshot[r.key] = r.found;
      }
      logger.warn('Unknown environment detected — saving research snapshot');
    }

    const result: HealthcheckResult = {
      environment,
      timestamp: Date.now(),
      version: SELECTOR_VERSION,
      results,
      passed,
      tradingHalted,
      criticalFailures,
      nonCriticalFailures,
      snapshot,
    };

    this.lastResult = result;

    if (passed) {
      logger.info(`Healthcheck PASSED (env=${environment}, v=${SELECTOR_VERSION})`);
    } else if (tradingHalted) {
      logger.error(
        `Healthcheck FAILED — trading halted. Critical: [${criticalFailures.join(', ')}]`,
      );
    } else {
      logger.warn(
        `Healthcheck PARTIAL — non-critical failures: [${nonCriticalFailures.join(', ')}]`,
      );
    }

    return result;
  }

  /** Get the most recent healthcheck result */
  getLastResult(): HealthcheckResult | null {
    return this.lastResult;
  }

  /**
   * Register a callback to receive healthcheck results.
   * Called on initial run and on every MutationObserver re-validation.
   */
  onResult(callback: (result: HealthcheckResult) => void): void {
    this.onResultCallback = callback;
  }

  /**
   * Start MutationObserver to detect DOM structural changes.
   * Re-runs healthcheck (debounced) when the DOM changes significantly.
   */
  startObserver(): void {
    if (this.observer) return;

    this.observer = new MutationObserver(() => {
      this.scheduleRevalidation();
    });

    // Observe structural changes (not attribute-only changes or text changes)
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    logger.info('MutationObserver started for selector re-validation');
  }

  /** Stop the MutationObserver */
  stopObserver(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    logger.info('MutationObserver stopped');
  }

  /** Run healthcheck and broadcast result */
  runAndBroadcast(): HealthcheckResult {
    const result = this.run();
    this.onResultCallback?.(result);
    this.broadcastResult(result);
    return result;
  }

  /** Broadcast result via chrome.runtime.sendMessage */
  private broadcastResult(result: HealthcheckResult): void {
    try {
      chrome.runtime.sendMessage({
        type: 'SELECTOR_HEALTHCHECK_RESULT',
        payload: result,
      }).catch(() => {
        // Background may not be ready yet — this is expected on startup
      });
    } catch {
      // Extension context may be invalidated
    }
  }

  /** Debounced re-validation triggered by MutationObserver */
  private scheduleRevalidation(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;

      // Capture previous state BEFORE run() overwrites this.lastResult
      const prev = this.lastResult;
      const prevHalted = prev?.tradingHalted ?? false;
      const prevCritical = prev?.criticalFailures.join(',') ?? '';
      const prevNonCritical = prev?.nonCriticalFailures.join(',') ?? '';

      const result = this.run();

      // Broadcast if any dimension changed (halted, critical keys, non-critical keys)
      const statusChanged =
        result.tradingHalted !== prevHalted ||
        result.criticalFailures.join(',') !== prevCritical ||
        result.nonCriticalFailures.join(',') !== prevNonCritical;

      if (statusChanged) {
        logger.info('Selector status changed after DOM mutation — broadcasting');
        this.onResultCallback?.(result);
        this.broadcastResult(result);
      }
    }, REVALIDATION_DEBOUNCE_MS);
  }

  /** Cleanup */
  destroy(): void {
    this.stopObserver();
    this.onResultCallback = null;
    this.lastResult = null;
  }
}

// ─── Singleton ──────────────────────────────────────────────

let instance: SelectorHealthcheck | null = null;

export function getSelectorHealthcheck(): SelectorHealthcheck {
  if (!instance) {
    instance = new SelectorHealthcheck();
  }
  return instance;
}

/** Test helper: reset singleton */
export function resetSelectorHealthcheck(): void {
  instance?.destroy();
  instance = null;
}
