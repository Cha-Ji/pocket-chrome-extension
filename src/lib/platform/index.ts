// ============================================================
// Platform Abstraction Layer - Public API
// ============================================================

export type {
  Candle,
  Asset,
  TradeExecutionResult,
  Confidence,
  Unsubscribe,
  Timeframe,
  IDataSource,
  IExecutor,
  ISafetyGuard,
  IPlatformAdapter,
  IPlatformDetector,
} from './interfaces'

export { PlatformRegistry, getPlatformRegistry } from './registry'
