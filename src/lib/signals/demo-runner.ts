// ============================================================
// Demo Runner - Continuous Signal Monitoring
// ============================================================

import { SignalGenerator, fetchCandles } from './signal-generator'
import { Signal, Candle } from './types'

export class DemoRunner {
  private generator: SignalGenerator
  private isRunning = false
  private intervalId: ReturnType<typeof setInterval> | null = null
  private signals: Signal[] = []
  private onSignalCallback?: (signal: Signal) => void
  private onUpdateCallback?: (data: DemoUpdate) => void

  constructor() {
    this.generator = new SignalGenerator()
  }

  async start(
    symbols: string[] = ['BTCUSDT'],
    intervalMs: number = 10000
  ): Promise<void> {
    if (this.isRunning) return
    this.isRunning = true

    console.log('🚀 Demo Runner Started')
    console.log(`   Symbols: ${symbols.join(', ')}`)
    console.log(`   Interval: ${intervalMs / 1000}s\n`)

    // Initial load
    for (const symbol of symbols) {
      await this.loadHistory(symbol)
    }

    // Start monitoring
    this.intervalId = setInterval(async () => {
      for (const symbol of symbols) {
        await this.checkSymbol(symbol)
      }
    }, intervalMs)

    // First check immediately
    for (const symbol of symbols) {
      await this.checkSymbol(symbol)
    }
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.isRunning = false
    console.log('\n⏹️ Demo Runner Stopped')
  }

  onSignal(callback: (signal: Signal) => void): void {
    this.onSignalCallback = callback
  }

  onUpdate(callback: (data: DemoUpdate) => void): void {
    this.onUpdateCallback = callback
  }

  getSignals(): Signal[] {
    return this.signals
  }

  private async loadHistory(symbol: string): Promise<void> {
    try {
      const candles = await fetchCandles(symbol, '1m', 100)
      this.generator.setHistory(symbol, candles)
      console.log(`📊 Loaded ${candles.length} candles for ${symbol}`)
    } catch (error) {
      console.error(`Failed to load history for ${symbol}:`, error)
    }
  }

  private async checkSymbol(symbol: string): Promise<void> {
    try {
      const candles = await fetchCandles(symbol, '1m', 5)
      const latestCandle = candles[candles.length - 1]
      
      const signal = this.generator.addCandle(symbol, latestCandle)
      const regime = this.generator.getRegime(symbol)

      const update: DemoUpdate = {
        symbol,
        timestamp: Date.now(),
        price: latestCandle.close,
        regime: regime?.regime || 'unknown',
        adx: regime?.adx || 0,
        signal: signal || undefined,
      }

      this.onUpdateCallback?.(update)

      if (signal) {
        this.signals.push(signal)
        this.onSignalCallback?.(signal)
        
        console.log(`\n🚨 SIGNAL: ${signal.direction}`)
        console.log(`   Symbol: ${symbol}`)
        console.log(`   Strategy: ${signal.strategy}`)
        console.log(`   Entry: $${signal.entryPrice.toFixed(2)}`)
        console.log(`   Regime: ${signal.regime}`)
        console.log(`   Time: ${new Date(signal.timestamp).toLocaleTimeString()}`)
      }
    } catch (error) {
      console.error(`Error checking ${symbol}:`, error)
    }
  }
}

export interface DemoUpdate {
  symbol: string
  timestamp: number
  price: number
  regime: string
  adx: number
  signal?: Signal
}

// ============================================================
// CLI Demo
// ============================================================

export async function runCliDemo(durationMs: number = 60000): Promise<Signal[]> {
  const runner = new DemoRunner()
  
  runner.onUpdate((update) => {
    const time = new Date(update.timestamp).toLocaleTimeString()
    const regimeIcon = update.regime.includes('up') ? '📈' : 
                       update.regime.includes('down') ? '📉' : '↔️'
    console.log(`[${time}] ${update.symbol} $${update.price.toFixed(2)} | ${regimeIcon} ${update.regime} (ADX: ${update.adx.toFixed(1)})`)
  })

  await runner.start(['BTCUSDT', 'ETHUSDT'], 10000)

  // Run for specified duration
  await new Promise(resolve => setTimeout(resolve, durationMs))

  runner.stop()
  
  const signals = runner.getSignals()
  console.log(`\n📊 Summary: ${signals.length} signals generated`)
  
  return signals
}

// Can be run from CLI with: npx tsx demo-runner.ts
