// ============================================================
// Content Script - Pocket Option Auto Trading V2
// ============================================================

console.log('[PO] >>> SCRIPT LOADED <<<');

import { DOMSelectors, DEFAULT_SELECTORS, ExtensionMessage, TradingConfigV2 } from '../lib/types'
import { DataCollector } from './data-collector'
import { TradeExecutor } from './executor'
import { getCandleCollector, CandleCollector, Candle } from './candle-collector'
import { getPayoutMonitor, PayoutMonitor, AssetPayout } from './payout-monitor'
import { getIndicatorReader, IndicatorReader, IndicatorValues } from './indicator-reader'
import { getSignalGeneratorV2, SignalGeneratorV2, generateLLMReport } from '../lib/signals/signal-generator-v2'
import { Signal } from '../lib/signals/types'
import { getTelegramService, resetTelegramService, TelegramService } from '../lib/notifications/telegram'
import { getWebSocketInterceptor, PriceUpdate, WebSocketMessage, WebSocketConnection } from './websocket-interceptor'
import { CandleData } from './websocket-parser'
import { AutoMiner } from './auto-miner'
import { DataSender } from '../lib/data-sender'
import { CandleRepository, CandleDatasetRepository } from '../lib/db'
import { tickImbalanceFadeStrategy, TIF60Config } from './tick-strategies'
import { normalizeSymbol, normalizeTimestampMs } from '../lib/utils/normalize'
import { evaluateSignalGates, type GateContext } from '../lib/trading/signal-gate'
import {
  persistPendingTrades,
  loadPendingTrades,
  type PendingTradeData,
} from './pending-trade-store'

let dataCollector: DataCollector | null = null
let tradeExecutor: TradeExecutor | null = null
let candleCollector: CandleCollector | null = null
let payoutMonitor: PayoutMonitor | null = null
let indicatorReader: IndicatorReader | null = null
let signalGenerator: SignalGeneratorV2 | null = null
let telegramService: TelegramService | null = null
let wsInterceptor: ReturnType<typeof getWebSocketInterceptor> | null = null
let isInitialized = false

// [#46] Race Condition Guard: 동시 거래 실행 방지
let isExecutingTrade = false
let lastTradeExecutedAt = 0
const TRADE_COOLDOWN_MS = 3000 // 최소 3초 간격

// ============================================================
// P1: Pending Trade Settlement (만기 후 WIN/LOSS 판정)
// ============================================================

interface PendingTrade extends PendingTradeData {
  timerId: ReturnType<typeof setTimeout>
}

const pendingTrades: Map<number, PendingTrade> = new Map()
const SETTLEMENT_GRACE_MS = 800 // 만기 후 가격 안정화 대기 시간

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
    try { telegramService = await getTelegramService() } catch { console.warn('[PO] Telegram service unavailable, continuing without it'); telegramService = null }
    wsInterceptor = getWebSocketInterceptor()
    console.log('[PO] [4] Modules initialized');
    setupCandleHandler(); setupPayoutHandler(); setupSignalHandler(); setupIndicatorHandler(); setupWebSocketHandler();
    console.log('[PO] [5] Handlers attached');
    dataCollector.start(); candleCollector.start(); payoutMonitor.start(30000); indicatorReader.start(); wsInterceptor.start();
    console.log('[PO] [6] Background monitors started');
    AutoMiner.init(payoutMonitor);
    // Restore pending trades from previous session (tab reload recovery)
    await restorePendingTrades();
    isInitialized = true
    console.log('[PO] [SUCCESS] Initialized successfully');
    console.log('[PO] Build Version: 2026-02-04 19:20 (PO-16 Fix)');
    logSystemStatus()
  } catch (error) { console.error('[PO] [FATAL] Initialization failed:', error); }
}

/** TIF-60 설정: requireConsensus=true면 SignalGeneratorV2와 방향 합의 필요 */
interface TIF60Integration {
  enabled: boolean
  requireConsensus: boolean
  config: Partial<TIF60Config>
}

