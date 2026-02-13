// ============================================================
// Core Types for Pocket Quant Trader
// ============================================================

/** Tick data from price feed */
export interface Tick {
  id?: number
  ticker: string
  timestamp: number
  price: number
  serverTime?: number
}

/** Trading direction */
export type Direction = 'CALL' | 'PUT'

/** Trade result */
export type TradeResult = 'WIN' | 'LOSS' | 'TIE' | 'PENDING'

/** Trading session type */
export type SessionType = 'BACKTEST' | 'FORWARD_TEST' | 'LIVE'

/** Strategy configuration */
export interface Strategy {
  id?: number
  name: string
  description?: string
  config: StrategyConfig
  createdAt: number
  updatedAt: number
}

export interface StrategyConfig {
  indicators: IndicatorConfig[]
  entryConditions: EntryCondition[]
  exitDuration: number // seconds
  riskPerTrade: number // percentage
}

export interface IndicatorConfig {
  type: IndicatorType
  params: Record<string, number>
}

export type IndicatorType = 'RSI' | 'BB' | 'SMA' | 'EMA' | 'MACD' | 'STOCH'

export interface EntryCondition {
  indicator: IndicatorType
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'cross_above' | 'cross_below'
  value: number | string
  direction: Direction
}

/** Trading session */
export interface Session {
  id?: number
  type: SessionType
  strategyId: number
  startTime: number
  endTime?: number
  initialBalance: number
  finalBalance?: number
  winRate?: number
  totalTrades: number
  wins: number
  losses: number
}

/** Individual trade record */
export interface Trade {
  id?: number
  sessionId: number
  ticker: string
  direction: Direction
  entryTime: number
  entryPrice: number
  exitTime?: number
  exitPrice?: number
  result: TradeResult
  profit?: number
  amount: number
  snapshot?: TradeSnapshot
}

export interface TradeSnapshot {
  indicators: Record<string, number>
  priceHistory: number[]
}

export interface ErrorLog {
  id?: number
  timestamp: number
  severity: 'info' | 'warning' | 'error' | 'critical'
  module: string
  message: string
  stack?: string
  metadata?: Record<string, unknown>
}

// ============================================================
// Message Types for Extension Communication
// ============================================================

/** Maps each message type to its payload type. `undefined` = no payload. */
export interface MessagePayloadMap {
  // Legacy V1
  START_TRADING: undefined
  STOP_TRADING: undefined
  TICK_DATA: Tick
  TRADE_EXECUTED: { signalId?: string; result?: unknown; timestamp?: number }
  TRADE_LOGGED: Trade
  GET_TRADES: { sessionId?: number; limit?: number }
  STATUS_UPDATE: TradingStatus
  GET_STATUS: undefined
  // V2 API
  GET_STATUS_V2: undefined
  GET_LLM_REPORT: undefined
  SET_CONFIG_V2: Record<string, unknown>
  START_TRADING_V2: undefined
  STOP_TRADING_V2: undefined
  GET_SIGNALS: undefined
  GET_HIGH_PAYOUT_ASSETS: undefined
  SWITCH_ASSET: { assetName: string }
  EXPORT_CANDLES: { ticker: string }
  UPDATE_SIGNAL_RESULT: { signalId: string; result: string }
  NEW_SIGNAL_V2: { signal: unknown; config: unknown }
  PAYOUT_UPDATE: unknown[]
  BEST_ASSET: { name: string; payout: number }
  // Indicator API
  GET_PAGE_INDICATORS: undefined
  GET_PAGE_RSI: undefined
  GET_PAGE_STOCHASTIC: undefined
  READ_INDICATORS_NOW: undefined
  INDICATOR_UPDATE: Record<string, unknown>
  INDICATOR_VALUES: Record<string, unknown>
  // WebSocket Interceptor API
  GET_WS_STATUS: undefined
  GET_WS_CONNECTIONS: undefined
  GET_WS_MESSAGES: undefined
  SET_WS_ANALYSIS_MODE: { enabled: boolean }
  CLEAR_WS_MESSAGES: undefined
  WS_PRICE_UPDATE: { symbol: string; price: number; timestamp: number }
  WS_MESSAGE: { connectionId: string; parsed: unknown; timestamp: number }
  WS_CONNECTION: { id: string; url: string; readyState: string }
  // Auto Miner
  START_AUTO_MINER: undefined
  STOP_AUTO_MINER: undefined
  GET_MINER_STATUS: undefined
  SET_MINER_CONFIG: {
    offsetSeconds?: number
    maxDaysBack?: number
    requestDelayMs?: number
  }
  // DB Monitor
  GET_DB_MONITOR_STATUS: undefined
  // Mining Status
  TOGGLE_MINING: { active: boolean }
  MINING_STATS: { collected: number }
  MINING_STOPPED: undefined
  MINER_STATUS_PUSH: Record<string, unknown>
  // Telegram
  RELOAD_TELEGRAM_CONFIG: undefined
  // Error Handling
  GET_ERROR_STATS: undefined
  GET_ERROR_HISTORY: { limit?: number }
}

