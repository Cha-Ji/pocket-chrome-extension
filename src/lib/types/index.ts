// ============================================================
// Core Types for Pocket Quant Trader
// ============================================================

/** Tick data from price feed */
export interface Tick {
  id?: number;
  ticker: string;
  timestamp: number;
  price: number;
  serverTime?: number;
}

/**
 * Configuration for tick storage policy.
 * Controls sampling, batching, and retention to prevent
 * IndexedDB bloat under high-frequency tick ingestion.
 */
export interface TickStoragePolicy {
  /** Minimum ms between stored ticks for the same ticker (sampling). Default 500. */
  sampleIntervalMs: number;
  /** Max ticks to buffer before flushing to DB. Default 100. */
  batchSize: number;
  /** Max ms to hold buffered ticks before flushing. Default 500. */
  flushIntervalMs: number;
  /** Hard cap on total tick rows in DB. Default 5000. */
  maxTicks: number;
  /** Max age in ms for ticks. Ticks older than this are deleted. Default 2h. */
  maxAgeMs: number;
  /** How often (ms) to run the retention sweep. Default 30000. */
  retentionIntervalMs: number;
}

/** Trading direction */
export type Direction = 'CALL' | 'PUT';

/** Trade result */
export type TradeResult = 'WIN' | 'LOSS' | 'TIE' | 'PENDING';

/** Trading session type */
export type SessionType = 'BACKTEST' | 'FORWARD_TEST' | 'LIVE';

/** Strategy configuration */
export interface Strategy {
  id?: number;
  name: string;
  description?: string;
  config: StrategyConfig;
  createdAt: number;
  updatedAt: number;
}

export interface StrategyConfig {
  indicators: IndicatorConfig[];
  entryConditions: EntryCondition[];
  exitDuration: number; // seconds
  riskPerTrade: number; // percentage
}

export interface IndicatorConfig {
  type: IndicatorType;
  params: Record<string, number>;
}

export type IndicatorType = 'RSI' | 'BB' | 'SMA' | 'EMA' | 'MACD' | 'STOCH';

export interface EntryCondition {
  indicator: IndicatorType;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'cross_above' | 'cross_below';
  value: number | string;
  direction: Direction;
}

/** Trading session */
export interface Session {
  id?: number;
  type: SessionType;
  strategyId: number;
  startTime: number;
  endTime?: number;
  initialBalance: number;
  finalBalance?: number;
  winRate?: number;
  totalTrades: number;
  wins: number;
  losses: number;
  ties: number;
}

/** Individual trade record */
export interface Trade {
  id?: number;
  sessionId: number;
  ticker: string;
  direction: Direction;
  entryTime: number;
  entryPrice: number;
  exitTime?: number;
  exitPrice?: number;
  result: TradeResult;
  profit?: number;
  amount: number;
  snapshot?: TradeSnapshot;
}

export interface TradeSnapshot {
  indicators: Record<string, number>;
  priceHistory: number[];
}

export interface ErrorLog {
  id?: number;
  timestamp: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  module: string;
  message: string;
  stack?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================
// Shared Types for Message Contracts
// ============================================================
// These types are used across module boundaries (content-script,
// background, side-panel) and serve as the single source of truth
// for message payloads.
// ============================================================

import type { Signal } from '../signals/types';

/** Strategy filter configuration */
export interface StrategyFilter {
  /** 'all' = no filter, 'allowlist' = only listed, 'denylist' = exclude listed */
  mode: 'all' | 'allowlist' | 'denylist';
  /** Strategy ID patterns to match (e.g. 'RSI-BB', 'TIF-60', 'SBB-120') */
  patterns: string[];
}

/** V2 자동매매 설정 */
export interface TradingConfigV2 {
  enabled: boolean;
  autoAssetSwitch: boolean;
  minPayout: number;
  tradeAmount: number;
  maxDrawdown: number;
  maxConsecutiveLosses: number;
  /**
   * @deprecated Use strategyFilter instead.
   * Kept for backward compatibility — if strategyFilter is undefined,
   * onlyRSI=true is equivalent to { mode: 'allowlist', patterns: ['RSI'] }.
   */
  onlyRSI: boolean;
  /** Strategy allowlist/denylist filter. Takes precedence over onlyRSI. */
  strategyFilter?: StrategyFilter;
}

/** 자산 페이아웃 정보 */
export interface AssetPayout {
  name: string;
  payout: number;
  isOTC: boolean;
  lastUpdated: number;
}

/** 기술적 지표 값 */
export interface IndicatorValues {
  rsi?: number;
  stochasticK?: number;
  stochasticD?: number;
  macd?: {
    macd: number;
    signal: number;
    histogram: number;
  };
  bollingerBands?: {
    upper: number;
    middle: number;
    lower: number;
  };
  timestamp: number;
}

/** 텔레그램 알림 설정 */
export interface TelegramConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
  notifySignals: boolean;
  notifyTrades: boolean;
  notifyErrors: boolean;
}

/** WebSocket 가격 업데이트 */
export interface PriceUpdate {
  symbol: string;
  price: number;
  timestamp: number;
  source: 'websocket';
}

