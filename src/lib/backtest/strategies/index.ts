// RSI strategies
export {
  RSIOverboughtOversold,
  RSIDivergence,
  RSIBollingerBands,
  RSIStochastic,
  RSITrend,
  RSIStrategies,
} from './rsi-strategy'

// Bollinger strategies
export {
  BollingerBounce,
  BollingerBreakout,
  BollingerSqueeze,
  BollingerRSI,
  BollingerStrategies,
} from './bollinger-strategy'

// MACD strategies
export {
  MACDCrossover,
  MACDHistogramReversal,
  MACDZeroCross,
  MACDDivergence,
  MACDStrategies,
} from './macd-strategy'

// Stochastic RSI strategies
export {
  StochRSICrossover,
  StochRSIExtreme,
  StochRSITrend,
  StochRSIWithEMA,
  StochRSIStrategies,
} from './stochastic-rsi-strategy'

// SMMA + Stochastic strategies
export {
  SMMAStochasticStrategy,
  SMMAStochasticAggressiveStrategy,
  SMMAStrategies,
} from './smma-stochastic'

// ATR strategies
export {
  ATRChannelBreakout,
  ATRVolatilityExpansion,
  ATRTrendFollowing,
  ATRStrategies,
} from './atr-breakout-strategy'

// CCI strategies
export {
  CCIOverboughtOversold,
  CCIZeroCross,
  CCITrendFollowing,
  CCIStrategies,
} from './cci-strategy'

// Williams %R strategies
export {
  WilliamsROverboughtOversold,
  WilliamsRMiddleCross,
  WilliamsRExtremeZone,
  WilliamsRStrategies,
} from './williams-r-strategy'

// High win-rate strategies
export {
  rsiMacdStrategy,
  rsiBBBounceStrategy,
  adxFilteredRsiStrategy,
  tripleConfirmationStrategy,
  emaTrendRsiPullbackStrategy,
  runHighWinRateStrategy,
  voteStrategy,
  DEFAULT_CONFIG as DEFAULT_HIGH_WINRATE_CONFIG,
} from './high-winrate'
export type {
  StrategyResult,
  HighWinRateConfig,
  StrategyName,
} from './high-winrate'

// SBB-120 (Squeeze Bollinger Breakout) strategy
export {
  sbb120Strategy,
  DEFAULT_SBB120_CONFIG,
} from './sbb-120'
export type {
  SBB120Config,
} from './sbb-120'

// ZMR-60 (Z-score Mean Reversion) strategy
export {
  zmr60Strategy,
  zmr60WithHighWinRateConfig,
  DEFAULT_ZMR60_CONFIG,
} from './zmr-60'
export type {
  ZMR60Config,
} from './zmr-60'

// Trend following strategies
export {
  adxDiCrossoverStrategy,
  trendPullbackStrategy,
  macdTrendMomentumStrategy,
  supertrendStrategy,
  emaRibbonStrategy,
  runTrendStrategy,
  trendVoteStrategy,
  selectBestTrendStrategy,
  DEFAULT_TREND_CONFIG,
} from './trend-following'
export type {
  TrendStrategyResult,
  TrendStrategyConfig,
  TrendStrategyName,
} from './trend-following'
