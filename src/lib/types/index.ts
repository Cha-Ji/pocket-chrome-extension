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

// ============================================================
// Message Types for Extension Communication
// ============================================================

export type MessageType =
  // Legacy V1
  | 'START_TRADING'
  | 'STOP_TRADING'
  | 'TICK_DATA'
  | 'TRADE_EXECUTED'
  | 'STATUS_UPDATE'
  | 'GET_STATUS'
  // V2 API
  | 'GET_STATUS_V2'
  | 'GET_LLM_REPORT'
  | 'SET_CONFIG_V2'
  | 'START_TRADING_V2'
  | 'STOP_TRADING_V2'
  | 'GET_SIGNALS'
  | 'GET_HIGH_PAYOUT_ASSETS'
  | 'SWITCH_ASSET'
  | 'EXPORT_CANDLES'
  | 'UPDATE_SIGNAL_RESULT'
  | 'NEW_SIGNAL_V2'
  | 'PAYOUT_UPDATE'
  | 'BEST_ASSET'

export interface ExtensionMessage<T = unknown> {
  type: MessageType
  payload?: T
}

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

// Discovered selectors from Pocket Option (2026-01-29)
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