/** WebSocket 연결 상태 */
export interface WebSocketConnection {
  id: string;
  url: string;
  isPriceRelated: boolean;
  readyState: 'connecting' | 'open' | 'closing' | 'closed';
  messageCount: number;
  lastMessageAt: number | null;
}

// ============================================================
// Message Types for Extension Communication
// ============================================================

/** Maps each message type to its payload type. `undefined` = no payload. */
export interface MessagePayloadMap {
  // Legacy V1
  START_TRADING: undefined;
  STOP_TRADING: undefined;
  TICK_DATA: Tick;
  TRADE_EXECUTED: {
    signalId?: string;
    result: boolean;
    timestamp: number;
    direction?: Direction;
    amount?: number;
    ticker?: string;
    entryPrice?: number;
    error?: string;
  };
  TRADE_LOGGED: Trade;
  FINALIZE_TRADE: {
    tradeId: number;
    signalId?: string;
    exitPrice: number;
    result: TradeResult;
    profit: number;
  };
  TRADE_SETTLED: {
    tradeId: number;
    signalId?: string;
    result: TradeResult;
    exitPrice: number;
    profit: number;
    exitTime: number;
  };
  GET_TRADES: { sessionId?: number; limit?: number };
  STATUS_UPDATE: TradingStatus;
  GET_STATUS: undefined;
  // V2 API
  GET_STATUS_V2: undefined;
  GET_LLM_REPORT: undefined;
  SET_CONFIG_V2: Partial<TradingConfigV2>;
  START_TRADING_V2: undefined;
  STOP_TRADING_V2: undefined;
  GET_SIGNALS: { limit?: number };
  GET_HIGH_PAYOUT_ASSETS: undefined;
  SWITCH_ASSET: { assetName: string };
  EXPORT_CANDLES: { ticker: string };
  UPDATE_SIGNAL_RESULT: { signalId: string; result: string };
  NEW_SIGNAL_V2: { signal: Signal; config: TradingConfigV2 };
  PAYOUT_UPDATE: { highPayoutAssets: AssetPayout[]; totalAssets: number };
  BEST_ASSET: AssetPayout;
  // Indicator API
  GET_PAGE_INDICATORS: undefined;
  GET_PAGE_RSI: undefined;
  GET_PAGE_STOCHASTIC: undefined;
  READ_INDICATORS_NOW: undefined;
  INDICATOR_UPDATE: IndicatorValues;
  INDICATOR_VALUES: IndicatorValues;
  // WebSocket Interceptor API
  GET_WS_STATUS: undefined;
  GET_WS_CONNECTIONS: undefined;
  GET_WS_MESSAGES: undefined;
  SET_WS_ANALYSIS_MODE: { enabled: boolean };
  CLEAR_WS_MESSAGES: undefined;
  WS_PRICE_UPDATE: PriceUpdate;
  WS_MESSAGE: { connectionId: string; parsed: unknown; timestamp: number };
  WS_CONNECTION: WebSocketConnection;
  // Auto Miner
  START_AUTO_MINER: undefined;
  STOP_AUTO_MINER: undefined;
  GET_MINER_STATUS: undefined;
  SET_MINER_CONFIG: {
    offsetSeconds?: number;
    maxDaysBack?: number;
    requestDelayMs?: number;
    // 필터 override
    minPayout?: number;
    onlyOTC?: boolean;
    // 인스턴스 파티셔닝
    instanceId?: number;
    numInstances?: number;
  };
  // Candle DB (Content Script → Background)
  CANDLE_FINALIZED: {
    ticker: string;
    interval: number;
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
    source?: string;
  };
  CANDLE_HISTORY_CHUNK: {
    symbol: string;
    interval: number;
    candles: Array<{
      timestamp: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume?: number;
    }>;
    source?: string;
    /** If true, this is the last chunk for the current history request */
    isFinal?: boolean;
  };
  // Candle DB Stats (Side Panel → Background)
  GET_CANDLE_DB_STATS: undefined;
  // DB Monitor
  GET_DB_MONITOR_STATUS: undefined;
  GET_TICK_BUFFER_STATS: undefined;
  FLUSH_TICK_BUFFER: undefined;
  RUN_TICK_RETENTION: undefined;
  DRAIN_SENDER_RETRY_QUEUE: { maxRetries?: number };
  // Mining Status
  TOGGLE_MINING: { active: boolean };
  MINING_STATS: { collected: number };
  MINING_STOPPED: undefined;
  MINER_STATUS_PUSH: Record<string, unknown>;
  // Telegram
  RELOAD_TELEGRAM_CONFIG: TelegramConfig;
  // Error Handling
  GET_ERROR_STATS: undefined;
  GET_ERROR_HISTORY: { limit?: number };
  // Account Verification (#52)
  ACCOUNT_VERIFY_ALERT: {
    level: 'info' | 'warn' | 'critical';
    message: string;
    accountType: AccountType;
    source: string;
  };
  // Selector Healthcheck
  GET_SELECTOR_HEALTHCHECK: undefined;
  SELECTOR_HEALTHCHECK_RESULT: {
    environment: 'demo' | 'real' | 'unknown';
    timestamp: number;
    version: string;
    passed: boolean;
    tradingHalted: boolean;
    criticalFailures: string[];
    nonCriticalFailures: string[];
    snapshot?: Record<string, boolean>;
  };
}

