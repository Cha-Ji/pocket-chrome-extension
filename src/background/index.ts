// ============================================================
// Background Service Worker
// Manages trading state and coordinates between components
// ============================================================

import {
  ExtensionMessage,
  MessagePayloadMap,
  Tick,
  Trade,
  TradingStatus,
  TelegramConfig,
} from '../lib/types';
import {
  TickRepository,
  TradeRepository,
  CandleRepository,
  CandleDatasetRepository,
} from '../lib/db';
import { getTelegramService, resetTelegramService } from '../lib/notifications/telegram';
import {
  POError,
  ErrorCode,
  ErrorSeverity,
  errorHandler,
  Result,
  tryCatchAsync,
  ignoreError,
} from '../lib/errors';
import { PORT_CHANNEL, RELAY_MESSAGE_TYPES, THROTTLE_CONFIG } from '../lib/port-channel';
import { loggers } from '../lib/logger';
import { TickBuffer } from './tick-buffer';
import { backgroundStore } from './store';
import {
  handleTradeExecuted as tradeHandlerExecuted,
  handleFinalizeTrade as tradeHandlerFinalize,
  handleGetTrades as tradeHandlerGetTrades,
  type TradeHandlerDeps,
} from './handlers/trade-handlers';
import {
  handleCandleFinalized,
  handleCandleHistoryChunk,
  handleGetCandleDBStats,
  type CandleHandlerDeps,
} from './handlers/candle-handlers';

// ============================================================
// Error Handler Setup
// ============================================================

// Subscribe to critical errors for Telegram notification
errorHandler.onError(async (error) => {
  if (error.isSeverityAtLeast(ErrorSeverity.ERROR)) {
    try {
      const telegram = await getTelegramService();
      await telegram.notifyError(error.toShortString());
    } catch {
      // Telegram notification failure should not cause further errors
    }
  }
});

// ============================================================
// State (managed via backgroundStore — see store.ts)
// ============================================================

// Log significant state changes (skip high-frequency ticker updates)
backgroundStore.subscribe((next, prev) => {
  const ns = next.tradingStatus;
  const ps = prev.tradingStatus;
  if (
    ns.isRunning !== ps.isRunning ||
    ns.balance !== ps.balance ||
    ns.sessionId !== ps.sessionId
  ) {
    console.log('[Background] State changed:', {
      isRunning: ns.isRunning,
      balance: ns.balance,
      sessionId: ns.sessionId,
    });
  }
});

// ============================================================
// Storage Access Level (Content Script에서 session storage 접근 허용)
// ============================================================
chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });

// ============================================================
// Auto-reset Telegram singleton on storage changes
// ============================================================

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.appConfig) {
    const oldTelegram = changes.appConfig.oldValue?.telegram;
    const newTelegram = changes.appConfig.newValue?.telegram;
    // telegram 섹션이 실제로 변경된 경우에만 리셋
    if (JSON.stringify(oldTelegram) !== JSON.stringify(newTelegram)) {
      loggers.background.info('Telegram config changed in storage.local — resetting singleton');
      resetTelegramService();
    }
  }
  if (areaName === 'session' && changes.telegramSecure) {
    loggers.background.info(
      'Telegram secure data changed in storage.session — resetting singleton',
    );
    resetTelegramService();
  }
});

// ============================================================
// Port-based Side Panel Communication
// ============================================================

const connectedPorts = new Set<chrome.runtime.Port>();
const lastRelayedAt = new Map<string, number>();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_CHANNEL) return;

  loggers.background.info('Side panel port connected');
  connectedPorts.add(port);

  port.onDisconnect.addListener(() => {
    connectedPorts.delete(port);
    loggers.background.info('Side panel port disconnected');
  });
});

/**
 * Relay a message from content script to all connected side panel ports.
 * Only relays types listed in RELAY_MESSAGE_TYPES.
 * Throttles high-frequency messages per THROTTLE_CONFIG.
 */
function relayToSidePanels(message: { type: string; payload?: unknown }): void {
  if (connectedPorts.size === 0) return;
  if (!RELAY_MESSAGE_TYPES.has(message.type)) return;

  // Throttle high-frequency messages
  const throttleMs = THROTTLE_CONFIG[message.type];
  if (throttleMs) {
    const now = Date.now();
    const last = lastRelayedAt.get(message.type) || 0;
    if (now - last < throttleMs) return;
    lastRelayedAt.set(message.type, now);
  }

  for (const port of connectedPorts) {
    try {
      port.postMessage(message);
    } catch {
      connectedPorts.delete(port);
    }
  }
}

