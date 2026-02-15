// ============================================================
// Real-Time Signal Generator
// ============================================================

import { Candle, Signal, MarketRegime, SignalGeneratorConfig } from './types'
import { detectRegime, getBestStrategies, executeStrategy, WINNING_STRATEGIES } from './strategies'

// ============================================================
// Signal Generator Class
// ============================================================

export class SignalGenerator {
  private config: SignalGeneratorConfig
  private candleBuffer: Map<string, Candle[]> = new Map()
  private signals: Signal[] = []
  private listeners: ((signal: Signal) => void)[] = []
  
  constructor(config?: Partial<SignalGeneratorConfig>) {
    this.config = {
      symbols: ['BTCUSDT'],
      interval: '1m',
      strategies: WINNING_STRATEGIES,
      minConfidence: 0.5,
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
    buffer.push(candle)
    
    // Keep last 100 candles
    if (buffer.length > 100) {
      buffer.shift()
    }
    
    // Need at least 50 candles for reliable signals
    if (buffer.length < 50) {
      return null
    }
    
    // Check for signals
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
  
  // ============================================================
  // Internal Methods
  // ============================================================
  
  private checkSignals(symbol: string, candles: Candle[]): Signal | null {
    // Detect market regime
    const regimeInfo = detectRegime(candles)
    
    // Get best strategies for current regime
    const strategies = getBestStrategies(regimeInfo.regime)
    
    if (strategies.length === 0) {
      return null
    }
    
    // Try each strategy
    for (const strategy of strategies) {
      const direction = executeStrategy(strategy.id, candles)
      
      if (direction) {
        const signal = this.createSignal(symbol, direction, strategy.name, regimeInfo, candles)
        this.signals.push(signal)
        
        // Keep only last 100 signals
        if (this.signals.length > 100) {
          this.signals.shift()
        }
        
        // Notify listeners
        this.listeners.forEach(l => l(signal))
        
        return signal
      }
    }
    
    return null
  }
  
  private createSignal(
    symbol: string,
    direction: 'CALL' | 'PUT',
    strategyName: string,
    regimeInfo: { regime: MarketRegime; adx: number; direction: number },
    candles: Candle[]
  ): Signal {
    const lastCandle = candles[candles.length - 1]
    
    return {
      id: `${symbol}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      symbol,
      direction,
      strategyId: strategyName,
      strategy: strategyName,
      regime: regimeInfo.regime,
      confidence: Math.min(1, regimeInfo.adx / 50),
      expiry: this.config.expirySeconds,
      entryPrice: lastCandle.close,
      indicators: {
        adx: regimeInfo.adx,
        trendDirection: regimeInfo.direction,
      },
      status: 'pending'
    }
  }
}

// ============================================================
// Singleton Instance
// ============================================================

let generatorInstance: SignalGenerator | null = null

export function getSignalGenerator(config?: Partial<SignalGeneratorConfig>): SignalGenerator {
  if (!generatorInstance) {
    generatorInstance = new SignalGenerator(config)
  }
  return generatorInstance
}

// ============================================================
// Binance Data Fetcher
// ============================================================

export async function fetchCandles(
  symbol: string = 'BTCUSDT',
  interval: string = '1m',
  limit: number = 100
): Promise<Candle[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
  
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Binance API error: ${response.status}`)
  }
  
  const data = await response.json() as any[][]
  
  return data.map(k => ({
    timestamp: k[0] as number,
    open: parseFloat(k[1] as string),
    high: parseFloat(k[2] as string),
    low: parseFloat(k[3] as string),
    close: parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
  }))
}

// ============================================================
// Demo Mode Runner
// ============================================================

export async function runDemoCheck(symbol: string = 'BTCUSDT'): Promise<{
  regime: { regime: MarketRegime; adx: number; direction: number }
  signal: Signal | null
}> {
  const candles = await fetchCandles(symbol, '1m', 100)
  const generator = getSignalGenerator()
  generator.setHistory(symbol, candles)
  
  const regime = generator.getRegime(symbol)!
  
  // Add the latest candle to trigger signal check
  const signal = generator.addCandle(symbol, candles[candles.length - 1])
  
  return { regime, signal }
}
