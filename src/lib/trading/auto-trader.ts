// ============================================================
// Auto Trader - Automated Trading Execution
// ============================================================
// Connects signal generator to Pocket Option execution
// ============================================================

import { Signal } from '../signals/types'
import { SignalGenerator, fetchCandles } from '../signals/signal-generator'

export interface TradeExecution {
  signalId: string
  executedAt: number
  direction: 'CALL' | 'PUT'
  amount: number
  expiry: number
  entryPrice: number
  exitPrice?: number
  result?: 'WIN' | 'LOSS' | 'TIE'
  profit?: number
}

export interface AutoTraderConfig {
  enabled: boolean
  symbol: string
  amount: number
  expiry: number // seconds
  maxDailyTrades: number
  maxDailyLoss: number
  cooldownMs: number // between trades
  demoMode: boolean
}

export interface AutoTraderStats {
  todayTrades: number
  todayWins: number
  todayLosses: number
  todayProfit: number
  lastTradeTime: number
}

export class AutoTrader {
  private config: AutoTraderConfig
  private generator: SignalGenerator
  private executions: TradeExecution[] = []
  private stats: AutoTraderStats
  private isRunning = false
  private intervalId: ReturnType<typeof setInterval> | null = null
  
  // Callbacks
  private onExecute?: (execution: TradeExecution) => Promise<boolean>
  private onResult?: (execution: TradeExecution) => void
  private onLog?: (message: string, level: 'info' | 'success' | 'error' | 'warning') => void

  constructor(config: Partial<AutoTraderConfig> = {}) {
    this.config = {
      enabled: false,
      symbol: 'BTCUSDT',
      amount: 1,
      expiry: 60,
      maxDailyTrades: 20,
      maxDailyLoss: 100,
      cooldownMs: 30000,
      demoMode: true,
      ...config
    }
    
    this.generator = new SignalGenerator()
    this.stats = this.loadStats()
  }

  // ============================================================
  // Public API
  // ============================================================

  async start(): Promise<void> {
    if (this.isRunning) return
    this.isRunning = true
    this.config.enabled = true

    this.log(`🚀 Auto Trader Started (${this.config.demoMode ? 'DEMO' : 'LIVE'})`, 'info')
    this.log(`   Symbol: ${this.config.symbol}`, 'info')
    this.log(`   Amount: $${this.config.amount}`, 'info')
    this.log(`   Expiry: ${this.config.expiry}s`, 'info')

    // Load initial history
    await this.loadHistory()

    // Start monitoring
    this.intervalId = setInterval(() => this.tick(), 5000)
    
    // First tick immediately
    await this.tick()
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.isRunning = false
    this.config.enabled = false
    this.log('⏹️ Auto Trader Stopped', 'info')
  }

  getStats(): AutoTraderStats {
    return { ...this.stats }
  }

  getExecutions(): TradeExecution[] {
    return [...this.executions]
  }

  getConfig(): AutoTraderConfig {
    return { ...this.config }
  }

  updateConfig(updates: Partial<AutoTraderConfig>): void {
    this.config = { ...this.config, ...updates }
    this.log(`⚙️ Config updated`, 'info')
  }

  // Set execution callback (for Pocket Option integration)
  setExecuteCallback(cb: (execution: TradeExecution) => Promise<boolean>): void {
    this.onExecute = cb
  }

  setResultCallback(cb: (execution: TradeExecution) => void): void {
    this.onResult = cb
  }

  setLogCallback(cb: (message: string, level: 'info' | 'success' | 'error' | 'warning') => void): void {
    this.onLog = cb
  }

  // ============================================================
  // Trading Logic
  // ============================================================

  private async tick(): Promise<void> {
    if (!this.config.enabled) return

    // Check daily limits
    if (this.stats.todayTrades >= this.config.maxDailyTrades) {
      return
    }

    if (Math.abs(this.stats.todayProfit) >= this.config.maxDailyLoss && this.stats.todayProfit < 0) {
      this.log('⚠️ Daily loss limit reached', 'warning')
      return
    }

    // Check cooldown
    const timeSinceLastTrade = Date.now() - this.stats.lastTradeTime
    if (timeSinceLastTrade < this.config.cooldownMs) {
      return
    }

    try {
      // Fetch latest candles
      const candles = await fetchCandles(this.config.symbol, '1m', 5)
      const latestCandle = candles[candles.length - 1]

      // Check for signal
      const signal = this.generator.addCandle(this.config.symbol, latestCandle)

      if (signal) {
        await this.executeSignal(signal)
      }
    } catch (error) {
      this.log(`Error in tick: ${error}`, 'error')
    }
  }