// ============================================================
// Trade Handler Dependencies (DI bridge)
// ============================================================

function getTradeHandlerDeps(): TradeHandlerDeps {
  return {
    tradeRepo: TradeRepository,
    tradingStatus: backgroundStore.getState().tradingStatus,
    broadcast: (message) => {
      chrome.runtime.sendMessage(message).catch(() => {
        // Side panel may not be open - this is expected
      });
    },
  };
}

// ============================================================
// Candle Handler Dependencies (DI bridge)
// ============================================================

function getCandleHandlerDeps(): CandleHandlerDeps {
  return {
    candleRepo: CandleRepository,
    datasetRepo: CandleDatasetRepository,
  };
}

// ============================================================
// Extension Lifecycle
// ============================================================

chrome.runtime.onInstalled.addListener(() => {
  loggers.background.info('Extension installed');
  initializeSidePanel();
});

chrome.runtime.onStartup.addListener(async () => {
  loggers.background.info('Extension started');
  await ignoreError(
    async () => {
      const telegram = await getTelegramService();
      await telegram.notifyStatus('Extension Service Worker Started');
    },
    { module: 'background', function: 'onStartup' },
    { logLevel: 'warn' },
  );
});

/**
 * Initialize side panel behavior
 */
function initializeSidePanel(): void {
  // Open side panel when clicking extension icon
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

// ============================================================
// Message Handling
// ============================================================

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((err) => {
      errorHandler.handle(
        POError.from(
          err,
          { module: 'background', function: 'onMessage' },
          ErrorCode.MSG_RECEIVE_FAILED,
        ),
      );
      sendResponse({ error: String(err) });
    });
  return true;
});

async function handleMessage(
  message: ExtensionMessage,
  _sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  const ctx = { module: 'background' as const, function: 'handleMessage' };

  // Relay eligible messages to connected side panel ports
  relayToSidePanels(message as { type: string; payload?: unknown });

  // Ensure Telegram service is initialized (singleton will handle it)
  await ignoreError(
    () => getTelegramService(),
    { ...ctx, function: 'getTelegramService' },
    { logLevel: 'warn' },
  );

  switch (message.type) {
    case 'TICK_DATA':
      return handleTickData(message.payload);

    case 'TRADE_EXECUTED':
      return handleTradeExecutedWithErrorHandling(message.payload);

    case 'GET_TRADES':
      return handleGetTradesWithErrorHandling(message.payload);

    case 'GET_STATUS':
      return backgroundStore.getState().tradingStatus;

    case 'START_TRADING':
      return startTrading();

    case 'STOP_TRADING':
      return stopTrading();

    case 'STATUS_UPDATE':
      return updateStatus(message.payload);

    case 'TRADE_LOGGED':
      // Broadcast-only message consumed by side panel; no-op in background
      return null;

    case 'FINALIZE_TRADE':
      return handleFinalizeTradeWithErrorHandling(message.payload);

    case 'TRADE_SETTLED':
      // Broadcast-only message consumed by side panel; no-op in background
      return null;

    case 'CANDLE_FINALIZED':
      return handleCandleFinalizedWithErrorHandling(message.payload);

    case 'CANDLE_HISTORY_CHUNK':
      return handleCandleHistoryChunkWithErrorHandling(message.payload);

    case 'GET_CANDLE_DB_STATS':
      return handleGetCandleDBStatsWithErrorHandling();

    case 'GET_TICK_BUFFER_STATS':
      return handleGetTickBufferStats();

    case 'FLUSH_TICK_BUFFER':
      return handleFlushTickBuffer();

    case 'RUN_TICK_RETENTION':
      return handleRunTickRetention();

    case 'GET_ERROR_STATS':
      return errorHandler.getStats();

    case 'GET_ERROR_HISTORY':
      return errorHandler.getHistory(message.payload?.limit ?? 20);

    case 'RELOAD_TELEGRAM_CONFIG':
      return handleReloadTelegramConfig(message.payload);

    case 'SELECTOR_HEALTHCHECK_RESULT':
      return handleSelectorHealthcheckResult(message.payload);

    case 'GET_SELECTOR_HEALTHCHECK':
      return lastHealthcheckResult;

    default:
      // Don't log errors for relay-only messages (already forwarded via port)
      if (!RELAY_MESSAGE_TYPES.has((message as { type: string }).type)) {
        errorHandler.handle(
          new POError({
            code: ErrorCode.MSG_INVALID_TYPE,
            message: `Unknown message type: ${(message as { type: string }).type}`,
            context: ctx,
          }),
        );
      }
      return null;
  }
}

