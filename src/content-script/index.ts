// ============================================================
// Content Script - Pocket Option Auto Trading V2
// ============================================================
// V2 업그레이드: Forward Test 검증된 전략 사용
// - RSI V2: 실전 100% 승률
// - EMA Cross V2: ADX 30+ 조건
// - Stochastic: 비활성화 (실전 25% 실패)
// ============================================================

import { DOMSelectors, DEFAULT_SELECTORS, ExtensionMessage } from '../lib/types'
import { DataCollector } from './data-collector'
import { TradeExecutor } from './executor'
import { getCandleCollector, CandleCollector, Candle } from './candle-collector'
import { getPayoutMonitor, PayoutMonitor, AssetPayout } from './payout-monitor'
import { getSignalGeneratorV2, SignalGeneratorV2, generateLLMReport } from '../lib/signals/signal-generator-v2'
import { Signal } from '../lib/signals/types'
import { getTelegramService, TelegramService } from '../lib/notifications/telegram'

// ============================================================
// Module Instances
// ============================================================

let dataCollector: DataCollector | null = null
let tradeExecutor: TradeExecutor | null = null
let candleCollector: CandleCollector | null = null
let payoutMonitor: PayoutMonitor | null = null
let signalGenerator: SignalGeneratorV2 | null = null
let telegramService: TelegramService | null = null
let isInitialized = false

// ============================================================
// V2 Trading Config
// ============================================================

interface TradingConfigV2 {
  enabled: boolean
  autoAssetSwitch: boolean      // 자동 자산 전환 (92%+)
  minPayout: number             // 최소 페이아웃 (92%)
  tradeAmount: number           // 거래 금액
  maxDrawdown: number           // 최대 손실률 (20%)
  maxConsecutiveLosses: number  // 최대 연속 손실 (5)
  onlyRSI: boolean              // RSI 전략만 사용
}

const DEFAULT_CONFIG: TradingConfigV2 = {
  enabled: false,
  autoAssetSwitch: true,
  minPayout: 92,
  tradeAmount: 10,
  maxDrawdown: 20,
  maxConsecutiveLosses: 5,
  onlyRSI: true, // Forward Test 결과 기반
}

let tradingConfig: TradingConfigV2 = { ...DEFAULT_CONFIG }

// ============================================================
// Initialize
// ============================================================

async function initialize(): Promise<void> {
  if (isInitialized) return
  
  console.log('[Pocket Quant V2] Content script initializing...')
  
  // Wait for page to fully load
  await waitForElement('body')
  
  // Initialize modules
  const selectors = await loadSelectors()
  
  // Legacy modules
  dataCollector = new DataCollector(selectors)
  tradeExecutor = new TradeExecutor(selectors)
  
  // V2 modules
  candleCollector = getCandleCollector()
  payoutMonitor = getPayoutMonitor()
  signalGenerator = getSignalGeneratorV2({
    symbols: ['CURRENT'],
    minConfidence: 0.3,
    expirySeconds: 60,
  })
  telegramService = await getTelegramService()
  
  // Setup event handlers
  setupCandleHandler()
  setupPayoutHandler()
  setupSignalHandler()
  
  // Start data collection
  dataCollector.start()
  candleCollector.start()
  payoutMonitor.start(30000) // 30초마다 페이아웃 체크
  
  isInitialized = true
  console.log('[Pocket Quant V2] Content script initialized (V2 strategies active)')
  
  // Log initial status
  logSystemStatus()
}

// ============================================================
// Event Handlers
// ============================================================

function setupCandleHandler(): void {
  if (!candleCollector || !signalGenerator) return
  
  candleCollector.onCandle((ticker: string, candle: Candle) => {
    // V2 시그널 생성기에 캔들 전달
    const signal = signalGenerator!.addCandle(ticker, candle)
    
    if (signal) {
      console.log(`[Pocket Quant V2] 🎯 Signal: ${signal.direction} (${signal.strategy})`)
      handleNewSignal(signal)
    }
  })
}

function setupPayoutHandler(): void {
  if (!payoutMonitor) return
  
  payoutMonitor.subscribe((assets: AssetPayout[]) => {
    if (tradingConfig.autoAssetSwitch && assets.length > 0) {
      const best = assets[0]
      console.log(`[Pocket Quant V2] Best asset: ${best.name} (${best.payout}%)`)
      
      // 현재 자산이 최고 페이아웃이 아니면 알림
      if (best.payout >= tradingConfig.minPayout) {
        notifyBestAsset(best)
      }
    }
  })
}

