// ============================================================
// Backtest Types
// ============================================================

/** OHLCV Candle data */
export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

/** Single tick/price point */
export interface PriceTick {
  timestamp: number;
  price: number;
}

/** Trade direction */
export type Direction = 'CALL' | 'PUT';

/** Trade result */
export type TradeResult = 'WIN' | 'LOSS' | 'TIE';

/** Single backtest trade */
export interface BacktestTrade {
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  direction: Direction;
  result: TradeResult;
  payout: number; // percentage
  profit: number; // actual profit/loss amount
  strategySignal?: Record<string, number>; // indicator values at entry
}

/** Strategy for handling gaps in candle data */
export type GapHandlingStrategy = 'skip' | 'fill' | 'split';

/** Backtest configuration */
export interface BacktestConfig {
  // Data
  symbol: string;
  startTime: number;
  endTime: number;

  // Trading params
  initialBalance: number;
  betAmount: number; // fixed or percentage
  betType: 'fixed' | 'percentage';
  payout: number; // expected payout percentage (e.g., 92)
  expirySeconds: number; // trade duration

  // High-fidelity simulation
  slippage?: number; // average price slippage in pips/points
  latencyMs?: number; // execution delay in milliseconds

  // Gap handling
  gapStrategy?: GapHandlingStrategy; // default: 'skip'
  expectedIntervalMs?: number; // auto-detected if not set
  maxGapCandles?: number; // for 'split' strategy, default 10

  // Strategy
  strategyId: string;
  strategyParams: Record<string, number>;
}

/** Backtest result summary */
export interface BacktestResult {
  config: BacktestConfig;

  // Performance
  totalTrades: number;
  wins: number;
  losses: number;
  ties: number;
  winRate: number; // percentage

  // Profit
  initialBalance: number;
  finalBalance: number;
  netProfit: number;
  netProfitPercent: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;

  // High-fidelity simulation results
  slippageImpact?: number;
  latencyImpact?: number;

  // Risk metrics
  sharpeRatio?: number;
  profitFactor: number; // gross profit / gross loss
  expectancy: number; // average profit per trade

  // Time
  startTime: number;
  endTime: number;
  durationMs: number;

  // Data quality
  dataQuality?: {
    totalCandles: number;
    detectedIntervalMs: number;
    gapCount: number;
    totalMissingCandles: number;
    coveragePercent: number;
    duplicatesRemoved: number;
    invalidRemoved: number;
    gapStrategy: GapHandlingStrategy;
    warnings: string[];
  };

  // Trade history
  trades: BacktestTrade[];
  equityCurve: { timestamp: number; balance: number }[];
}

/** Strategy signal */
export interface StrategySignal {
  direction: Direction | null; // null = no trade
  confidence: number; // 0-1
  indicators: Record<string, number>;
  reason?: string;
}

/** Strategy interface */
export interface Strategy {
  id: string;
  name: string;
  description: string;
  params: Record<string, { default: number; min: number; max: number; step: number }>;

  /**
   * Generate signal based on candle data
   * @param candles Historical candles (oldest first)
   * @param params Strategy parameters
   * @returns Signal or null if not enough data
   */
  generateSignal(candles: Candle[], params: Record<string, number>): StrategySignal | null;
}

// ============================================================
// Advanced Analytics Types
// ============================================================

/** Monthly breakdown statistics */
export interface MonthlyBreakdown {
  year: number;
  month: number; // 1-12
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  profit: number;
  avgProfit: number;
}

/** Day of week statistics */
export interface DayOfWeekStats {
  day: number; // 0 = Sunday, 6 = Saturday
  dayName: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  profit: number;
  avgProfit: number;
}

/** Hourly statistics */
export interface HourlyStats {
  hour: number; // 0-23
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  profit: number;
  avgProfit: number;
}

/** Trade distribution data */
export interface DistributionData {
  profitRanges: { min: number; max: number; count: number; percentage: number }[];
  lossRanges: { min: number; max: number; count: number; percentage: number }[];
  profitPercentile: { p10: number; p25: number; p50: number; p75: number; p90: number };
  holdingTimeDistribution: { range: string; count: number; percentage: number }[];
}

/** Streak analysis result */
export interface StreakAnalysis {
  maxWinStreak: number;
  maxLoseStreak: number;
  avgWinStreak: number;
  avgLoseStreak: number;
  currentStreak: { type: 'win' | 'loss' | 'none'; count: number };
}