// ============================================================
// Trading Control
// ============================================================

async function startTrading(): Promise<{ success: boolean; error?: string }> {
  const ctx = { module: 'background' as const, function: 'startTrading' };

  if (backgroundStore.getState().tradingStatus.isRunning) {
    return { success: false, error: 'Already running' };
  }

  const result = await tryCatchAsync(
    async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        throw new POError({
          code: ErrorCode.MSG_NO_RECEIVER,
          message: 'No active tab found',
          context: ctx,
        });
      }

      const response = await chrome.tabs.sendMessage(tab.id, { type: 'START_TRADING' });

      if (!response?.success) {
        throw new POError({
          code: ErrorCode.TRADE_EXECUTION_FAILED,
          message: response?.message || 'Failed to start trading',
          context: { ...ctx, extra: { response } },
        });
      }

      backgroundStore.setState((s) => ({
        tradingStatus: { ...s.tradingStatus, isRunning: true },
      }));
      notifyStatusChange();
      return true;
    },
    ctx,
    ErrorCode.TRADE_EXECUTION_FAILED,
  );

  return Result.toLegacy(result);
}

async function stopTrading(): Promise<{ success: boolean; error?: string }> {
  const ctx = { module: 'background' as const, function: 'stopTrading' };

  if (!backgroundStore.getState().tradingStatus.isRunning) {
    return { success: false, error: 'Not running' };
  }

  const result = await tryCatchAsync(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new POError({
        code: ErrorCode.MSG_NO_RECEIVER,
        message: 'No active tab found',
        context: ctx,
      });
    }

    await chrome.tabs.sendMessage(tab.id, { type: 'STOP_TRADING' });

    backgroundStore.setState((s) => ({
      tradingStatus: { ...s.tradingStatus, isRunning: false },
    }));
    notifyStatusChange();
    return true;
  }, ctx);

  return Result.toLegacy(result);
}

function updateStatus(updates: Partial<TradingStatus>): void {
  backgroundStore.setState((s) => ({
    tradingStatus: { ...s.tradingStatus, ...updates },
  }));
  notifyStatusChange();
}

// ============================================================
// Data Handling — TickBuffer (batch + sampling + retention)
// ============================================================

const tickBuffer = new TickBuffer(
  // Policy can be tuned via TickStoragePolicy fields
  {},
  {
    onFlushError(error, tickCount) {
      errorHandler.handle(
        new POError({
          code: ErrorCode.DB_WRITE_FAILED,
          message: `Tick batch flush 실패 (${tickCount}건): ${error}`,
          severity: ErrorSeverity.WARNING,
          context: { module: 'background', function: 'tickBuffer.flush' },
        }),
      );
    },
  },
);

// Start the retention sweep timer
tickBuffer.start();

function handleTickData(tick: Tick): void {
  if (!tick) return;
  tickBuffer.ingest(tick);
  // Only update store when ticker actually changes to avoid noisy notifications
  if (backgroundStore.getState().tradingStatus.currentTicker !== tick.ticker) {
    backgroundStore.setState((s) => ({
      tradingStatus: { ...s.tradingStatus, currentTicker: tick.ticker },
    }));
  }
}

async function handleGetTickBufferStats(): Promise<{
  buffer: ReturnType<TickBuffer['getStats']>;
  db: { count: number; oldestTimestamp: number | null; newestTimestamp: number | null };
}> {
  const [bufferStats, dbStats] = await Promise.all([
    Promise.resolve(tickBuffer.getStats()),
    TickRepository.getStats(),
  ]);
  return { buffer: bufferStats, db: dbStats };
}

async function handleFlushTickBuffer(): Promise<{ flushed: number }> {
  const flushed = await tickBuffer.flush();
  return { flushed };
}

async function handleRunTickRetention(): Promise<{ ageDeleted: number; capDeleted: number }> {
  return await tickBuffer.runRetention();
}

// ============================================================
// Candle Handlers (single DB owner — all writes go through Background)
// ============================================================