function setupSignalHandler(): void {
  if (!signalGenerator) return
  
  signalGenerator.onSignal((signal: Signal) => {
    // Notify Telegram
    telegramService?.notifySignal(signal)

    // Background로 신호 전송
    chrome.runtime.sendMessage({
      type: 'NEW_SIGNAL_V2',
      payload: {
        signal,
        config: tradingConfig,
      }
    }).catch(() => {})
    
    // 자동 매매 활성화 시 실행
    if (tradingConfig.enabled) {
      executeSignal(signal)
    }
  })
}

// ============================================================
// Signal Execution
// ============================================================

async function handleNewSignal(signal: Signal): Promise<void> {
  // 페이아웃 체크
  const bestAsset = payoutMonitor?.getBestAsset()
  if (bestAsset && bestAsset.payout < tradingConfig.minPayout) {
    console.log(`[Pocket Quant V2] ⚠️ Skipping signal - payout too low (${bestAsset.payout}%)`)
    return
  }
  
  // RSI만 사용 설정 시 다른 전략 무시
  if (tradingConfig.onlyRSI && !signal.strategy.includes('RSI')) {
    console.log(`[Pocket Quant V2] ⚠️ Skipping non-RSI signal: ${signal.strategy}`)
    return
  }
  
  // 자동 매매가 활성화되어 있으면 실행
  if (tradingConfig.enabled) {
    await executeSignal(signal)
  }
}

async function executeSignal(signal: Signal): Promise<void> {
  if (!tradeExecutor) return
  
  console.log(`[Pocket Quant V2] 🚀 Executing: ${signal.direction} (${signal.strategy})`)
  
  try {
    // 거래 실행
    const result = await tradeExecutor.executeTrade(
      signal.direction,
      tradingConfig.tradeAmount
    )
    
    // Telegram 알림 (거래 결과)
    // Note: tradeExecutor.executeTrade returns boolean currently, need to update if we want detailed result
    // Assuming we want to notify at least that it happened
    // If result is just success/fail, we might not have profit info yet.
    // For now, simple notification.
    if (result) {
       telegramService?.sendMessage(`🚀 <b>Trade Executed</b>\n${signal.direction} on ${signal.ticker}`)
    } else {
       telegramService?.notifyError(`Failed to execute trade for ${signal.ticker}`)
    }

    // 결과 기록
    chrome.runtime.sendMessage({
      type: 'TRADE_EXECUTED',
      payload: {
        signalId: signal.id,
        result,
        timestamp: Date.now(),
      }
    }).catch(() => {})
    
  } catch (error) {
    console.error('[Pocket Quant V2] Trade execution error:', error)
  }
}

// ============================================================
// Asset Selection
// ============================================================

function notifyBestAsset(asset: AssetPayout): void {
  chrome.runtime.sendMessage({
    type: 'BEST_ASSET',
    payload: asset
  }).catch(() => {})
}

async function switchToAsset(assetName: string): Promise<boolean> {
  if (!payoutMonitor) return false
  
  console.log(`[Pocket Quant V2] Switching to asset: ${assetName}`)
  return await payoutMonitor.switchAsset(assetName)
}

// ============================================================
// Status & Reporting
// ============================================================

function logSystemStatus(): void {
  const status = getSystemStatus()
  console.log('[Pocket Quant V2] System Status:', JSON.stringify(status, null, 2))
}

function getSystemStatus(): object {
  return {
    initialized: isInitialized,
    modules: {
      dataCollector: dataCollector?.isCollecting ?? false,
      candleCollector: candleCollector?.isCollecting ?? false,
      payoutMonitor: payoutMonitor?.isMonitoring ?? false,
    },
    config: tradingConfig,
    signals: signalGenerator?.getStats() ?? null,
    highPayoutAssets: payoutMonitor?.getHighPayoutAssets().length ?? 0,
    candleCount: candleCollector?.getTickers().map(t => ({
      ticker: t,
      count: candleCollector!.getCandles(t).length
    })) ?? [],
  }
}

function getLLMReport(): object {
  if (!signalGenerator) return { error: 'Signal generator not initialized' }
  
  const signals = signalGenerator.getSignals(100)
  return generateLLMReport(signals)
}

// ============================================================
// Message Handling
// ============================================================

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _, sendResponse) => {
  handleMessage(message).then(sendResponse)
  return true
})

