// ============================================================
// Shared mutable context for all content-script app modules.
// Each submodule receives this object and reads/writes its fields.
// ============================================================

import { TradingConfigV2 } from '../../lib/types'
import { DataCollector } from '../data-collector'
import { TradeExecutor } from '../executor'
import { CandleCollector } from '../candle-collector'
import { PayoutMonitor } from '../payout-monitor'
import { IndicatorReader } from '../indicator-reader'
import { SignalGeneratorV2 } from '../../lib/signals/signal-generator-v2'
import { TelegramService } from '../../lib/notifications/telegram'
import { getWebSocketInterceptor } from '../websocket-interceptor'

export interface PendingTrade {
  tradeId: number
  signalId?: string
  ticker: string
  direction: 'CALL' | 'PUT'
  entryTime: number
  entryPrice: number
  expirySeconds: number
  amount: number
  payoutPercent: number
  timerId: ReturnType<typeof setTimeout>
}

export const DEFAULT_CONFIG: TradingConfigV2 = {
  enabled: false,
  autoAssetSwitch: true,
  minPayout: 92,
  tradeAmount: 10,
  maxDrawdown: 20,
  maxConsecutiveLosses: 5,
  onlyRSI: true,
}

export const TRADE_COOLDOWN_MS = 3000
export const SETTLEMENT_GRACE_MS = 800

export interface ContentScriptContext {
  // Module instances
  dataCollector: DataCollector | null
  tradeExecutor: TradeExecutor | null
  candleCollector: CandleCollector | null
  payoutMonitor: PayoutMonitor | null
  indicatorReader: IndicatorReader | null
  signalGenerator: SignalGeneratorV2 | null
  telegramService: TelegramService | null
  wsInterceptor: ReturnType<typeof getWebSocketInterceptor> | null

  // State flags
  isInitialized: boolean
  isExecutingTrade: boolean
  lastTradeExecutedAt: number

  // Configuration
  tradingConfig: TradingConfigV2

  // Pending trade settlement
  pendingTrades: Map<number, PendingTrade>
}

export function createContext(): ContentScriptContext {
  return {
    dataCollector: null,
    tradeExecutor: null,
    candleCollector: null,
    payoutMonitor: null,
    indicatorReader: null,
    signalGenerator: null,
    telegramService: null,
    wsInterceptor: null,

    isInitialized: false,
    isExecutingTrade: false,
    lastTradeExecutedAt: 0,

    tradingConfig: { ...DEFAULT_CONFIG },

    pendingTrades: new Map(),
  }
}
