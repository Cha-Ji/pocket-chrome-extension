// ============================================================
// message-handler.ts — chrome.runtime.onMessage dispatch
// ============================================================

import { ExtensionMessage } from '../../lib/types'
import { generateLLMReport } from '../../lib/signals/signal-generator-v2'
import { AutoMiner } from '../auto-miner'
import { DataSender } from '../../lib/data-sender'
import { ContentScriptContext } from './context'

export function registerMessageListener(ctx: ContentScriptContext): void {
  try {
    chrome.runtime.onMessage.addListener((message: ExtensionMessage, _, sendResponse) => {
      handleMessage(ctx, message).then(sendResponse)
      return true
    })
  } catch (e) {
    console.warn('[PO] Extension context lost', e)
  }
}

async function switchToAsset(ctx: ContentScriptContext, assetName: string): Promise<boolean> {
  if (!ctx.payoutMonitor) return false
  console.log(`[PO] Switching to asset: ${assetName}`)
  return await ctx.payoutMonitor.switchAsset(assetName)
}

export function getSystemStatus(ctx: ContentScriptContext): object {
  return {
    initialized: ctx.isInitialized,
    modules: {
      dataCollector: ctx.dataCollector?.isCollecting ?? false,
      candleCollector: ctx.candleCollector?.isCollecting ?? false,
      payoutMonitor: ctx.payoutMonitor?.isMonitoring ?? false,
      indicatorReader: ctx.indicatorReader?.isReading ?? false,
      wsInterceptor: ctx.wsInterceptor?.getStatus() ?? null,
    },
    config: ctx.tradingConfig,
    highPayoutAssets: ctx.payoutMonitor?.getHighPayoutAssets().length ?? 0,
    candleCount: ctx.candleCollector?.getTickers().map(t => ({ ticker: t, count: ctx.candleCollector!.getCandles(t).length })) ?? [],
  }
}

function getLLMReport(ctx: ContentScriptContext): object {
  if (!ctx.signalGenerator) return { error: 'Signal generator not initialized' }
  const signals = ctx.signalGenerator.getSignals(100)
  return generateLLMReport(signals)
}

export async function handleMessage(ctx: ContentScriptContext, message: ExtensionMessage): Promise<unknown> {
  switch (message.type) {
    case 'START_AUTO_MINER': AutoMiner.start(); return { success: true, message: 'Auto Miner Started' }
    case 'STOP_AUTO_MINER': AutoMiner.stop(); return { success: true, message: 'Auto Miner Stopped' }
    case 'GET_MINER_STATUS': return AutoMiner.getStatus()
    case 'GET_DB_MONITOR_STATUS': return { sender: DataSender.getStats() }
    case 'SET_MINER_CONFIG': AutoMiner.updateConfig(message.payload); return { success: true, config: AutoMiner.getConfig() }
    case 'GET_STATUS_V2': return getSystemStatus(ctx)
    case 'GET_LLM_REPORT': return getLLMReport(ctx)
    case 'SET_CONFIG_V2': ctx.tradingConfig = { ...ctx.tradingConfig, ...message.payload }; return { success: true, config: ctx.tradingConfig }
    case 'START_TRADING_V2': ctx.tradingConfig.enabled = true; return { success: true }
    case 'STOP_TRADING_V2': ctx.tradingConfig.enabled = false; return { success: true }
    case 'GET_SIGNALS': return ctx.signalGenerator?.getSignals(message.payload.limit ?? 20) ?? []
    case 'GET_HIGH_PAYOUT_ASSETS': return ctx.payoutMonitor?.getHighPayoutAssets() ?? []
    case 'SWITCH_ASSET': return switchToAsset(ctx, message.payload.assetName)
    case 'EXPORT_CANDLES': return ctx.candleCollector?.exportCandles(message.payload.ticker) ?? null
    default: return null
  }
}