async function handleMessage(message: ExtensionMessage): Promise<unknown> {
  switch (message.type) {
    // V2 API
    case 'GET_STATUS_V2':
      return getSystemStatus()
    
    case 'GET_LLM_REPORT':
      return getLLMReport()
    
    case 'SET_CONFIG_V2':
      tradingConfig = { ...tradingConfig, ...(message.payload as Partial<TradingConfigV2>) }
      console.log('[Pocket Quant V2] Config updated:', tradingConfig)
      return { success: true, config: tradingConfig }
    
    case 'START_TRADING_V2':
      tradingConfig.enabled = true
      console.log('[Pocket Quant V2] ✅ Auto trading ENABLED')
      return { success: true }
    
    case 'STOP_TRADING_V2':
      tradingConfig.enabled = false
      console.log('[Pocket Quant V2] ⛔ Auto trading DISABLED')
      return { success: true }
    
    case 'GET_SIGNALS': {
      const signalPayload = message.payload as { limit?: number } | undefined
      return signalGenerator?.getSignals(signalPayload?.limit || 20) ?? []
    }
    
    case 'GET_HIGH_PAYOUT_ASSETS':
      return payoutMonitor?.getHighPayoutAssets() ?? []
    
    case 'SWITCH_ASSET': {
      const assetPayload = message.payload as { assetName?: string } | undefined
      return switchToAsset(assetPayload?.assetName || '')
    }
    
    case 'EXPORT_CANDLES': {
      const candlePayload = message.payload as { ticker?: string } | undefined
      return candleCollector?.exportCandles(candlePayload?.ticker || 'UNKNOWN') ?? null
    }
    
    case 'UPDATE_SIGNAL_RESULT': {
      const resultPayload = message.payload as { signalId?: string; result?: 'win' | 'loss' } | undefined
      if (resultPayload?.signalId && resultPayload?.result) {
        signalGenerator?.updateSignalResult(resultPayload.signalId, resultPayload.result)
        
        // Telegram Result Notification
        const resultEmoji = resultPayload.result === 'win' ? '💰 <b>WIN</b>' : '💸 <b>LOSS</b>'
        telegramService?.sendMessage(`${resultEmoji} Trade Result: ${resultPayload.result.toUpperCase()}`)
        
        return { success: true }
      }
      return { success: false }
    }
    
    case 'RELOAD_TELEGRAM_CONFIG': {
        const config = message.payload
        if (telegramService) {
            telegramService.updateConfig(config)
            console.log('[Pocket Quant V2] Telegram config updated')
        }
        return { success: true }
    }

    // Legacy API (backward compatibility)
    case 'START_TRADING':
      return tradeExecutor?.startAutoTrading()
    
    case 'STOP_TRADING':
      return tradeExecutor?.stopAutoTrading()
    
    case 'GET_STATUS':
      return {
        isCollecting: dataCollector?.isCollecting ?? false,
        isTrading: tradeExecutor?.isTrading ?? false,
        currentPrice: dataCollector?.getCurrentPrice(),
        // V2 additions
        v2Status: getSystemStatus(),
      }
    
    default:
      console.warn('[Pocket Quant V2] Unknown message type:', message.type)
      return null
  }
}

// ============================================================
// Utilities
// ============================================================

async function loadSelectors(): Promise<DOMSelectors> {
  try {
    const result = await chrome.storage.local.get('domSelectors')
    return result.domSelectors || DEFAULT_SELECTORS
  } catch {
    return DEFAULT_SELECTORS
  }
}

function waitForElement(selector: string, timeout = 10000): Promise<Element | null> {
  return new Promise((resolve) => {
    const element = document.querySelector(selector)
    if (element) {
      resolve(element)
      return
    }
    
    const observer = new MutationObserver((_, obs) => {
      const el = document.querySelector(selector)
      if (el) {
        obs.disconnect()
        resolve(el)
      }
    })
    
    observer.observe(document.body, { childList: true, subtree: true })
    
    setTimeout(() => {
      observer.disconnect()
      resolve(null)
    }, timeout)
  })
}

// ============================================================
// Health Check (LLM 친화적)
// ============================================================

function healthCheck(): { status: 'healthy' | 'degraded' | 'error'; details: string[] } {
  const issues: string[] = []
  
  if (!isInitialized) issues.push('Not initialized')
  if (!candleCollector?.isCollecting) issues.push('Candle collector not running')
  if (!payoutMonitor?.isMonitoring) issues.push('Payout monitor not running')
  
  const candleCount = candleCollector?.getTickers().reduce((sum, t) => 
    sum + candleCollector!.getCandles(t).length, 0) ?? 0
  if (candleCount < 50) issues.push(`Insufficient candles: ${candleCount}/50 minimum`)
  
  const highPayoutAssets = payoutMonitor?.getHighPayoutAssets().length ?? 0
  if (highPayoutAssets === 0) issues.push('No high payout assets (92%+)')
  
  return {
    status: issues.length === 0 ? 'healthy' : issues.length < 3 ? 'degraded' : 'error',
    details: issues.length > 0 ? issues : ['All systems operational']
  }
}

// Export for testing
export { getSystemStatus, getLLMReport, healthCheck }

// ============================================================
// Initialize on load
// ============================================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize)
} else {
  initialize()
}