const tif60Integration: TIF60Integration = {
  enabled: true,
  requireConsensus: false,
  config: {},
}

// TIF-60 throttle state: evaluate at most once per 300ms per symbol
const TIF60_THROTTLE_MS = 300
const tif60LastEval: Map<string, number> = new Map()

function evaluateTIF60(rawTicker: string, price: number): void {
  if (!tif60Integration.enabled || !candleCollector || !signalGenerator) return
  const ticker = normalizeSymbol(rawTicker)

  const now = Date.now()
  const lastEval = tif60LastEval.get(ticker) || 0
  if (now - lastEval < TIF60_THROTTLE_MS) return
  tif60LastEval.set(ticker, now)

  const tickerTicks = candleCollector.getTicksByTicker(ticker)
  const candles = candleCollector.getCandles(ticker)

  const tifResult = tickImbalanceFadeStrategy(tickerTicks, candles, tif60Integration.config)

  if (tifResult.signal) {
    const tifSignal: Signal = {
      id: `${ticker}-tif60-${now}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: now,
      symbol: ticker,
      direction: tifResult.signal,
      strategyId: 'TIF-60',
      strategy: tifResult.reason,
      regime: signalGenerator!.getRegime(ticker)?.regime ?? 'unknown',
      confidence: tifResult.confidence,
      expiry: 60,
      entryPrice: price,
      indicators: tifResult.indicators,
      status: 'pending',
    }
    if (tif60Integration.requireConsensus) {
      // Consensus mode: check last V2 signal for this symbol
      const recentSignals = signalGenerator!.getSignals(5)
      const v2Signal = recentSignals.filter(s => s.symbol === ticker).pop()
      if (v2Signal && v2Signal.direction === tifResult.signal) {
        tifSignal.confidence = Math.min(tifSignal.confidence + 0.05, 0.95)
        tifSignal.strategy = `${tifSignal.strategy} + V2 consensus`
        tifSignal.indicators = { ...tifSignal.indicators, ...v2Signal.indicators }
        console.log(`[PO] 🎯 TIF-60 + V2 consensus: ${tifResult.signal}`)
        handleNewSignal(tifSignal)
      }
    } else {
      console.log(`[PO] 🎯 TIF-60 Signal: ${tifSignal.direction} (${tifSignal.strategy})`)
      handleNewSignal(tifSignal)
    }
  }
}

function setupCandleHandler(): void {
  if (!candleCollector || !signalGenerator) return
  candleCollector.onCandle((ticker: string, candle: Candle) => {
    // V2 signal generation — execution happens via onSignal listener (setupSignalHandler).
    signalGenerator!.addCandle(ticker, candle)
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
    // V2 신호도 handleNewSignal()을 경유하여 minPayout/onlyRSI/cooldown 필터를 공유한다.
    handleNewSignal(signal);
  })
}

function setupWebSocketHandler(): void {
  if (!wsInterceptor || !candleCollector) return
  wsInterceptor.onPriceUpdate((update: PriceUpdate) => {
    // symbol 정규화: 'CURRENT'/'UNKNOWN'이면 WS/DOM에서 실제 자산 추출
    let symbol = update.symbol
    if (!symbol || symbol === 'CURRENT' || symbol === 'UNKNOWN') {
      const wsAssetId = wsInterceptor?.getActiveAssetId()
      if (wsAssetId) {
        symbol = wsAssetId
      } else {
        const symbolEl = document.querySelector('.current-symbol, .pair__title, [data-testid="asset-name"]')
        if (symbolEl) symbol = (symbolEl.textContent || '').trim()
      }
    }
    symbol = normalizeSymbol(symbol || 'UNKNOWN')
    const ts = normalizeTimestampMs(update.timestamp)
    const normalized = { ...update, symbol, timestamp: ts }

    try { chrome.runtime.sendMessage({ type: 'WS_PRICE_UPDATE', payload: normalized }).catch(() => {}) } catch {}
    if (candleCollector) candleCollector.addTickFromWebSocket(symbol, update.price, ts);
    // TIF-60: evaluate on tick events with throttle (300ms) instead of candle events (1min)
    evaluateTIF60(symbol, update.price)
  })
  wsInterceptor.onHistoryReceived((candles: CandleData[]) => {
      if (!candles || candles.length === 0) return

      // Get current asset symbol from various sources
      let currentSymbol = candles[0].symbol;
      if (!currentSymbol || currentSymbol === 'CURRENT' || currentSymbol === 'UNKNOWN') {
        // Try 1: From WebSocket tracked asset ID
        const wsAssetId = wsInterceptor?.getActiveAssetId();
        if (wsAssetId) {
          currentSymbol = wsAssetId;
        }
        // Try 2: From DOM
        if (!currentSymbol || currentSymbol === 'CURRENT' || currentSymbol === 'UNKNOWN') {
          const symbolEl = document.querySelector('.current-symbol, .pair__title, [data-testid="asset-name"]');
          if (symbolEl) {
            currentSymbol = (symbolEl.textContent || '').trim();
          }
        }
        // Fallback
        if (!currentSymbol) currentSymbol = 'UNKNOWN-ASSET';
      }
      // 정규화: 모든 경로에서 동일한 키 형식 보장
      currentSymbol = normalizeSymbol(currentSymbol);

      console.log(`[PO] 📜 History Captured: ${candles.length} candles for ${currentSymbol}`);
      const payload = candles.map(c => {
        const sym = (c.symbol && c.symbol !== 'CURRENT' && c.symbol !== 'UNKNOWN')
          ? normalizeSymbol(c.symbol) : currentSymbol;
        return {
          ...c,
          symbol: sym,
          ticker: sym,
          timestamp: normalizeTimestampMs(c.timestamp),
        };
      });
      // [2A] Save history candles to local IndexedDB (chunked to avoid UI freeze)
      saveHistoryCandlesToDB(currentSymbol, payload).catch(err =>
        console.warn('[PO] History DB save failed (local still ok):', err)
      )

      // Send to remote server (with retry); failure is non-fatal if local saved
      DataSender.sendHistory(payload).catch(err => console.warn('[PO] History send to server failed:', err));

      // Seed SignalGeneratorV2 with history so strategies can evaluate immediately
      // without waiting 50~140 minutes for buffer to fill via addCandle()
      if (signalGenerator && currentSymbol !== 'UNKNOWN-ASSET') {
        const seedCandles: Candle[] = payload
          .filter(c => c.timestamp > 0 && c.open > 0 && c.close > 0)
          .map(c => ({
            timestamp: normalizeTimestampMs(c.timestamp),
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
          }))
          .sort((a, b) => a.timestamp - b.timestamp)
        if (seedCandles.length > 0) {
          signalGenerator.setHistory(currentSymbol, seedCandles)
          console.log(`[PO] 🌱 Seeded ${seedCandles.length} candles to SignalGeneratorV2 for ${currentSymbol}`)
        }
      }

      // AutoMiner에게 응답 수신 알림 (응답 기반 연쇄 요청 트리거)
      AutoMiner.onHistoryResponse(candles);
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

// ============================================================
// [2A] History candles → IndexedDB (chunked + idle-aware)
// ============================================================

const HISTORY_CHUNK_SIZE = 1000

async function saveHistoryCandlesToDB(
  symbol: string,
  candles: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume?: number }>,
): Promise<void> {
  if (candles.length === 0 || symbol === 'UNKNOWN-ASSET') return

  const validCandles = candles.filter(c => c.timestamp > 0 && c.open > 0 && c.close > 0)
  if (validCandles.length === 0) return

  let totalAdded = 0
  const startTs = Date.now()

  // Chunk processing to avoid blocking the main thread
  for (let i = 0; i < validCandles.length; i += HISTORY_CHUNK_SIZE) {
    const chunk = validCandles.slice(i, i + HISTORY_CHUNK_SIZE)

    const storedChunk = chunk.map(c => ({
      ticker: symbol,
      interval: 60, // 1-minute candles
      timestamp: c.timestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume ?? 0,
      source: 'history' as const,
    }))

    const added = await CandleRepository.bulkAdd(storedChunk, 'history')
    totalAdded += added

    // Yield to UI between chunks using requestIdleCallback or setTimeout(0)
    if (i + HISTORY_CHUNK_SIZE < validCandles.length) {
      await new Promise<void>(resolve => {
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(() => resolve())
        } else {
          setTimeout(resolve, 0)
        }
      })
    }
  }

  // Update dataset metadata
  const timestamps = validCandles.map(c => c.timestamp)
  const minTs = Math.min(...timestamps)
  const maxTs = Math.max(...timestamps)

  await CandleDatasetRepository.upsert({
    ticker: symbol,
    interval: 60,
    startTime: minTs,
    endTime: maxTs,
    candleCount: totalAdded,
    source: 'history',
    lastUpdated: Date.now(),
  })

  console.log(`[PO] 💾 Saved ${totalAdded}/${validCandles.length} history candles to IndexedDB for ${symbol} (${Date.now() - startTs}ms)`)
}

async function handleNewSignal(signal: Signal): Promise<void> {
  const payout = payoutMonitor?.getCurrentAssetPayout() ?? null
  const gateCtx: GateContext = {
    config: tradingConfig,
    currentPayout: payout ? { payout: payout.payout, name: payout.name } : null,
    strategyId: signal.strategyId || '',
    strategyName: signal.strategy || '',
    isExecuting: isExecutingTrade,
    lastTradeAt: lastTradeExecutedAt,
    cooldownMs: TRADE_COOLDOWN_MS,
    now: Date.now(),
  }

  const gate = evaluateSignalGates(gateCtx)
  if (!gate.allowed) {
    console.log(`[PO] Signal blocked [${gate.gate}]: ${gate.reason}`)
    return
  }

  await executeSignal(signal);
}

async function executeSignal(signal: Signal): Promise<void> {
  if (!tradeExecutor) return

  // Race condition / cooldown already checked by evaluateSignalGates in handleNewSignal.
  // Set guard flag here to prevent concurrent calls.
  isExecutingTrade = true
  console.log(`[PO] 🚀 Executing: ${signal.direction} (${signal.strategy})`);
  try {
    const result = await tradeExecutor.executeTrade(signal.direction, tradingConfig.tradeAmount);
    lastTradeExecutedAt = Date.now()

    if (result.success) {
      // P0: entryPrice 결정 — candleCollector의 최신 tick > signal.entryPrice > 거부(0)
      const ticker = normalizeSymbol(signal.symbol)
      let entryPrice = candleCollector?.getLatestTickPrice(ticker) ?? 0
      if (!entryPrice || entryPrice <= 0) entryPrice = signal.entryPrice
      if (!entryPrice || entryPrice <= 0) {
        console.error(`[PO] ❌ Cannot determine entryPrice for ${ticker} — aborting trade record`)
        isExecutingTrade = false
        return
      }

      // Capture payout at entry time for accurate PnL calculation
      const currentPayout = payoutMonitor?.getCurrentAssetPayout()
      const payoutPercent = currentPayout?.payout ?? 0
      if (payoutPercent <= 0) {
        console.warn(`[PO] ⚠️ Cannot determine payout for ${ticker} — PnL will default to 0 on WIN`)
      }

      telegramService?.sendMessage(`🚀 [PO] <b>Trade Executed</b>\n${signal.direction} on ${signal.symbol} @ ${entryPrice} (payout: ${payoutPercent}%)`);
      const expirySeconds = signal.expiry || 60
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'TRADE_EXECUTED',
          payload: {
            signalId: signal.id,
            result: true,
            timestamp: Date.now(),
            direction: signal.direction,
            amount: tradingConfig.tradeAmount,
            ticker,
            entryPrice,
          }
        }) as { success: boolean; tradeId?: number } | undefined

        // P1: 성공 시 만기 정산 타이머 등록
        if (response?.success && response.tradeId) {
          scheduleSettlement({
            tradeId: response.tradeId,
            signalId: signal.id,
            ticker,
            direction: signal.direction,
            entryTime: Date.now(),
            entryPrice,
            expirySeconds,
            amount: tradingConfig.tradeAmount,
            payoutPercent,
          })
        }
      } catch {
        // Background may not be reachable
        console.warn('[PO] Failed to send TRADE_EXECUTED to background')
      }
    } else {
      console.warn(`[PO] ⚠️ Trade failed: ${result.error ?? 'unknown error'}`);
      try { chrome.runtime.sendMessage({ type: 'TRADE_EXECUTED', payload: { signalId: signal.id, result: false, timestamp: Date.now(), direction: signal.direction, error: result.error } }).catch(() => {}) } catch {}
    }
  } catch (error) { console.error('[PO] Trade execution error:', error) }
  finally { isExecutingTrade = false }
}

// ============================================================
// P1: Settlement Scheduling & Evaluation
// ============================================================

function scheduleSettlement(params: Omit<PendingTrade, 'timerId' | 'settlementAt'> & { settlementAt?: number }): void {
  const now = Date.now()
  const settlementAt = params.settlementAt ?? (now + params.expirySeconds * 1000 + SETTLEMENT_GRACE_MS)
  const delayMs = Math.max(0, settlementAt - now)
  console.log(`[PO] ⏱️ Settlement scheduled for tradeId=${params.tradeId} in ${delayMs}ms`)

  const timerId = setTimeout(() => {
    settleTrade(params.tradeId)
  }, delayMs)

  const entry: PendingTrade = { ...params, settlementAt, timerId }
  pendingTrades.set(params.tradeId, entry)

  // Persist to chrome.storage.session (non-blocking)
  persistPendingTradesSnapshot()
}

/** Persist current pending trades snapshot (debounced-safe, fire-and-forget) */
function persistPendingTradesSnapshot(): void {
  const dataMap = new Map<number, PendingTradeData>()
  for (const [id, trade] of pendingTrades) {
    const { timerId: _timerId, ...data } = trade
    dataMap.set(id, data)
  }
  persistPendingTrades(dataMap).catch(() => {})
}

/** Restore pending trades from chrome.storage.session on init */
async function restorePendingTrades(): Promise<void> {
  try {
    const saved = await loadPendingTrades()
    if (saved.length === 0) return

    const now = Date.now()
    let restored = 0
    let lateSettled = 0

    for (const data of saved) {
      // Skip if already in memory (shouldn't happen, but defensive)
      if (pendingTrades.has(data.tradeId)) continue

      if (data.settlementAt <= now) {
        // Past due: settle immediately
        lateSettled++
        // Re-add temporarily to settle
        const timerId = setTimeout(() => settleTrade(data.tradeId), 0)
        pendingTrades.set(data.tradeId, { ...data, timerId })
      } else {
        // Future: reschedule
        restored++
        scheduleSettlement(data)
      }
    }

    if (restored > 0 || lateSettled > 0) {
      console.log(`[PO] Restored ${restored} pending trades, ${lateSettled} late-settled from storage`)
    }
  } catch (e) {
    console.warn('[PO] Failed to restore pending trades:', e)
  }
}

async function settleTrade(tradeId: number): Promise<void> {
  const pending = pendingTrades.get(tradeId)
  if (!pending) return
  pendingTrades.delete(tradeId)
  persistPendingTradesSnapshot()

  // 만기 시점의 최신 가격 조회
  const exitPrice = candleCollector?.getLatestTickPrice(pending.ticker) ?? 0
  if (!exitPrice || exitPrice <= 0) {
    console.warn(`[PO] ⚠️ Cannot get exit price for ${pending.ticker} — marking as LOSS (conservative)`)
  }

  // WIN/LOSS 판정
  let result: 'WIN' | 'LOSS' | 'TIE'
  if (exitPrice <= 0) {
    result = 'LOSS' // 가격을 알 수 없으면 보수적으로 LOSS
  } else if (pending.direction === 'CALL') {
    result = exitPrice > pending.entryPrice ? 'WIN' : exitPrice < pending.entryPrice ? 'LOSS' : 'TIE'
  } else {
    result = exitPrice < pending.entryPrice ? 'WIN' : exitPrice > pending.entryPrice ? 'LOSS' : 'TIE'
  }

  // Binary option PnL:  WIN = +amount * (payoutPercent / 100),  LOSS = -amount,  TIE = 0
  const profit = result === 'WIN'
    ? pending.amount * (pending.payoutPercent / 100)
    : result === 'LOSS'
      ? -pending.amount
      : 0

  console.log(`[PO] 📊 Settlement: tradeId=${tradeId} ${pending.direction} entry=${pending.entryPrice} exit=${exitPrice} => ${result} (profit=${profit})`)

  // Background에 정산 요청
  try {
    await chrome.runtime.sendMessage({
      type: 'FINALIZE_TRADE',
      payload: {
        tradeId,
        signalId: pending.signalId,
        exitPrice,
        result,
        profit,
      }
    })
  } catch {
    console.warn(`[PO] Failed to send FINALIZE_TRADE for tradeId=${tradeId}`)
  }

  // SignalGeneratorV2에 결과 반영
  if (pending.signalId && signalGenerator) {
    const signalResult = result === 'WIN' ? 'win' : result === 'LOSS' ? 'loss' : 'tie'
    signalGenerator.updateSignalResult(pending.signalId, signalResult)
    console.log(`[PO] 📈 Signal ${pending.signalId} updated: ${signalResult}`)
  }
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
    case 'GET_DB_MONITOR_STATUS': return { sender: DataSender.getStats() };
    case 'SET_MINER_CONFIG': AutoMiner.updateConfig(message.payload); return { success: true, config: AutoMiner.getConfig() };
    case 'GET_STATUS_V2': return getSystemStatus();
    case 'GET_LLM_REPORT': return getLLMReport();
    case 'SET_CONFIG_V2': tradingConfig = { ...tradingConfig, ...message.payload }; return { success: true, config: tradingConfig };
    case 'START_TRADING_V2': tradingConfig.enabled = true; return { success: true };
    case 'STOP_TRADING_V2': tradingConfig.enabled = false; return { success: true };
    case 'GET_SIGNALS': return signalGenerator?.getSignals(message.payload.limit ?? 20) ?? [];
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

// ============================================================
// Auto-reset Telegram service on storage changes
// ============================================================

try {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.appConfig) {
      const oldTelegram = changes.appConfig.oldValue?.telegram
      const newTelegram = changes.appConfig.newValue?.telegram
      if (JSON.stringify(oldTelegram) !== JSON.stringify(newTelegram)) {
        console.log('[PO] Telegram config changed in storage — resetting service')
        resetTelegramService()
        getTelegramService().then(svc => { telegramService = svc }).catch(() => {})
      }
    }
    if (areaName === 'session' && changes.telegramSecure) {
      console.log('[PO] Telegram secure data changed — resetting service')
      resetTelegramService()
      getTelegramService().then(svc => { telegramService = svc }).catch(() => {})
    }
  })
} catch { /* Extension context may be lost */ }

export { getSystemStatus, getLLMReport }
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initialize) } else { initialize() }
