// ============================================================
// Backtest Types
// ============================================================

/** OHLCV Candle data */
export interface Candle {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

/** Single tick/price point */
export interface PriceTick {
  timestamp: number
  price: number
}

/** Trade direction */
export type Direction = 'CALL' | 'PUT'

/** Trade result */
export type TradeResult = 'WIN' | 'LOSS' | 'TIE'

/** Single backtest trade */
export interface BacktestTrade {
  entryTime: number
  entryPrice: number
  exitTime: number
  exitPrice: number
  direction: Direction
  result: TradeResult
  payout: number // percentage
  profit: number // actual profit/loss amount
  strategySignal?: Record<string, number> // indicator values at entry
}

/** Backtest configuration */
export interface BacktestConfig {
  // Data
  symbol: string
  startTime: number
  endTime: number
  
  // Trading params
  initialBalance: number
  betAmount: number // fixed or percentage
  betType: 'fixed' | 'percentage'
  payout: number // expected payout percentage (e.g., 92)
  expirySeconds: number // trade duration
  
  // Strategy
  strategyId: string
  strategyParams: Record<string, number>
}

/** Backtest result summary */
export interface BacktestResult {
  config: BacktestConfig
  
  // Performance
  totalTrades: number
  wins: number
  losses: number
  ties: number
  winRate: number // percentage
  
  // Profit
  initialBalance: number
  finalBalance: number
  netProfit: number
  netProfitPercent: number
  maxDrawdown: number
  maxDrawdownPercent: number
  
  // Risk metrics
  sharpeRatio?: number
  profitFactor: number // gross profit / gross loss
  expectancy: number // average profit per trade
  
  // Time
  startTime: number
  endTime: number
  durationMs: number
  
  // Trade history
  trades: BacktestTrade[]
  equityCurve: { timestamp: number; balance: number }[]
}

/** Strategy signal */
export interface StrategySignal {
  direction: Direction | null // null = no trade
  confidence: number // 0-1
  indicators: Record<string, number>
  reason?: string
}

/** Strategy interface */
export interface Strategy {
  id: string
  name: string
  description: string
  params: Record<string, { default: number; min: number; max: number; step: number }>
  
  /**
   * Generate signal based on candle data
   * @param candles Historical candles (oldest first)
   * @param params Strategy parameters
   * @returns Signal or null if not enough data
   */
  generateSignal(candles: Candle[], params: Record<string, number>): StrategySignal | null
}