/** All valid message type strings */
export type MessageType = keyof MessagePayloadMap

/**
 * Discriminated union for extension messages.
 * Narrows payload type when switching on `message.type`.
 */
export type ExtensionMessage = {
  [K in MessageType]: MessagePayloadMap[K] extends undefined
    ? { type: K; payload?: undefined }
    : { type: K; payload: MessagePayloadMap[K] }
}[MessageType]

export interface TradingStatus {
  isRunning: boolean
  currentTicker?: string
  balance?: number
  sessionId?: number
}

// ============================================================
// DOM Selector Types
// ============================================================

export interface DOMSelectors {
  [key: string]: string

  // Trading controls
  callButton: string
  putButton: string
  amountInput: string
  expirationDisplay: string

  // Display elements
  balanceDisplay: string
  balanceLabel: string
  tickerSelector: string
  chartContainer: string
  priceDisplay: string

  // Account type detection
  demoIndicator: string
}

/**
 * @deprecated Use platform adapter selectors instead.
 * @see src/lib/platform/adapters/pocket-option/selectors.ts
 */
export const DEFAULT_SELECTORS: DOMSelectors = {
  // Trading buttons
  callButton: '.switch-state-block__item:first-child', // 매수 button
  putButton: '.switch-state-block__item:last-child',   // 매도 button
  amountInput: '#put-call-buttons-chart-1 input[type="text"]',
  expirationDisplay: '.block--expiration-inputs .value__val',

  // Display elements  
  balanceDisplay: '.balance-info-block__value',
  balanceLabel: '.balance-info-block__label', // Shows "QT Demo" or account type
  tickerSelector: '.chart-item .pair',         // e.g., "Alibaba OTC"
  chartContainer: '.chart-item',
  priceDisplay: '.chart-item', // Price extracted from chart (TBD - may need canvas reading)

  // Demo detection
  demoIndicator: '.balance-info-block__label', // Contains "Demo" text when demo
}

// ============================================================
// Account Type Detection
// ============================================================

export type AccountType = 'DEMO' | 'LIVE' | 'UNKNOWN'

export interface AccountInfo {
  type: AccountType
  balance: number
  currency: string
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
    return true
  }

  // Method 2: Check for demo class on chart
  if (document.querySelector('.is-chart-demo')) {
    return true
  }

  // Method 3: Check balance label text
  const balanceLabel = document.querySelector(DEFAULT_SELECTORS.demoIndicator)
  if (balanceLabel?.textContent?.toLowerCase().includes('demo')) {
    return true
  }

  // When uncertain, assume LIVE (safer - prevents accidental live trading)
  return false
}

/**
 * Get current account type with confidence level
 * @deprecated Use ISafetyGuard.getAccountType() from platform adapter instead.
 * @see src/lib/platform/interfaces.ts
 */
export function getAccountType(): { type: AccountType; confidence: 'high' | 'medium' | 'low' } {
  const urlHasDemo = window.location.pathname.includes('demo')
  const hasChartDemoClass = !!document.querySelector('.is-chart-demo')
  const labelText = document.querySelector(DEFAULT_SELECTORS.demoIndicator)?.textContent?.toLowerCase() || ''
  const labelHasDemo = labelText.includes('demo')

  // All indicators agree on demo
  if (urlHasDemo && hasChartDemoClass && labelHasDemo) {
    return { type: 'DEMO', confidence: 'high' }
  }

  // URL says demo (most reliable)
  if (urlHasDemo) {
    return { type: 'DEMO', confidence: 'medium' }
  }

  // URL doesn't have demo - likely live
  if (!urlHasDemo && !labelHasDemo) {
    return { type: 'LIVE', confidence: 'medium' }
  }

  // Mixed signals
  return { type: 'UNKNOWN', confidence: 'low' }
}