async function handleCandleFinalizedWithErrorHandling(
  payload: MessagePayloadMap['CANDLE_FINALIZED'],
): Promise<{ success: boolean }> {
  const ctx = { module: 'background' as const, function: 'handleCandleFinalized' };

  const result = await tryCatchAsync(
    () => handleCandleFinalized(payload, getCandleHandlerDeps()),
    ctx,
    ErrorCode.DB_WRITE_FAILED,
  );

  if (!result.success) {
    errorHandler.handle(
      new POError({
        code: ErrorCode.DB_WRITE_FAILED,
        message: `Candle DB 저장 실패: ${result.error}`,
        severity: ErrorSeverity.WARNING,
        context: ctx,
      }),
    );
  }

  return { success: result.success };
}

async function handleCandleHistoryChunkWithErrorHandling(
  payload: MessagePayloadMap['CANDLE_HISTORY_CHUNK'],
): Promise<{ success: boolean; added?: number }> {
  const ctx = { module: 'background' as const, function: 'handleCandleHistoryChunk' };

  const result = await tryCatchAsync(
    () => handleCandleHistoryChunk(payload, getCandleHandlerDeps()),
    ctx,
    ErrorCode.DB_WRITE_FAILED,
  );

  if (!result.success) {
    errorHandler.handle(
      new POError({
        code: ErrorCode.DB_WRITE_FAILED,
        message: `Candle history chunk DB 저장 실패 (${payload.symbol}): ${result.error}`,
        severity: ErrorSeverity.WARNING,
        context: ctx,
      }),
    );
    return { success: false };
  }

  return result.data;
}

async function handleGetCandleDBStatsWithErrorHandling(): Promise<unknown> {
  const ctx = { module: 'background' as const, function: 'handleGetCandleDBStats' };

  const result = await tryCatchAsync(
    () => handleGetCandleDBStats(getCandleHandlerDeps()),
    ctx,
    ErrorCode.DB_READ_FAILED,
  );

  return result.success
    ? result.data
    : {
        candles: { totalCandles: 0, tickers: [], oldestTimestamp: null, newestTimestamp: null },
        datasets: [],
      };
}

// ============================================================
// Trade Handlers (delegating to extracted pure handlers)
// ============================================================

async function handleTradeExecutedWithErrorHandling(
  payload: MessagePayloadMap['TRADE_EXECUTED'],
): Promise<{ success: boolean; tradeId?: number; ignored?: boolean }> {
  const ctx = { module: 'background' as const, function: 'handleTradeExecuted' };

  loggers.background.info('Trade executed:', payload);

  // P0: entryPrice가 없거나 0이면 경고 (데이터 오염 방지)
  if (payload.result !== false && (!payload.entryPrice || payload.entryPrice <= 0)) {
    errorHandler.handle(
      new POError({
        code: ErrorCode.TRADE_VALIDATION_FAILED,
        message: `TRADE_EXECUTED with invalid entryPrice: ${payload.entryPrice}`,
        severity: ErrorSeverity.WARNING,
        context: ctx,
      }),
    );
  }

  const result = await tryCatchAsync(
    () => tradeHandlerExecuted(payload, getTradeHandlerDeps()),
    ctx,
    ErrorCode.DB_WRITE_FAILED,
  );

  if (!result.success) {
    errorHandler.handle(
      new POError({
        code: ErrorCode.DB_WRITE_FAILED,
        message: `거래 기록 DB 저장 실패: ${result.error}`,
        severity: ErrorSeverity.ERROR,
        context: ctx,
      }),
    );
    return { success: false };
  }

  return result.data;
}

async function handleGetTradesWithErrorHandling(payload: {
  sessionId?: number;
  limit?: number;
}): Promise<Trade[]> {
  const ctx = { module: 'background' as const, function: 'handleGetTrades' };

  const result = await tryCatchAsync(
    () => tradeHandlerGetTrades(payload, getTradeHandlerDeps()),
    ctx,
    ErrorCode.DB_READ_FAILED,
  );

  return result.success ? result.data : [];
}

// ============================================================
// Trade Settlement (P1: Expiry-based WIN/LOSS)
// ============================================================

async function handleFinalizeTradeWithErrorHandling(
  payload: MessagePayloadMap['FINALIZE_TRADE'],
): Promise<{ success: boolean }> {
  const ctx = { module: 'background' as const, function: 'handleFinalizeTrade' };

  loggers.background.info('Finalizing trade:', payload);

  const result = await tryCatchAsync(
    () => tradeHandlerFinalize(payload, getTradeHandlerDeps()),
    ctx,
    ErrorCode.DB_WRITE_FAILED,
  );

  if (!result.success) {
    errorHandler.handle(
      new POError({
        code: ErrorCode.DB_WRITE_FAILED,
        message: `거래 정산 DB 업데이트 실패 (tradeId=${payload.tradeId}): ${result.error}`,
        severity: ErrorSeverity.ERROR,
        context: ctx,
      }),
    );
  }

  return { success: result.success };
}