/** All valid message type strings */
export type MessageType = keyof MessagePayloadMap;

/**
 * Discriminated union for extension messages.
 * Narrows payload type when switching on `message.type`.
 */
export type ExtensionMessage = {
  [K in MessageType]: MessagePayloadMap[K] extends undefined
    ? { type: K; payload?: undefined }
    : { type: K; payload: MessagePayloadMap[K] };
}[MessageType];

/**
 * Type-safe message sender. Use to construct messages with correct payloads.
 *
 * @example
 * ```typescript
 * const msg: TypedMessage<'TRADE_EXECUTED'> = {
 *   type: 'TRADE_EXECUTED',
 *   payload: { signalId: 'abc', timestamp: Date.now() }
 * }
 * ```
 */
export type TypedMessage<K extends MessageType> = MessagePayloadMap[K] extends undefined
  ? { type: K; payload?: undefined }
  : { type: K; payload: MessagePayloadMap[K] };

export interface TradingStatus {
  isRunning: boolean;
  currentTicker?: string;
  balance?: number;
  sessionId?: number;
}

// ============================================================
// DOM Selector Types
// ============================================================

export interface DOMSelectors {
  [key: string]: string;

  // Trading controls
  callButton: string;
  putButton: string;
  amountInput: string;
  expirationDisplay: string;

  // Display elements
  balanceDisplay: string;
  balanceLabel: string;
  tickerSelector: string;
  chartContainer: string;
  priceDisplay: string;

  // Account type detection
  demoIndicator: string;
}

/**
 * @deprecated Use platform adapter selectors instead.
 * @see src/lib/platform/adapters/pocket-option/selectors.ts
 */
export const DEFAULT_SELECTORS: DOMSelectors = {
  // Trading buttons (updated 2026-02-18)
  callButton: '.btn-call',
  putButton: '.btn-put',
  amountInput: '#put-call-buttons-chart-1 input',
  expirationDisplay: '.block--expiration-inputs .value__val',

  // Display elements
  balanceDisplay: '.balance-info-block__balance',
  balanceLabel: '.balance-info-block__label', // Shows "QT Demo" or account type
  tickerSelector: '.chart-item .pair', // e.g., "Alibaba OTC"
  chartContainer: '.chart-item',
  priceDisplay: '.chart-item', // Price extracted from chart (TBD - may need canvas reading)

  // Demo detection
  demoIndicator: '.balance-info-block__label', // Contains "Demo" text when demo
};

// ============================================================
// Account Type Detection
// ============================================================

export type AccountType = 'DEMO' | 'LIVE' | 'UNKNOWN';

export interface AccountInfo {
  type: AccountType;
  balance: number;
  currency: string;
}

/**
 * Check if current session is demo mode
 * CRITICAL: Must return true for demo, false for live
 * When in doubt, return false (safer - prevents live trading)
 * @deprecated Use ISafetyGuard.isDemoMode() from platform adapter instead.
 * @see src/lib/platform/interfaces.ts
 */
export function isDemoMode(): boolean {
  // Method 1: URL check (most reliable)
  if (window.location.pathname.includes('demo')) {
    return true;
  }

  // Method 2: Check for demo class on chart
  if (document.querySelector('.is-chart-demo')) {
    return true;
  }

  // Method 3: Check balance label text
  const balanceLabel = document.querySelector(DEFAULT_SELECTORS.demoIndicator);
  if (balanceLabel?.textContent?.toLowerCase().includes('demo')) {
    return true;
  }

  // When uncertain, assume LIVE (safer - prevents accidental live trading)
  return false;
}

/**
 * Get current account type with confidence level
 * @deprecated Use ISafetyGuard.getAccountType() from platform adapter instead.
 * @see src/lib/platform/interfaces.ts
 */
export function getAccountType(): { type: AccountType; confidence: 'high' | 'medium' | 'low' } {
  const urlHasDemo = window.location.pathname.includes('demo');
  const hasChartDemoClass = !!document.querySelector('.is-chart-demo');
  const labelText =
    document.querySelector(DEFAULT_SELECTORS.demoIndicator)?.textContent?.toLowerCase() || '';
  const labelHasDemo = labelText.includes('demo');

  // All indicators agree on demo
  if (urlHasDemo && hasChartDemoClass && labelHasDemo) {
    return { type: 'DEMO', confidence: 'high' };
  }

  // URL says demo (most reliable)
  if (urlHasDemo) {
    return { type: 'DEMO', confidence: 'medium' };
  }

  // URL doesn't have demo - likely live
  if (!urlHasDemo && !labelHasDemo) {
    return { type: 'LIVE', confidence: 'medium' };
  }

  // Mixed signals
  return { type: 'UNKNOWN', confidence: 'low' };
}
