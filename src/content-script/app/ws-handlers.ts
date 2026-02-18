// ============================================================
// ws-handlers.ts — WebSocket, candle, payout, indicator, signal handlers
// ============================================================

import { Candle } from '../candle-collector';
import { AssetPayout } from '../payout-monitor';
import { IndicatorValues } from '../indicator-reader';
import { PriceUpdate, WebSocketMessage, WebSocketConnection } from '../websocket-interceptor';
import { CandleData } from '../websocket-parser';
import { Signal } from '../../lib/signals/types';
import { DataSender } from '../../lib/data-sender';
import { AutoMiner } from '../auto-miner';
import { tickImbalanceFadeStrategy, TIF60Config } from '../tick-strategies';
import { normalizeSymbol, normalizeTimestampMs } from '../../lib/utils/normalize';
import { ContentScriptContext } from './context';
import { handleNewSignal } from './trade-lifecycle';

// ============================================================
// TIF-60 Integration
// ============================================================

export interface TIF60Integration {
  enabled: boolean;
  requireConsensus: boolean;
  config: Partial<TIF60Config>;
}

export const tif60Integration: TIF60Integration = {
  enabled: true,
  requireConsensus: false,
  config: {},
};

const TIF60_THROTTLE_MS = 300;
const tif60LastEval: Map<string, number> = new Map();

