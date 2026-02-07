// ============================================================
// Content Script - Pocket Option Auto Trading V2
// ============================================================

console.log('[PO] >>> SCRIPT LOADED <<<');

import { DOMSelectors, DEFAULT_SELECTORS, ExtensionMessage } from '../lib/types'
import { DataCollector } from './data-collector'
import { TradeExecutor } from './executor'
import { getCandleCollector, CandleCollector, Candle } from './candle-collector'
import { getPayoutMonitor, PayoutMonitor, AssetPayout } from './payout-monitor'
import { getIndicatorReader, IndicatorReader, IndicatorValues } from './indicator-reader'
import { getSignalGeneratorV2, SignalGeneratorV2, generateLLMReport } from '../lib/signals/signal-generator-v2'
import { Signal } from '../lib/signals/types'
import { getTelegramService, TelegramService } from '../lib/notifications/telegram'
import { getWebSocketInterceptor, PriceUpdate, WebSocketMessage, WebSocketConnection } from './websocket-interceptor'
import { CandleData } from './websocket-parser'
import { AutoMiner } from './auto-miner'
import { DataSender } from '../lib/data-sender'

let dataCollector: DataCollector | null = null
let tradeExecutor: TradeExecutor | null = null
let candleCollector: CandleCollector | null = null
let payoutMonitor: PayoutMonitor | null = null
let indicatorReader: IndicatorReader | null = null
let signalGenerator: SignalGeneratorV2 | null = null
let telegramService: TelegramService | null = null
let wsInterceptor: ReturnType<typeof getWebSocketInterceptor> | null = null
let isInitialized = false

interface TradingConfigV2 {
  enabled: boolean
  autoAssetSwitch: boolean
  minPayout: number
  tradeAmount: number
  maxDrawdown: number
  maxConsecutiveLosses: number
  onlyRSI: boolean
}

const DEFAULT_CONFIG: TradingConfigV2 = {
  enabled: false,
  autoAssetSwitch: true,
  minPayout: 92,
  tradeAmount: 10,
  maxDrawdown: 20,
  maxConsecutiveLosses: 5,
  onlyRSI: true,
}

let tradingConfig: TradingConfigV2 = { ...DEFAULT_CONFIG }

async function initialize(): Promise<void> {
  if (isInitialized) return
  try {
    console.log('[PO] [1] Starting initialization...');
    await waitForElement('body')
    console.log('[PO] [2] Body element available');
    if (typeof chrome === 'undefined' || !chrome.storage) {
        throw new Error('Chrome API not available');
    }
    const selectors = await loadSelectors()
    console.log('[PO] [3] Selectors loaded');
    dataCollector = new DataCollector(selectors)
    tradeExecutor = new TradeExecutor(selectors)
    candleCollector = getCandleCollector()
    payoutMonitor = getPayoutMonitor()
    indicatorReader = getIndicatorReader()
    signalGenerator = getSignalGeneratorV2({ symbols: ['CURRENT'], minConfidence: 0.3, expirySeconds: 60, })
    telegramService = await getTelegramService()
    wsInterceptor = getWebSocketInterceptor()
    console.log('[PO] [4] Modules initialized');
    setupCandleHandler(); setupPayoutHandler(); setupSignalHandler(); setupIndicatorHandler(); setupWebSocketHandler();
    console.log('[PO] [5] Handlers attached');
    dataCollector.start(); candleCollector.start(); payoutMonitor.start(30000); indicatorReader.start(); wsInterceptor.start();
    console.log('[PO] [6] Background monitors started');
    AutoMiner.init(payoutMonitor);
    isInitialized = true
    console.log('[PO] [SUCCESS] Initialized successfully');
    console.log('[PO] Build Version: 2026-02-04 19:20 (PO-16 Fix)');
    logSystemStatus()
  } catch (error) { console.error('[PO] [FATAL] Initialization failed:', error); }
}

function setupCandleHandler(): void {
  if (!candleCollector || !signalGenerator) return
  candleCollector.onCandle((ticker: string, candle: Candle) => {
    const signal = signalGenerator!.addCandle(ticker, candle)
    if (signal) { console.log(`[PO] 🎯 Signal: ${signal.direction} (${signal.strategy})`); handleNewSignal(signal); }
    DataSender.sendCandle({ ...candle, ticker })
  })
}