// ============================================================
// Notifications
// ============================================================

function notifyStatusChange(): void {
  // Broadcast status change to all extension pages (side panel)
  // Use ignoreError since side panel may not be open
  chrome.runtime
    .sendMessage({
      type: 'STATUS_UPDATE',
      payload: backgroundStore.getState().tradingStatus,
    })
    .catch(() => {
      // Side panel may not be open - this is expected
    });
}

// ============================================================
// Telegram Config Reload
// ============================================================

async function handleReloadTelegramConfig(_config: TelegramConfig): Promise<{ success: boolean }> {
  const ctx = { module: 'background' as const, function: 'handleReloadTelegramConfig' };

  // 싱글톤 무효화 → 다음 getTelegramService()가 storage에서 최신 설정 로드
  resetTelegramService();
  loggers.background.info('Telegram service singleton reset');

  await ignoreError(
    async () => {
      const telegram = await getTelegramService();
      await telegram.notifyStatus('Telegram config reloaded');
    },
    ctx,
    { logLevel: 'warn' },
  );

  return { success: true };
}

// ============================================================
// Selector Healthcheck
// ============================================================

let lastHealthcheckResult: MessagePayloadMap['SELECTOR_HEALTHCHECK_RESULT'] | null = null;

async function handleSelectorHealthcheckResult(
  payload: MessagePayloadMap['SELECTOR_HEALTHCHECK_RESULT'],
): Promise<{ received: boolean }> {
  const ctx = { module: 'background' as const, function: 'handleSelectorHealthcheckResult' };

  lastHealthcheckResult = payload;

  if (!payload.passed) {
    const level = payload.tradingHalted ? 'CRITICAL' : 'WARNING';
    console.warn(`[Background] Selector healthcheck ${level}:`, payload);

    if (payload.tradingHalted) {
      errorHandler.handle(
        new POError({
          code: ErrorCode.SELECTOR_HEALTHCHECK_FAILED,
          message: `Selector healthcheck failed — trading halted. Critical: [${payload.criticalFailures.join(', ')}]`,
          severity: ErrorSeverity.ERROR,
          context: ctx,
        }),
      );

      // Force-stop active trading session when critical selectors are missing
      if (backgroundStore.getState().tradingStatus.isRunning) {
        console.warn('[Background] Force-stopping trading due to selector healthcheck failure');
        await stopTrading();
      }
    }

    // Send Telegram notification if enabled (errors channel)
    await ignoreError(
      async () => {
        const telegram = await getTelegramService();
        const config = telegram.getConfig();
        if (config.enabled && config.notifyErrors) {
          const failList = [
            ...payload.criticalFailures.map((k) => `[CRITICAL] ${k}`),
            ...payload.nonCriticalFailures.map((k) => `[WARN] ${k}`),
          ].join('\n');

          await telegram.sendMessage(
            `<b>Selector Healthcheck ${payload.tradingHalted ? 'FAILED' : 'WARNING'}</b>\n` +
              `env=${payload.environment} | v${payload.version}\n` +
              `${payload.tradingHalted ? 'Trading HALTED\n' : ''}` +
              `\n${failList}`,
          );
        }
      },
      ctx,
      { logLevel: 'warn' },
    );
  } else {
    console.log('[Background] Selector healthcheck PASSED');
  }

  return { received: true };
}

// ============================================================
// Alarms for periodic tasks
// ============================================================

chrome.alarms.onAlarm.addListener((alarm) => {
  switch (alarm.name) {
    case 'cleanup':
      cleanupOldData();
      break;
  }
});

async function cleanupOldData(): Promise<void> {
  const ctx = { module: 'background' as const, function: 'cleanupOldData' };

  await tryCatchAsync(
    async () => {
      // Flush any pending ticks before cleanup
      await tickBuffer.flush();
      // Run retention (age + count cap)
      await tickBuffer.runRetention();
    },
    ctx,
    ErrorCode.DB_DELETE_FAILED,
  );
}

// Setup cleanup alarm
chrome.alarms.create('cleanup', { periodInMinutes: 60 });
