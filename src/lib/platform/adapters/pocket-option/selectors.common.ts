// ============================================================
// Common Selectors — shared across Demo and Real environments
// ============================================================


/** Selector set version — bump when PO DOM structure changes */
export const SELECTOR_VERSION = '1.0.0';

/** Platform environment type */
export type PlatformEnvironment = 'demo' | 'real' | 'unknown';

/** Pocket Option domain patterns */
export const PO_DOMAINS = ['pocketoption.com', 'po.trade', 'po2.trade'] as const;

/**
 * Critical selector keys — ALL must resolve for trading to be safe.
 * If any critical selector fails, trading is halted.
 */
export const CRITICAL_SELECTOR_KEYS: string[] = [
  'callButton',
  'putButton',
  'amountInput',
  'balanceDisplay',
];

/**
 * Non-critical selector keys — warn but don't halt trading.
 * Failures are logged and shown in UI but don't block execution.
 */
export const NON_CRITICAL_SELECTOR_KEYS: string[] = [
  'tickerSelector',
  'chartContainer',
  'priceDisplay',
  'expirationDisplay',
  'balanceLabel',
  'demoIndicator',
];

/** Payout monitoring selectors (shared across environments) */
export const PO_PAYOUT_SELECTORS = {
  assetList: '.assets-block__alist.alist',
  assetItem: '.alist__item',
  assetLabel: '.alist__label',
  assetProfit: '.alist__payout',
  pairTrigger: '.current-symbol',
  overlay: '.modal-overlay',
} as const;

/** Price collection selectors (shared across environments) */
export const PO_PRICE_SELECTORS = {
  currentPrice: '.chart-item .value, .chart-block__price .value',
  priceValue: '.chart-item .value__val, .chart-block__price .value__val',
  chartCanvas: 'canvas.chart-area',
  chartContainer: '.chart-item, .chart-block',
  assetName: '.chart-item .pair, .chart-block .pair',
  serverTime: '.server-time, .time-block',
} as const;

/** Demo detection CSS selectors */
export const PO_DEMO_DETECTION = {
  demoChartClass: '.is-chart-demo',
  balanceLabel: '.balance-info-block__label',
} as const;

/** Real mode detection selectors */
export const PO_REAL_DETECTION = {
  /** Real mode: .is-chart-demo class is absent */
  balanceLabel: '.balance-info-block__label',
} as const;
