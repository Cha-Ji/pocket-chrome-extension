// ============================================================
// DOM Snapshot — Capture selector presence/count for env research
// ============================================================
// Captures *existence* and *count* of key DOM selectors.
// Never captures sensitive content (balances, account IDs, etc.).
// Text snippets are scrubbed through a PII regex before storage.
// ============================================================

import { PO_DEMO_SELECTORS, PO_PAYOUT_SELECTORS, PO_PRICE_SELECTORS, PO_DEMO_DETECTION } from '../platform/adapters/pocket-option/selectors';
import type { PocketOptionEnvironment } from './env-detect';

export interface SelectorProbe {
  exists: boolean;
  count: number;
  /** First 50 chars of textContent, PII-scrubbed. Only for text-bearing elements. */
  textSnippet?: string;
}

export interface DOMSnapshotResult {
  environment: PocketOptionEnvironment;
  timestamp: number;
  url: {
    path: string;
    hasDemoInPath: boolean;
  };
  selectors: Record<string, SelectorProbe>;
}

/**
 * Regex patterns for PII/sensitive data that must be stripped from text snippets.
 * Matches common patterns for emails, numbers that look like account IDs or balances,
 * and token-like strings.
 */
const PII_PATTERNS = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,  // email
  /\b\d{6,}\b/g,                                          // long numeric IDs
  /\b[A-Za-z0-9_-]{20,}\b/g,                              // token-like strings
  /\$[\d,.]+/g,                                            // dollar amounts
  /[\d,.]+\s*(USD|EUR|RUB|BTC|ETH)/gi,                    // currency amounts
];

/** Strip PII from a text snippet */
function scrubPII(text: string): string {
  let scrubbed = text;
  for (const pattern of PII_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, '[REDACTED]');
  }
  return scrubbed.slice(0, 50);
}

/** Probe a single CSS selector */
function probeSelector(selector: string, captureText: boolean = false): SelectorProbe {
  try {
    const elements = document.querySelectorAll(selector);
    const result: SelectorProbe = {
      exists: elements.length > 0,
      count: elements.length,
    };

    if (captureText && elements.length > 0) {
      const rawText = elements[0].textContent?.trim() || '';
      result.textSnippet = scrubPII(rawText);
    }

    return result;
  } catch {
    return { exists: false, count: 0 };
  }
}

/**
 * Selectors to probe — maps a human-readable key to { selector, captureText }.
 * captureText=true only for non-sensitive elements (labels, class indicators).
 */
const PROBE_MAP: Array<{ key: string; selector: string; captureText: boolean }> = [
  // Core trading selectors
  { key: 'callButton', selector: PO_DEMO_SELECTORS.callButton, captureText: false },
  { key: 'putButton', selector: PO_DEMO_SELECTORS.putButton, captureText: false },
  { key: 'amountInput', selector: PO_DEMO_SELECTORS.amountInput, captureText: false },
  { key: 'balanceDisplay', selector: PO_DEMO_SELECTORS.balanceDisplay, captureText: false },
  { key: 'balanceLabel', selector: PO_DEMO_SELECTORS.balanceLabel, captureText: true },
  { key: 'tickerSelector', selector: PO_DEMO_SELECTORS.tickerSelector, captureText: true },
  { key: 'chartContainer', selector: PO_DEMO_SELECTORS.chartContainer, captureText: false },
  { key: 'expirationDisplay', selector: PO_DEMO_SELECTORS.expirationDisplay, captureText: true },

  // Demo detection
  { key: 'demoChartClass', selector: PO_DEMO_DETECTION.demoChartClass, captureText: false },

  // Payout monitor
  { key: 'assetList', selector: PO_PAYOUT_SELECTORS.assetList, captureText: false },
  { key: 'assetItem', selector: PO_PAYOUT_SELECTORS.assetItem, captureText: false },
  { key: 'pairTrigger', selector: PO_PAYOUT_SELECTORS.pairTrigger, captureText: true },

  // Price display
  { key: 'currentPrice', selector: PO_PRICE_SELECTORS.currentPrice, captureText: false },
  { key: 'chartCanvas', selector: PO_PRICE_SELECTORS.chartCanvas, captureText: false },
  { key: 'assetName', selector: PO_PRICE_SELECTORS.assetName, captureText: true },
  { key: 'serverTime', selector: PO_PRICE_SELECTORS.serverTime, captureText: true },
];

/**
 * Capture a DOM snapshot with all probed selectors.
 */
export function captureDOMSnapshot(environment: PocketOptionEnvironment): DOMSnapshotResult {
  const selectors: Record<string, SelectorProbe> = {};

  for (const probe of PROBE_MAP) {
    selectors[probe.key] = probeSelector(probe.selector, probe.captureText);
  }

  return {
    environment,
    timestamp: Date.now(),
    url: {
      path: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
      hasDemoInPath: typeof window !== 'undefined' ? window.location.pathname.includes('/demo') : false,
    },
    selectors,
  };
}

/** Exported for testing */
export { scrubPII, probeSelector };
