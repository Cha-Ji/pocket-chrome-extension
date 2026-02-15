// ============================================================
// Auto Trader - Automated Trading Execution
// ============================================================
// Connects signal generator to Pocket Option execution
// ============================================================

import { Signal } from '../signals/types';
import { SignalGenerator, fetchCandles } from '../signals/signal-generator';
import { validateTradeAmount } from './validate-amount';

export interface TradeExecution {
  signalId: string;
  executedAt: number;
  direction: 'CALL' | 'PUT';
  amount: number;
  expiry: number;
  entryPrice: number;
  exitPrice?: number;
  result?: 'WIN' | 'LOSS' | 'TIE';
  profit?: number;
}

export interface AutoTraderConfig {
  enabled: boolean;
  symbol: string;

  // Position Sizing
  initialBalance: number; // Starting balance
  riskPerTrade: number; // % of current balance per trade (e.g., 1 = 1%)
  fixedAmount?: number; // Optional: fixed amount instead of %
  usePercentage: boolean; // true = use %, false = fixed amount
  minAmount: number; // Minimum trade amount
  maxAmount: number; // Maximum trade amount

  // Timing
  expiry: number; // seconds
  cooldownMs: number; // between trades

  // Risk Management
  maxDailyTrades: number;
  maxDailyLoss: number; // $ amount
  maxDailyLossPercent: number; // % of initial balance
  maxDrawdown: number; // % - stop trading if drawdown exceeds
  maxConsecutiveLosses: number; // Stop after N consecutive losses

  demoMode: boolean;
}

export interface AutoTraderStats {
  // Session stats
  todayTrades: number;
  todayWins: number;
  todayLosses: number;
  todayProfit: number;
  lastTradeTime: number;

  // Balance tracking
  currentBalance: number;
  peakBalance: number;
  currentDrawdown: number; // Current drawdown %
  maxDrawdownHit: number; // Highest drawdown reached

  // Streak tracking
  consecutiveLosses: number;
  consecutiveWins: number;
  longestLossStreak: number;
  longestWinStreak: number;

  // Risk status
  isHalted: boolean;
  haltReason: string | null;
}

export class AutoTrader {
  private config: AutoTraderConfig;
  private generator: SignalGenerator;
  private executions: TradeExecution[] = [];
  private stats: AutoTraderStats;
  private isRunning = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  // Callbacks
  private onExecute?: (execution: TradeExecution) => Promise<boolean>;
  private onResult?: (execution: TradeExecution) => void;
  private onLog?: (message: string, level: 'info' | 'success' | 'error' | 'warning') => void;

  constructor(config: Partial<AutoTraderConfig> = {}) {
    this.config = {
      enabled: false,
      symbol: 'BTCUSDT',

      // Position Sizing - Default 1% risk
      initialBalance: 1000,
      riskPerTrade: 1, // 1% of balance
      fixedAmount: 10,
      usePercentage: true, // Use % by default
      minAmount: 1,
      maxAmount: 100,

      // Timing
      expiry: 60,
      cooldownMs: 30000,

      // Risk Management
      maxDailyTrades: 20,
      maxDailyLoss: 100,
      maxDailyLossPercent: 10, // 10% of initial
      maxDrawdown: 20, // Stop at 20% drawdown
      maxConsecutiveLosses: 5, // Stop after 5 losses in a row

      demoMode: true,
      ...config,
    };

    this.generator = new SignalGenerator();
    this.stats = this.loadStats();
  }

  // ============================================================
  // Public API
  // ============================================================

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.config.enabled = true;

    this.log(`🚀 Auto Trader Started (${this.config.demoMode ? 'DEMO' : 'LIVE'})`, 'info');
    this.log(`   Symbol: ${this.config.symbol}`, 'info');
    this.log(`   Risk: ${this.config.riskPerTrade}% per trade`, 'info');
    this.log(`   Balance: $${this.config.initialBalance}`, 'info');
    this.log(`   Expiry: ${this.config.expiry}s`, 'info');