  private async executeSignal(signal: Signal): Promise<void> {
    this.log(`🎯 Signal detected: ${signal.direction} via ${signal.strategy}`, 'info')

    const execution: TradeExecution = {
      signalId: signal.id,
      executedAt: Date.now(),
      direction: signal.direction,
      amount: this.config.amount,
      expiry: this.config.expiry,
      entryPrice: signal.entryPrice,
    }

    // Execute trade
    if (this.config.demoMode) {
      // Demo mode: simulate execution
      this.log(`📝 [DEMO] ${signal.direction} $${this.config.amount} @ $${signal.entryPrice.toFixed(2)}`, 'success')
      
      // Simulate result after expiry
      setTimeout(() => this.simulateResult(execution), this.config.expiry * 1000)
    } else {
      // Live mode: execute via callback
      if (this.onExecute) {
        const success = await this.onExecute(execution)
        if (!success) {
          this.log('❌ Trade execution failed', 'error')
          return
        }
        this.log(`✅ [LIVE] ${signal.direction} $${this.config.amount} executed`, 'success')
      }
    }

    this.executions.push(execution)
    this.stats.todayTrades++
    this.stats.lastTradeTime = Date.now()
    this.saveStats()
  }

  private async simulateResult(execution: TradeExecution): Promise<void> {
    try {
      // Fetch current price
      const candles = await fetchCandles(this.config.symbol, '1m', 1)
      const currentPrice = candles[0].close
      
      execution.exitPrice = currentPrice

      // Determine result
      if (currentPrice === execution.entryPrice) {
        execution.result = 'TIE'
        execution.profit = 0
      } else if (execution.direction === 'CALL') {
        execution.result = currentPrice > execution.entryPrice ? 'WIN' : 'LOSS'
      } else {
        execution.result = currentPrice < execution.entryPrice ? 'WIN' : 'LOSS'
      }

      execution.profit = execution.result === 'WIN' 
        ? execution.amount * 0.92 
        : execution.result === 'LOSS' 
          ? -execution.amount 
          : 0

      // Update stats
      if (execution.result === 'WIN') this.stats.todayWins++
      if (execution.result === 'LOSS') this.stats.todayLosses++
      this.stats.todayProfit += execution.profit
      this.saveStats()

      // Log result
      const icon = execution.result === 'WIN' ? '🟢' : execution.result === 'LOSS' ? '🔴' : '⚪'
      this.log(
        `${icon} Result: ${execution.result} | Exit: $${currentPrice.toFixed(2)} | P/L: $${execution.profit.toFixed(2)}`,
        execution.result === 'WIN' ? 'success' : 'error'
      )

      this.onResult?.(execution)
    } catch (error) {
      this.log(`Error getting result: ${error}`, 'error')
    }
  }

  // ============================================================
  // Helpers
  // ============================================================

  private async loadHistory(): Promise<void> {
    try {
      const candles = await fetchCandles(this.config.symbol, '1m', 100)
      this.generator.setHistory(this.config.symbol, candles)
      this.log(`📊 Loaded ${candles.length} candles`, 'info')
    } catch (error) {
      this.log(`Failed to load history: ${error}`, 'error')
    }
  }

  private loadStats(): AutoTraderStats {
    // In a real implementation, load from storage
    return {
      todayTrades: 0,
      todayWins: 0,
      todayLosses: 0,
      todayProfit: 0,
      lastTradeTime: 0,
    }
  }

  private saveStats(): void {
    // In a real implementation, save to storage
  }

  private log(message: string, level: 'info' | 'success' | 'error' | 'warning'): void {
    const time = new Date().toLocaleTimeString()
    console.log(`[${time}] ${message}`)
    this.onLog?.(message, level)
  }
}

// ============================================================
// Singleton
// ============================================================

let traderInstance: AutoTrader | null = null

export function getAutoTrader(config?: Partial<AutoTraderConfig>): AutoTrader {
  if (!traderInstance) {
    traderInstance = new AutoTrader(config)
  }
  return traderInstance
}
