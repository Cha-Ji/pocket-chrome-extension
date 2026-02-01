// ============================================================
// Signal Generator V2 - Forward Test 결과 기반 개선
// ============================================================
// - RSI 전략 중심 (실전 100% 승률)
// - Stochastic 제거 (실전 25% 실패)
// - DOM 기반 데이터 수집
// ============================================================

import { Candle, Signal, MarketRegime, SignalGeneratorConfig } from './types'
import { 
  detectRegime, 
  getBestStrategiesV2, 
  executeStrategyV2,
  generateSignalsV2,
  WINNING_STRATEGIES_V2 
} from './strategies-v2'

// ============================================================
// Signal Generator V2 Class
// ============================================================

export class SignalGeneratorV2 {
  private config: SignalGeneratorConfig
  private candleBuffer: Map<string, Candle[]> = new Map()
  private signals: Signal[] = []
  private listeners: ((signal: Signal) => void)[] = []
  private lastSignalTime: Map<string, number> = new Map()
  private minSignalInterval = 60000 // 1분 (연속 신호 방지)
  
  constructor(config?: Partial<SignalGeneratorConfig>) {
    this.config = {
      symbols: ['BTCUSDT'],
      interval: '1m',
      strategies: WINNING_STRATEGIES_V2,
      minConfidence: 0.3,
      expirySeconds: 60,
      ...config
    }
  }
  
  // ============================================================
  // Public API
  // ============================================================
  
  /**
   * Add new candle and check for signals
   */
  addCandle(symbol: string, candle: Candle): Signal | null {
    // Get or create buffer
    if (!this.candleBuffer.has(symbol)) {
      this.candleBuffer.set(symbol, [])
    }
    
    const buffer = this.candleBuffer.get(symbol)!
    
    // 중복 캔들 체크
    const lastCandle = buffer[buffer.length - 1]
    if (lastCandle && lastCandle.timestamp === candle.timestamp) {
      // 같은 캔들 업데이트
      buffer[buffer.length - 1] = candle
    } else {
      buffer.push(candle)
    }
    
    // Keep last 100 candles
    if (buffer.length > 100) {
      buffer.shift()
    }
    
    // Need at least 50 candles for reliable signals
    if (buffer.length < 50) {
      return null
    }
    
    // 연속 신호 방지
    const lastSignal = this.lastSignalTime.get(symbol) || 0
    if (Date.now() - lastSignal < this.minSignalInterval) {
      return null
    }
    
    // Check for signals using V2 strategies
    return this.checkSignals(symbol, buffer)
  }
  
  /**
   * Set candle history (for initialization)
   */
  setHistory(symbol: string, candles: Candle[]): void {
    this.candleBuffer.set(symbol, candles.slice(-100))
  }
  
  /**
   * Get current market regime
   */
  getRegime(symbol: string): { regime: MarketRegime; adx: number; direction: number } | null {
    const candles = this.candleBuffer.get(symbol)
    if (!candles || candles.length < 50) return null
    return detectRegime(candles)
  }
  
  /**
   * Get recent signals
   */
  getSignals(limit = 10): Signal[] {
    return this.signals.slice(-limit)
  }
  
  /**
   * Get signal statistics
   */
  getStats(): {
    total: number
    wins: number
    losses: number
    pending: number
    winRate: number
    byStrategy: Record<string, { wins: number; losses: number; winRate: number }>
  } {
    const wins = this.signals.filter(s => s.status === 'win').length
    const losses = this.signals.filter(s => s.status === 'loss').length
    const pending = this.signals.filter(s => s.status === 'pending').length
    const completed = wins + losses
    
    // 전략별 통계
    const byStrategy: Record<string, { wins: number; losses: number; winRate: number }> = {}
    
    for (const signal of this.signals) {
      if (!byStrategy[signal.strategy]) {
        byStrategy[signal.strategy] = { wins: 0, losses: 0, winRate: 0 }
      }
      if (signal.status === 'win') byStrategy[signal.strategy].wins++
      if (signal.status === 'loss') byStrategy[signal.strategy].losses++
    }
    
    // 승률 계산
    for (const key of Object.keys(byStrategy)) {
      const s = byStrategy[key]
      const total = s.wins + s.losses
      s.winRate = total > 0 ? (s.wins / total) * 100 : 0
    }
    
    return {
      total: this.signals.length,
      wins,
      losses,
      pending,
      winRate: completed > 0 ? (wins / completed) * 100 : 0,
      byStrategy
    }
  }
  