export function evaluateTIF60(ctx: ContentScriptContext, rawTicker: string, price: number): void {
  if (!tif60Integration.enabled || !ctx.candleCollector || !ctx.signalGenerator) return;
  const ticker = normalizeSymbol(rawTicker);

  const now = Date.now();
  const lastEval = tif60LastEval.get(ticker) || 0;
  if (now - lastEval < TIF60_THROTTLE_MS) return;
  tif60LastEval.set(ticker, now);

  const tickerTicks = ctx.candleCollector.getTicksByTicker(ticker);
  const candles = ctx.candleCollector.getCandles(ticker);

  const tifResult = tickImbalanceFadeStrategy(tickerTicks, candles, tif60Integration.config);

  if (tifResult.signal) {
    const tifSignal: Signal = {
      id: `${ticker}-tif60-${now}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: now,
      symbol: ticker,
      direction: tifResult.signal,
      strategyId: 'TIF-60',
      strategy: tifResult.reason,
      regime: ctx.signalGenerator!.getRegime(ticker)?.regime ?? 'unknown',
      confidence: tifResult.confidence,
      expiry: 60,
      entryPrice: price,
      indicators: tifResult.indicators,
      status: 'pending',
    };
    if (tif60Integration.requireConsensus) {
      const recentSignals = ctx.signalGenerator!.getSignals(5);
      const v2Signal = recentSignals.filter((s) => s.symbol === ticker).pop();
      if (v2Signal && v2Signal.direction === tifResult.signal) {
        tifSignal.confidence = Math.min(tifSignal.confidence + 0.05, 0.95);
        tifSignal.strategy = `${tifSignal.strategy} + V2 consensus`;
        tifSignal.indicators = { ...tifSignal.indicators, ...v2Signal.indicators };
        console.log(`[PO] 🎯 TIF-60 + V2 consensus: ${tifResult.signal}`);
        handleNewSignal(ctx, tifSignal);
      }
    } else {
      console.log(`[PO] 🎯 TIF-60 Signal: ${tifSignal.direction} (${tifSignal.strategy})`);
      handleNewSignal(ctx, tifSignal);
    }
  }
}

// ============================================================
// Handler Setup Functions
// ============================================================

export function setupAllHandlers(ctx: ContentScriptContext): void {
  setupCandleHandler(ctx);
  setupPayoutHandler(ctx);
  setupSignalHandler(ctx);
  setupIndicatorHandler(ctx);
  setupWebSocketHandler(ctx);
}

function setupCandleHandler(ctx: ContentScriptContext): void {
  if (!ctx.candleCollector || !ctx.signalGenerator) return;
  ctx.candleCollector.onCandle((ticker: string, candle: Candle) => {
    ctx.signalGenerator!.addCandle(ticker, candle);
    DataSender.sendCandle({ ...candle, ticker });
  });
}

function setupPayoutHandler(ctx: ContentScriptContext): void {
  if (!ctx.payoutMonitor) return;
  ctx.payoutMonitor.subscribe((assets: AssetPayout[]) => {
    if (ctx.tradingConfig.autoAssetSwitch && assets.length > 0) {
      const best = assets[0];
      console.log(`[PO] Best asset: ${best.name} (${best.payout}%)`);
      if (best.payout >= ctx.tradingConfig.minPayout) {
        notifyBestAsset(best);
      }
    }
  });
}

function setupIndicatorHandler(ctx: ContentScriptContext): void {
  if (!ctx.indicatorReader) return;
  ctx.indicatorReader.onUpdate((values: IndicatorValues) => {
    try {
      chrome.runtime.sendMessage({ type: 'INDICATOR_UPDATE', payload: values }).catch(() => {});
    } catch {}
  });
}

function setupSignalHandler(ctx: ContentScriptContext): void {
  if (!ctx.signalGenerator) return;
  ctx.signalGenerator.onSignal((signal: Signal) => {
    ctx.telegramService?.notifySignal(signal);
    try {
      chrome.runtime
        .sendMessage({ type: 'NEW_SIGNAL_V2', payload: { signal, config: ctx.tradingConfig } })
        .catch(() => {});
    } catch {}
    handleNewSignal(ctx, signal);
  });
}

function setupWebSocketHandler(ctx: ContentScriptContext): void {
  if (!ctx.wsInterceptor || !ctx.candleCollector) return;

  ctx.wsInterceptor.onPriceUpdate((update: PriceUpdate) => {
    let symbol = update.symbol;
    if (!symbol || symbol === 'CURRENT' || symbol === 'UNKNOWN') {
      const wsAssetId = ctx.wsInterceptor?.getActiveAssetId();
      if (wsAssetId) {
        symbol = wsAssetId;
      } else {
        const symbolEl = document.querySelector(
          '.current-symbol, .pair__title, [data-testid="asset-name"]',
        );
        if (symbolEl) symbol = (symbolEl.textContent || '').trim();
      }
    }
    symbol = normalizeSymbol(symbol || 'UNKNOWN');
    const ts = normalizeTimestampMs(update.timestamp);
    const normalized = { ...update, symbol, timestamp: ts };

    try {
      chrome.runtime.sendMessage({ type: 'WS_PRICE_UPDATE', payload: normalized }).catch(() => {});
    } catch {}
    if (ctx.candleCollector) ctx.candleCollector.addTickFromWebSocket(symbol, update.price, ts);
    evaluateTIF60(ctx, symbol, update.price);
  });

  ctx.wsInterceptor.onHistoryReceived((candles: CandleData[]) => {
    if (!candles || candles.length === 0) return;

    let currentSymbol = candles[0].symbol;
    if (!currentSymbol || currentSymbol === 'CURRENT' || currentSymbol === 'UNKNOWN') {
      const wsAssetId = ctx.wsInterceptor?.getActiveAssetId();
      if (wsAssetId) {
        currentSymbol = wsAssetId;
      }
      if (!currentSymbol || currentSymbol === 'CURRENT' || currentSymbol === 'UNKNOWN') {
        const symbolEl = document.querySelector(
          '.current-symbol, .pair__title, [data-testid="asset-name"]',
        );
        if (symbolEl) {
          currentSymbol = (symbolEl.textContent || '').trim();
        }
      }
      if (!currentSymbol) currentSymbol = 'UNKNOWN-ASSET';
    }
    currentSymbol = normalizeSymbol(currentSymbol);

    console.log(`[PO] 📜 History Captured: ${candles.length} candles for ${currentSymbol}`);
    const payload = candles.map((c) => {
      const sym =
        c.symbol && c.symbol !== 'CURRENT' && c.symbol !== 'UNKNOWN'
          ? normalizeSymbol(c.symbol)
          : currentSymbol;
      return {
        ...c,
        symbol: sym,
        ticker: sym,
        timestamp: normalizeTimestampMs(c.timestamp),
      };
    });
    // [2A] Save history candles to local IndexedDB (chunked to avoid UI freeze)
    saveHistoryCandlesToDB(currentSymbol, payload).catch((err) =>
      console.warn('[PO] History DB save failed (local still ok):', err),
    );

    // Send to remote server (with retry); failure is non-fatal if local saved
    DataSender.sendHistory(payload).catch((err) =>
      console.warn('[PO] History send to server failed:', err),
    );

    if (ctx.signalGenerator && currentSymbol !== 'UNKNOWN-ASSET') {
      const seedCandles: Candle[] = payload
        .filter((c) => c.timestamp > 0 && c.open > 0 && c.close > 0)
        .map((c) => ({
          timestamp: normalizeTimestampMs(c.timestamp),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        }))
        .sort((a, b) => a.timestamp - b.timestamp);
      if (seedCandles.length > 0) {
        ctx.signalGenerator.setHistory(currentSymbol, seedCandles);
        console.log(
          `[PO] 🌱 Seeded ${seedCandles.length} candles to SignalGeneratorV2 for ${currentSymbol}`,
        );
      }
    }

    AutoMiner.onHistoryResponse(candles);
  });

  ctx.wsInterceptor.onMessage((message: WebSocketMessage) => {
    // Feed WS messages to AccountVerifier for demo/real detection (#52)
    ctx.accountVerifier?.feedWsMessage(message.raw ?? message.text ?? message.parsed);

    if (message.parsed && Array.isArray(message.parsed)) {
      const event = message.parsed[0];
      if (event === 'load_history' || event === 'history' || event === 'candles') {
        console.log(`[PO] [WS-Debug] History response detected! Event: ${event}`);
      }
    }

    if (ctx.wsInterceptor?.getStatus().analysisMode) {
      try {
        chrome.runtime
          .sendMessage({
            type: 'WS_MESSAGE',
            payload: {
              connectionId: message.connectionId,
              parsed: message.parsed,
              timestamp: message.timestamp,
            },
          })
          .catch(() => {});
      } catch {}
    }
  });

  ctx.wsInterceptor.onConnectionChange((connection: WebSocketConnection) => {
    console.log(`[PO] 🔌 WS Connection: ${connection.id} (${connection.readyState})`);
    try {
      chrome.runtime.sendMessage({ type: 'WS_CONNECTION', payload: connection }).catch(() => {});
    } catch {}
  });
}

function notifyBestAsset(asset: AssetPayout): void {
  try {
    chrome.runtime.sendMessage({ type: 'BEST_ASSET', payload: asset }).catch(() => {});
  } catch {}
}

// ============================================================
// [2A] History candles → Background (chunked message passing)
// ============================================================
// Candle DB ownership is centralized in Background Service Worker.
// Content Script sends CANDLE_HISTORY_CHUNK messages instead of
// writing directly to IndexedDB. This eliminates origin/ownership
// ambiguity and ensures a single writer for candle data.
// ============================================================

const HISTORY_CHUNK_SIZE = 1000;

async function saveHistoryCandlesToDB(
  symbol: string,
  candles: Array<{
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }>,
): Promise<void> {
  if (candles.length === 0 || symbol === 'UNKNOWN-ASSET') return;

  const validCandles = candles.filter((c) => c.timestamp > 0 && c.open > 0 && c.close > 0);
  if (validCandles.length === 0) return;

  let totalAdded = 0;
  const startTs = Date.now();

  // Chunk processing — send each chunk as a message to Background
  for (let i = 0; i < validCandles.length; i += HISTORY_CHUNK_SIZE) {
    const chunk = validCandles.slice(i, i + HISTORY_CHUNK_SIZE);
    const isLastChunk = i + HISTORY_CHUNK_SIZE >= validCandles.length;

    try {
      const result = (await chrome.runtime.sendMessage({
        type: 'CANDLE_HISTORY_CHUNK',
        payload: {
          symbol,
          interval: 60,
          candles: chunk,
          source: 'history',
          isFinal: isLastChunk,
        },
      })) as { success?: boolean; added?: number } | null;

      if (result?.added) {
        totalAdded += result.added;
      }
    } catch (e) {
      console.warn(`[PO] CANDLE_HISTORY_CHUNK send failed (chunk ${i}):`, e);
    }

    // Yield to UI between chunks
    if (!isLastChunk) {
      await new Promise<void>((resolve) => {
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(() => resolve());
        } else {
          setTimeout(resolve, 0);
        }
      });
    }
  }

  console.log(
    `[PO] 💾 Sent ${totalAdded}/${validCandles.length} history candles to Background for ${symbol} (${Date.now() - startTs}ms)`,
  );
}
