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

export type IndicatorType = 'RSI' | 'BB' | 'SMA' | 'EMA' | 'MACD'

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
  | 'START_TRADING'
  | 'STOP_TRADING'
  | 'TICK_DATA'
  | 'TRADE_EXECUTED'
  | 'STATUS_UPDATE'
  | 'GET_STATUS'

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
// DOM Selector Types (to be filled after login)
// ============================================================

export interface DOMSelectors {
  priceDisplay: string
  callButton: string
  putButton: string
  balanceDisplay: string
  tickerSelector: string
  chartContainer: string
}

// Placeholder - actual selectors will be discovered after login
export const DEFAULT_SELECTORS: DOMSelectors = {
  priceDisplay: '[data-testid="price"]', // TBD
  callButton: '[data-testid="call-btn"]', // TBD
  putButton: '[data-testid="put-btn"]', // TBD
  balanceDisplay: '[data-testid="balance"]', // TBD
  tickerSelector: '[data-testid="ticker"]', // TBD
  chartContainer: '[data-testid="chart"]', // TBD
}
