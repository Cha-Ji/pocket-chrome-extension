// ============================================================
// Signal Types
// ============================================================

export interface Candle {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export interface Signal {
  id: string
  timestamp: number
  symbol: string
  direction: 'CALL' | 'PUT'
  strategy: string
  regime: MarketRegime
  confidence: number
  expiry: number // seconds
  entryPrice: number
  indicators: Record<string, number>
  status: 'pending' | 'active' | 'win' | 'loss' | 'expired'
}

export type MarketRegime = 
  | 'strong_uptrend' 
  | 'weak_uptrend' 
  | 'ranging' 
  | 'weak_downtrend' 
  | 'strong_downtrend'
  | 'unknown'

export interface StrategyConfig {
  id: string
  name: string
  type: 'reversal' | 'trend' | 'momentum'
  bestRegimes: MarketRegime[]
  minWinRate: number
  params: Record<string, number>
}

export interface SignalGeneratorConfig {
  symbols: string[]
  interval: string // '1m', '5m', etc
  strategies: StrategyConfig[]
  minConfidence: number
  expirySeconds: number
}

export interface RegimeInfo {
  regime: MarketRegime
  adx: number
  trendDirection: number // +1, 0, -1
  confidence: number
}