  /**
   * Subscribe to new signals
   */
  onSignal(callback: (signal: Signal) => void): () => void {
    this.listeners.push(callback)
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback)
    }
  }
  
  /**
   * Update signal result
   */
  updateSignalResult(signalId: string, result: 'win' | 'loss'): void {
    const signal = this.signals.find(s => s.id === signalId)
    if (signal) {
      signal.status = result
    }
  }
  
  /**
   * Clear old signals
   */
  clearOldSignals(olderThanMs: number = 3600000): number {
    const cutoff = Date.now() - olderThanMs
    const before = this.signals.length
    this.signals = this.signals.filter(s => s.timestamp > cutoff)
    return before - this.signals.length
  }
  
  // ============================================================
  // Internal Methods
  // ============================================================
  
  private checkSignals(symbol: string, candles: Candle[]): Signal | null {
    // V2 멀티 전략 신호 생성
    const result = generateSignalsV2(candles)
    
    // 신호가 없으면 null
    if (!result.bestSignal || !result.bestSignal.direction) {
      return null
    }
    
    const best = result.bestSignal
    
    // 최소 신뢰도 체크
    if (best.confidence < this.config.minConfidence) {
      return null
    }
    
    // 추가 필터: 시장 상태와 전략 일치 확인
    if (!this.validateSignal(result.regime, best)) {
      return null
    }
    
    // 신호 생성 (direction은 위에서 null 체크됨)
    const signal = this.createSignal(
      symbol,
      best.direction!,
      best.strategyName,
      result,
      candles
    )
    
    this.signals.push(signal)
    this.lastSignalTime.set(symbol, Date.now())
    
    // Keep only last 100 signals
    if (this.signals.length > 100) {
      this.signals.shift()
    }
    
    // Notify listeners
    this.listeners.forEach(l => l(signal))
    
    return signal
  }
  
  private validateSignal(
    regime: MarketRegime, 
    signal: { strategyId: string; direction: 'CALL' | 'PUT' | null }
  ): boolean {
    if (!signal.direction) return false
    
    // RSI는 ranging 시장에서 가장 효과적
    if (signal.strategyId === 'rsi-v2') {
      // RSI PUT은 모든 시장에서 효과적 (Forward Test 100%)
      if (signal.direction === 'PUT') return true
      // RSI CALL은 상승 추세가 아닐 때만
      if (signal.direction === 'CALL' && !regime.includes('uptrend')) return true
    }
    
    // EMA Cross는 강한 추세에서만
    if (signal.strategyId === 'ema-cross-v2') {
      if (regime.includes('strong_')) {
        // CALL은 상승 추세, PUT은 하락 추세
        if (signal.direction === 'CALL' && regime === 'strong_uptrend') return true
        if (signal.direction === 'PUT' && regime === 'strong_downtrend') return true
      }
      return false
    }
    
    return true
  }
  
  private createSignal(
    symbol: string,
    direction: 'CALL' | 'PUT',
    strategyName: string,
    result: ReturnType<typeof generateSignalsV2>,
    candles: Candle[]
  ): Signal {
    const lastCandle = candles[candles.length - 1]
    
    return {
      id: `${symbol}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      symbol,
      direction,
      strategy: strategyName,
      regime: result.regime,
      confidence: result.bestSignal?.confidence || 0,
      expiry: this.config.expirySeconds,
      entryPrice: lastCandle.close,
      indicators: result.bestSignal?.indicators || {},
      status: 'pending'
    }
  }
}

// ============================================================
// Singleton Instance
// ============================================================

let generatorInstance: SignalGeneratorV2 | null = null

export function getSignalGeneratorV2(config?: Partial<SignalGeneratorConfig>): SignalGeneratorV2 {
  if (!generatorInstance) {
    generatorInstance = new SignalGeneratorV2(config)
  }
  return generatorInstance
}

// ============================================================
// LLM-Friendly Report Generator
// ============================================================

export interface BacktestReportV2 {
  summary: {
    totalTrades: number
    wins: number
    losses: number
    winRate: number
    netProfit: number
    profitFactor: number
    maxDrawdown: number
    recommendation: string
  }
  strategyPerformance: Array<{
    name: string
    trades: number
    winRate: number
    avgProfit: number
    recommendation: 'USE' | 'AVOID' | 'CONDITIONAL'
    conditions: string[]
  }>
  marketConditions: Array<{
    regime: MarketRegime
    trades: number
    winRate: number
    bestStrategy: string
  }>
  signals: Array<{
    time: string
    direction: 'CALL' | 'PUT'
    strategy: string
    result: 'win' | 'loss' | 'pending'
    regime: MarketRegime
    confidence: number
  }>
}

export function generateLLMReport(signals: Signal[]): BacktestReportV2 {
  const completed = signals.filter(s => s.status === 'win' || s.status === 'loss')
  const wins = completed.filter(s => s.status === 'win').length
  const losses = completed.filter(s => s.status === 'loss').length
  const winRate = completed.length > 0 ? (wins / completed.length) * 100 : 0
  
  // 전략별 성과
  const strategyMap = new Map<string, { wins: number; losses: number; profits: number[] }>()
  for (const s of completed) {
    if (!strategyMap.has(s.strategy)) {
      strategyMap.set(s.strategy, { wins: 0, losses: 0, profits: [] })
    }
    const data = strategyMap.get(s.strategy)!
    if (s.status === 'win') {
      data.wins++
      data.profits.push(10) // 92% payout 가정
    } else {
      data.losses++
      data.profits.push(-10)
    }
  }
  
  // 시장 상태별 성과
  const regimeMap = new Map<MarketRegime, { wins: number; losses: number; strategies: Map<string, number> }>()
  for (const s of completed) {
    if (!regimeMap.has(s.regime)) {
      regimeMap.set(s.regime, { wins: 0, losses: 0, strategies: new Map() })
    }
    const data = regimeMap.get(s.regime)!
    if (s.status === 'win') data.wins++
    else data.losses++
    
    const count = data.strategies.get(s.strategy) || 0
    data.strategies.set(s.strategy, count + (s.status === 'win' ? 1 : 0))
  }
  
  // 전략 추천
  const strategyPerformance = Array.from(strategyMap.entries()).map(([name, data]) => {
    const total = data.wins + data.losses
    const wr = total > 0 ? (data.wins / total) * 100 : 0
    const avgProfit = data.profits.length > 0 
      ? data.profits.reduce((a, b) => a + b, 0) / data.profits.length 
      : 0
    
    let recommendation: 'USE' | 'AVOID' | 'CONDITIONAL' = 'CONDITIONAL'
    let conditions: string[] = []
    
    if (name.includes('RSI')) {
      recommendation = wr >= 60 ? 'USE' : 'CONDITIONAL'
      conditions = ['Ranging 시장에서 최적', 'PUT 시그널 우선']
    } else if (name.includes('EMA')) {
      recommendation = wr >= 50 ? 'CONDITIONAL' : 'AVOID'
      conditions = ['ADX 30+ 필수', 'strong_trend에서만 사용']
    } else if (name.includes('Stoch')) {
      recommendation = 'AVOID'
      conditions = ['실전 테스트 실패 (25%)', '비활성화 권장']
    }
    
    return {
      name,
      trades: total,
      winRate: wr,
      avgProfit,
      recommendation,
      conditions
    }
  })
  
  // 시장 상태별 추천
  const marketConditions = Array.from(regimeMap.entries()).map(([regime, data]) => {
    const total = data.wins + data.losses
    const wr = total > 0 ? (data.wins / total) * 100 : 0
    
    // 가장 성공적인 전략 찾기
    let bestStrategy = 'None'
    let maxWins = 0
    data.strategies.forEach((wins, strategy) => {
      if (wins > maxWins) {
        maxWins = wins
        bestStrategy = strategy
      }
    })
    
    return { regime, trades: total, winRate: wr, bestStrategy }
  })
  
  // 종합 추천
  let recommendation = ''
  if (winRate >= 60) {
    recommendation = '✅ 실전 투입 가능. RSI 전략 중심으로 운영.'
  } else if (winRate >= 50) {
    recommendation = '⚠️ 조건부 사용. RSI만 활성화, 다른 전략 비활성화 권장.'
  } else {
    recommendation = '❌ 추가 최적화 필요. 전략 파라미터 조정 필요.'
  }
  
  return {
    summary: {
      totalTrades: completed.length,
      wins,
      losses,
      winRate,
      netProfit: wins * 9.2 - losses * 10, // 92% payout
      profitFactor: losses > 0 ? (wins * 9.2) / (losses * 10) : wins > 0 ? Infinity : 0,
      maxDrawdown: 0, // TODO: 계산
      recommendation
    },
    strategyPerformance,
    marketConditions,
    signals: signals.slice(-20).map(s => ({
      time: new Date(s.timestamp).toISOString(),
      direction: s.direction,
      strategy: s.strategy,
      result: (s.status === 'win' || s.status === 'loss') ? s.status : 'pending' as const,
      regime: s.regime,
      confidence: s.confidence
    }))
  }
}