    // Load initial history
    await this.loadHistory();

    // Start monitoring
    this.intervalId = setInterval(() => this.tick(), 5000);

    // First tick immediately
    await this.tick();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    this.config.enabled = false;
    this.log('⏹️ Auto Trader Stopped', 'info');
  }

  getStats(): AutoTraderStats {
    return { ...this.stats };
  }

  getExecutions(): TradeExecution[] {
    return [...this.executions];
  }

  getConfig(): AutoTraderConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<AutoTraderConfig>): void {
    this.config = { ...this.config, ...updates };
    this.log(`⚙️ Config updated`, 'info');
  }

  /**
   * Resume trading after halt (resets halt status)
   */
  resume(): void {
    if (this.stats.isHalted) {
      this.stats.isHalted = false;
      this.stats.haltReason = null;
      this.log('▶️ Trading resumed', 'info');
    }
  }

  /**
   * Reset daily stats (call at start of new day)
   */
  resetDailyStats(): void {
    this.stats.todayTrades = 0;
    this.stats.todayWins = 0;
    this.stats.todayLosses = 0;
    this.stats.todayProfit = 0;
    this.stats.isHalted = false;
    this.stats.haltReason = null;
    this.stats.consecutiveLosses = 0;
    this.stats.consecutiveWins = 0;
    this.log('🔄 Daily stats reset', 'info');
  }

  /**
   * Get risk summary
   */
  getRiskSummary(): {
    positionSize: number;
    riskPercent: number;
    currentDrawdown: number;
    maxDrawdown: number;
    consecutiveLosses: number;
    isHalted: boolean;
    haltReason: string | null;
  } {
    return {
      positionSize: this.calculatePositionSize(),
      riskPercent: this.config.riskPerTrade,
      currentDrawdown: this.stats.currentDrawdown,
      maxDrawdown: this.config.maxDrawdown,
      consecutiveLosses: this.stats.consecutiveLosses,
      isHalted: this.stats.isHalted,
      haltReason: this.stats.haltReason,
    };
  }

  // Set execution callback (for Pocket Option integration)
  setExecuteCallback(cb: (execution: TradeExecution) => Promise<boolean>): void {
    this.onExecute = cb;
  }

  setResultCallback(cb: (execution: TradeExecution) => void): void {
    this.onResult = cb;
  }

  setLogCallback(
    cb: (message: string, level: 'info' | 'success' | 'error' | 'warning') => void,
  ): void {
    this.onLog = cb;
  }

  // ============================================================
  // Trading Logic
  // ============================================================

  private async tick(): Promise<void> {
    if (!this.config.enabled) return;

    // Check if halted
    if (this.stats.isHalted) {
      return;
    }

    // === RISK CHECKS ===

    // 1. Daily trade limit
    if (this.stats.todayTrades >= this.config.maxDailyTrades) {
      this.haltTrading('Daily trade limit reached');
      return;
    }

    // 2. Daily loss limit (absolute)
    if (this.stats.todayProfit <= -this.config.maxDailyLoss) {
      this.haltTrading(`Daily loss limit reached ($${this.config.maxDailyLoss})`);
      return;
    }

    // 3. Daily loss limit (percentage)
    const dailyLossPercent = (Math.abs(this.stats.todayProfit) / this.config.initialBalance) * 100;
    if (this.stats.todayProfit < 0 && dailyLossPercent >= this.config.maxDailyLossPercent) {
      this.haltTrading(
        `Daily loss ${dailyLossPercent.toFixed(1)}% >= ${this.config.maxDailyLossPercent}%`,
      );
      return;
    }

    // 4. Max drawdown check
    if (this.stats.currentDrawdown >= this.config.maxDrawdown) {
      this.haltTrading(`Max drawdown reached (${this.stats.currentDrawdown.toFixed(1)}%)`);
      return;
    }

    // 5. Consecutive losses
    if (this.stats.consecutiveLosses >= this.config.maxConsecutiveLosses) {
      this.haltTrading(`${this.config.maxConsecutiveLosses} consecutive losses`);
      return;
    }

    // 6. Cooldown check
    const timeSinceLastTrade = Date.now() - this.stats.lastTradeTime;
    if (timeSinceLastTrade < this.config.cooldownMs) {
      return;
    }

    try {
      // Fetch latest candles
      const candles = await fetchCandles(this.config.symbol, '1m', 5);
      const latestCandle = candles[candles.length - 1];

      // Check for signal
      const signal = this.generator.addCandle(this.config.symbol, latestCandle);

      if (signal) {
        await this.executeSignal(signal);
      }
    } catch (error) {
      this.log(`Error in tick: ${error}`, 'error');
    }
  }

  private haltTrading(reason: string): void {
    this.stats.isHalted = true;
    this.stats.haltReason = reason;
    this.log(`🛑 Trading halted: ${reason}`, 'warning');
  }

  /**
   * Calculate position size based on risk management rules
   */
  private calculatePositionSize(): number {
    let amount: number;

    if (this.config.usePercentage) {
      // Calculate % of current balance
      amount = (this.stats.currentBalance * this.config.riskPerTrade) / 100;
    } else {
      // Use fixed amount
      amount = this.config.fixedAmount || 10;
    }

    // Apply min/max limits
    amount = Math.max(this.config.minAmount, amount);
    amount = Math.min(this.config.maxAmount, amount);

    // Round to 2 decimal places
    amount = Math.round(amount * 100) / 100;

    return amount;
  }

  /**
   * Update drawdown calculation
   */
  private updateDrawdown(): void {
    // Update peak balance
    if (this.stats.currentBalance > this.stats.peakBalance) {
      this.stats.peakBalance = this.stats.currentBalance;
    }

    // Calculate current drawdown
    if (this.stats.peakBalance > 0) {
      this.stats.currentDrawdown =
        ((this.stats.peakBalance - this.stats.currentBalance) / this.stats.peakBalance) * 100;
    }

    // Track max drawdown hit
    if (this.stats.currentDrawdown > this.stats.maxDrawdownHit) {
      this.stats.maxDrawdownHit = this.stats.currentDrawdown;
    }
  }

  private async executeSignal(signal: Signal): Promise<void> {
    // 포지션 사이즈 계산 및 검증
    const rawAmount = this.calculatePositionSize();

    // 금액 검증 -- NaN, 음수, 상한 초과 등 차단
    const amountValidation = validateTradeAmount(rawAmount, {
      minAmount: this.config.minAmount,
      maxAmount: this.config.maxAmount,
    });

    if (!amountValidation.valid) {
      this.log(`거래 금액 검증 실패: ${amountValidation.reason} (원본값: ${rawAmount})`, 'error');
      return;
    }

    const amount = amountValidation.normalizedAmount!;

    this.log(`🎯 Signal: ${signal.direction} via ${signal.strategy}`, 'info');
    this.log(
      `   Position size: $${amount} (${this.config.riskPerTrade}% of $${this.stats.currentBalance.toFixed(0)})`,
      'info',
    );

    const execution: TradeExecution = {
      signalId: signal.id,
      executedAt: Date.now(),
      direction: signal.direction,
      amount: amount,
      expiry: this.config.expiry,
      entryPrice: signal.entryPrice,
    };

    // Execute trade
    if (this.config.demoMode) {
      // Demo mode: simulate execution
      this.log(
        `📝 [DEMO] ${signal.direction} $${amount} @ $${signal.entryPrice.toFixed(2)}`,
        'success',
      );

      // Simulate result after expiry
      setTimeout(() => this.simulateResult(execution), this.config.expiry * 1000);
    } else {
      // Live mode: execute via callback
      if (this.onExecute) {
        const success = await this.onExecute(execution);
        if (!success) {
          this.log('❌ Trade execution failed', 'error');
          return;
        }
        this.log(`✅ [LIVE] ${signal.direction} $${amount} executed`, 'success');
      }
    }

    this.executions.push(execution);
    this.stats.todayTrades++;
    this.stats.lastTradeTime = Date.now();
    this.saveStats();
  }

  private async simulateResult(execution: TradeExecution): Promise<void> {
    try {
      // Fetch current price
      const candles = await fetchCandles(this.config.symbol, '1m', 1);
      const currentPrice = candles[0].close;

      execution.exitPrice = currentPrice;

      // Determine result
      if (currentPrice === execution.entryPrice) {
        execution.result = 'TIE';
        execution.profit = 0;
      } else if (execution.direction === 'CALL') {
        execution.result = currentPrice > execution.entryPrice ? 'WIN' : 'LOSS';
      } else {
        execution.result = currentPrice < execution.entryPrice ? 'WIN' : 'LOSS';
      }

      execution.profit =
        execution.result === 'WIN'
          ? execution.amount * 0.92
          : execution.result === 'LOSS'
            ? -execution.amount
            : 0;

      // Update stats
      if (execution.result === 'WIN') {
        this.stats.todayWins++;
        this.stats.consecutiveWins++;
        this.stats.consecutiveLosses = 0;
        if (this.stats.consecutiveWins > this.stats.longestWinStreak) {
          this.stats.longestWinStreak = this.stats.consecutiveWins;
        }
      }
      if (execution.result === 'LOSS') {
        this.stats.todayLosses++;
        this.stats.consecutiveLosses++;
        this.stats.consecutiveWins = 0;
        if (this.stats.consecutiveLosses > this.stats.longestLossStreak) {
          this.stats.longestLossStreak = this.stats.consecutiveLosses;
        }
      }

      this.stats.todayProfit += execution.profit;
      this.stats.currentBalance += execution.profit;

      // Update drawdown
      this.updateDrawdown();

      this.saveStats();

      // Log result
      const icon = execution.result === 'WIN' ? '🟢' : execution.result === 'LOSS' ? '🔴' : '⚪';
      this.log(
        `${icon} Result: ${execution.result} | Exit: $${currentPrice.toFixed(2)} | P/L: $${execution.profit.toFixed(2)}`,
        execution.result === 'WIN' ? 'success' : 'error',
      );

      this.onResult?.(execution);
    } catch (error) {
      this.log(`Error getting result: ${error}`, 'error');
    }
  }

  // ============================================================
  // Helpers
  // ============================================================

  private async loadHistory(): Promise<void> {
    try {
      const candles = await fetchCandles(this.config.symbol, '1m', 100);
      this.generator.setHistory(this.config.symbol, candles);
      this.log(`📊 Loaded ${candles.length} candles`, 'info');
    } catch (error) {
      this.log(`Failed to load history: ${error}`, 'error');
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

      currentBalance: this.config.initialBalance,
      peakBalance: this.config.initialBalance,
      currentDrawdown: 0,
      maxDrawdownHit: 0,

      consecutiveLosses: 0,
      consecutiveWins: 0,
      longestLossStreak: 0,
      longestWinStreak: 0,

      isHalted: false,
      haltReason: null,
    };
  }

  private saveStats(): void {
    // In a real implementation, save to storage
  }

  private log(message: string, level: 'info' | 'success' | 'error' | 'warning'): void {
    const time = new Date().toLocaleTimeString();
    console.log(`[${time}] ${message}`);
    this.onLog?.(message, level);
  }
}

// ============================================================
// Singleton
// ============================================================

let traderInstance: AutoTrader | null = null;

export function getAutoTrader(config?: Partial<AutoTraderConfig>): AutoTrader {
  if (!traderInstance) {
    traderInstance = new AutoTrader(config);
  }
  return traderInstance;
}