function setupPayoutHandler(): void {
  if (!payoutMonitor) return
  payoutMonitor.subscribe((assets: AssetPayout[]) => {
    if (tradingConfig.autoAssetSwitch && assets.length > 0) {
      const best = assets[0]; console.log(`[PO] Best asset: ${best.name} (${best.payout}%)`);
      if (best.payout >= tradingConfig.minPayout) notifyBestAsset(best);
    }
  })
}

function setupIndicatorHandler(): void {
  if (!indicatorReader) return
  indicatorReader.onUpdate((values: IndicatorValues) => {
    // if (values.rsi !== undefined) console.log(`[PO] 📊 Page RSI: ${values.rsi.toFixed(1)}`);
    try { chrome.runtime.sendMessage({ type: 'INDICATOR_UPDATE', payload: values }).catch(() => {}) } catch {}
  })
}

function setupSignalHandler(): void {
  if (!signalGenerator) return
  signalGenerator.onSignal((signal: Signal) => {
    telegramService?.notifySignal(signal);
    try { chrome.runtime.sendMessage({ type: 'NEW_SIGNAL_V2', payload: { signal, config: tradingConfig } }).catch(() => {}) } catch {}
    if (tradingConfig.enabled) executeSignal(signal);
  })
}

function setupWebSocketHandler(): void {
  if (!wsInterceptor || !candleCollector) return
  wsInterceptor.onPriceUpdate((update: PriceUpdate) => {
    // console.log(`[PO] 🔌 WS Price: ${update.symbol} = ${update.price}`);
    try { chrome.runtime.sendMessage({ type: 'WS_PRICE_UPDATE', payload: update }).catch(() => {}) } catch {}
    if (candleCollector) candleCollector.addTickFromWebSocket(update.symbol, update.price, update.timestamp);
  })
  wsInterceptor.onHistoryReceived((candles: CandleData[]) => {
      if (!candles || candles.length === 0) return

      // Get current asset symbol from various sources
      let currentSymbol = candles[0].symbol;
      if (!currentSymbol || currentSymbol === 'CURRENT' || currentSymbol === 'UNKNOWN') {
        // Try 1: From WebSocket tracked asset ID
        const wsAssetId = wsInterceptor?.getActiveAssetId();
        if (wsAssetId) {
          currentSymbol = wsAssetId.replace(/^#/, '').replace(/_otc$/i, '-OTC').replace(/_/g, '-').toUpperCase();
        }
        // Try 2: From DOM
        if (!currentSymbol || currentSymbol === 'CURRENT') {
          const symbolEl = document.querySelector('.current-symbol, .pair__title, [data-testid="asset-name"]');
          if (symbolEl) {
            currentSymbol = (symbolEl.textContent || '').trim().toUpperCase().replace(/\s+/g, '-');
          }
        }
        // Fallback
        if (!currentSymbol) currentSymbol = 'UNKNOWN-ASSET';
      }

      console.log(`[PO] 📜 History Captured: ${candles.length} candles for ${currentSymbol}`);
      const payload = candles.map(c => ({
        ...c,
        symbol: (c.symbol && c.symbol !== 'CURRENT' && c.symbol !== 'UNKNOWN') ? c.symbol : currentSymbol,
        ticker: (c.symbol && c.symbol !== 'CURRENT' && c.symbol !== 'UNKNOWN') ? c.symbol : currentSymbol
      }));
      DataSender.sendHistory(payload).catch(err => console.error('[PO] History send failed:', err));
  })
    wsInterceptor.onMessage((message: WebSocketMessage) => {
      // [PO-17] 모든 웹소켓 메시지 로깅 (디버그용)
      if (message.parsed && Array.isArray(message.parsed)) {
         const event = message.parsed[0];
         if (event === 'load_history' || event === 'history' || event === 'candles') {
            console.log(`[PO] [WS-Debug] History response detected! Event: ${event}`);
         }
      }
      
      if (wsInterceptor?.getStatus().analysisMode) {
      try { chrome.runtime.sendMessage({ type: 'WS_MESSAGE', payload: { connectionId: message.connectionId, parsed: message.parsed, timestamp: message.timestamp } }).catch(() => {}) } catch {}
    }
  })
  wsInterceptor.onConnectionChange((connection: WebSocketConnection) => {
    console.log(`[PO] 🔌 WS Connection: ${connection.id} (${connection.readyState})`);
    try { chrome.runtime.sendMessage({ type: 'WS_CONNECTION', payload: connection }).catch(() => {}) } catch {}
  })
}

async function handleNewSignal(signal: Signal): Promise<void> {
  const bestAsset = payoutMonitor?.getBestAsset(); if (bestAsset && bestAsset.payout < tradingConfig.minPayout) return;
  if (tradingConfig.onlyRSI && !signal.strategy.includes('RSI')) return;
  if (tradingConfig.enabled) await executeSignal(signal);
}

async function executeSignal(signal: Signal): Promise<void> {
  if (!tradeExecutor) return
  console.log(`[PO] 🚀 Executing: ${signal.direction} (${signal.strategy})`);
  try {
    const result = await tradeExecutor.executeTrade(signal.direction, tradingConfig.tradeAmount);
    if (result) telegramService?.sendMessage(`🚀 [PO] <b>Trade Executed</b>\n${signal.direction} on ${signal.symbol}`);
    try { chrome.runtime.sendMessage({ type: 'TRADE_EXECUTED', payload: { signalId: signal.id, result, timestamp: Date.now() } }).catch(() => {}) } catch {}
  } catch (error) { console.error('[PO] Trade execution error:', error) }
}

function notifyBestAsset(asset: AssetPayout): void {
  try { chrome.runtime.sendMessage({ type: 'BEST_ASSET', payload: asset }).catch(() => {}) } catch {}
}

async function switchToAsset(assetName: string): Promise<boolean> {
  if (!payoutMonitor) return false; console.log(`[PO] Switching to asset: ${assetName}`);
  return await payoutMonitor.switchAsset(assetName);
}

function logSystemStatus(): void { const status = getSystemStatus(); console.log('[PO] System Status:', JSON.stringify(status, null, 2)); }
function getSystemStatus(): object {
  return {
    initialized: isInitialized,
    modules: {
      dataCollector: dataCollector?.isCollecting ?? false,
      candleCollector: candleCollector?.isCollecting ?? false,
      payoutMonitor: payoutMonitor?.isMonitoring ?? false,
      indicatorReader: indicatorReader?.isReading ?? false,
      wsInterceptor: wsInterceptor?.getStatus() ?? null,
    },
    config: tradingConfig,
    highPayoutAssets: payoutMonitor?.getHighPayoutAssets().length ?? 0,
    candleCount: candleCollector?.getTickers().map(t => ({ ticker: t, count: candleCollector!.getCandles(t).length })) ?? [],
  }
}

function getLLMReport(): object {
  if (!signalGenerator) return { error: 'Signal generator not initialized' }
  const signals = signalGenerator.getSignals(100); return generateLLMReport(signals);
}

try { chrome.runtime.onMessage.addListener((message: ExtensionMessage, _, sendResponse) => { handleMessage(message).then(sendResponse); return true }) } catch (e) { console.warn('[PO] Extension context lost', e); }

async function handleMessage(message: ExtensionMessage): Promise<unknown> {
  switch (message.type) {
    case 'START_AUTO_MINER': AutoMiner.start(); return { success: true, message: 'Auto Miner Started' };
    case 'STOP_AUTO_MINER': AutoMiner.stop(); return { success: true, message: 'Auto Miner Stopped' };
    case 'GET_MINER_STATUS': return AutoMiner.getStatus();
    case 'GET_STATUS_V2': return getSystemStatus();
    case 'GET_LLM_REPORT': return getLLMReport();
    case 'SET_CONFIG_V2': tradingConfig = { ...tradingConfig, ...(message.payload as unknown as Partial<TradingConfigV2>) }; return { success: true, config: tradingConfig };
    case 'START_TRADING_V2': tradingConfig.enabled = true; return { success: true };
    case 'STOP_TRADING_V2': tradingConfig.enabled = false; return { success: true };
    case 'GET_HIGH_PAYOUT_ASSETS': return payoutMonitor?.getHighPayoutAssets() ?? [];
    case 'SWITCH_ASSET': return switchToAsset(message.payload.assetName);
    case 'EXPORT_CANDLES': return candleCollector?.exportCandles(message.payload.ticker) ?? null;
    default: return null
  }
}

async function loadSelectors(): Promise<DOMSelectors> { try { const result = await chrome.storage.local.get('domSelectors'); return result.domSelectors || DEFAULT_SELECTORS } catch { return DEFAULT_SELECTORS } }
function waitForElement(selector: string, timeout = 10000): Promise<Element | null> {
  return new Promise((resolve) => {
    const element = document.querySelector(selector); if (element) { resolve(element); return }
    const observer = new MutationObserver((_, obs) => { const el = document.querySelector(selector); if (el) { obs.disconnect(); resolve(el) } });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); resolve(null) }, timeout)
  })
}

export { getSystemStatus, getLLMReport }
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initialize) } else { initialize() }
