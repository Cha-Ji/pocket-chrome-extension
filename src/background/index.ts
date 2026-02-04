// ============================================================
// Background Service Worker
// Manages trading state and coordinates between components
// ============================================================

import { ExtensionMessage, Tick, TradingStatus } from '../lib/types'
import { db, TickRepository } from '../lib/db'
import { getTelegramService } from '../lib/notifications/telegram'
import {
  POError,
  ErrorCode,
  ErrorSeverity,
  errorHandler,
  Result,
  tryCatchAsync,
  ignoreError,
} from '../lib/errors'

// ============================================================
// Error Handler Setup
// ============================================================

// Subscribe to critical errors for Telegram notification
errorHandler.onError(async (error) => {
  if (error.isSeverityAtLeast(ErrorSeverity.ERROR)) {
    try {
      const telegram = await getTelegramService()
      await telegram.notifyError(error.toShortString())
    } catch {
      // Telegram notification failure should not cause further errors
    }
  }
})

// ============================================================
// State
// ============================================================

let tradingStatus: TradingStatus = {
  isRunning: false,
  currentTicker: undefined,
  balance: undefined,
  sessionId: undefined,
}

// ============================================================
// Extension Lifecycle
// ============================================================

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Background] Extension installed')
  initializeSidePanel()
})

chrome.runtime.onStartup.addListener(async () => {
  console.log('[Background] Extension started')
  await ignoreError(
    async () => {
      const telegram = await getTelegramService()
      await telegram.notifyStatus('Extension Service Worker Started')
    },
    { module: 'background', function: 'onStartup' },
    { logLevel: 'warn' }
  )
})

/**
 * Initialize side panel behavior
 */
function initializeSidePanel(): void {
  // Open side panel when clicking extension icon
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
}

// ============================================================
// Message Handling
// ============================================================

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse)
  return true
})

async function handleMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender
): Promise<unknown> {
  const ctx = { module: 'background' as const, function: 'handleMessage' }

  // Ensure Telegram service is initialized (singleton will handle it)
  await ignoreError(
    () => getTelegramService(),
    { ...ctx, function: 'getTelegramService' },
    { logLevel: 'warn' }
  )

  switch (message.type) {
    case 'TICK_DATA':
      return handleTickData(message.payload as Tick)

    case 'TRADE_EXECUTED':
      return handleTradeExecuted(message.payload)

    case 'GET_STATUS':
      return tradingStatus

    case 'START_TRADING':
      return startTrading()

    case 'STOP_TRADING':
      return stopTrading()

    case 'STATUS_UPDATE':
      return updateStatus(message.payload as Partial<TradingStatus>)

    case 'GET_ERROR_STATS':
      return errorHandler.getStats()

    case 'GET_ERROR_HISTORY':
      return errorHandler.getHistory((message.payload as { limit?: number })?.limit ?? 20)

    default:
      errorHandler.handle(
        new POError({
          code: ErrorCode.MSG_INVALID_TYPE,
          message: `Unknown message type: ${message.type}`,
          context: ctx,
        })
      )
      return null
  }
}

// ============================================================
// Trading Control
// ============================================================

async function startTrading(): Promise<{ success: boolean; error?: string }> {
  const ctx = { module: 'background' as const, function: 'startTrading' }

  if (tradingStatus.isRunning) {
    return { success: false, error: 'Already running' }
  }

  const result = await tryCatchAsync(
    async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) {
        throw new POError({
          code: ErrorCode.MSG_NO_RECEIVER,
          message: 'No active tab found',
          context: ctx,
        })
      }

      const response = await chrome.tabs.sendMessage(tab.id, { type: 'START_TRADING' })

      if (!response?.success) {
        throw new POError({
          code: ErrorCode.TRADE_EXECUTION_FAILED,
          message: response?.message || 'Failed to start trading',
          context: { ...ctx, extra: { response } },
        })
      }

      tradingStatus.isRunning = true
      notifyStatusChange()
      return true
    },
    ctx,
    ErrorCode.TRADE_EXECUTION_FAILED
  )

  return Result.toLegacy(result)
}

async function stopTrading(): Promise<{ success: boolean; error?: string }> {
  const ctx = { module: 'background' as const, function: 'stopTrading' }

  if (!tradingStatus.isRunning) {
    return { success: false, error: 'Not running' }
  }

  const result = await tryCatchAsync(
    async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) {
        throw new POError({
          code: ErrorCode.MSG_NO_RECEIVER,
          message: 'No active tab found',
          context: ctx,
        })
      }

      await chrome.tabs.sendMessage(tab.id, { type: 'STOP_TRADING' })

      tradingStatus.isRunning = false
      notifyStatusChange()
      return true
    },
    ctx
  )

  return Result.toLegacy(result)
}

function updateStatus(updates: Partial<TradingStatus>): void {
  tradingStatus = { ...tradingStatus, ...updates }
  notifyStatusChange()
}

// ============================================================
// Data Handling
// ============================================================

async function handleTickData(tick: Tick): Promise<void> {
  if (!tick) return

  const ctx = { module: 'background' as const, function: 'handleTickData' }

  const result = await tryCatchAsync(
    async () => {
      // Store tick in database
      await TickRepository.add(tick)

      // Update current ticker
      tradingStatus.currentTicker = tick.ticker

      // Periodically clean old data (every 1000 ticks)
      const count = (await TickRepository.count()) || 0
      if (count > 10000) {
        const cutoff = Date.now() - 24 * 60 * 60 * 1000 // 24 hours
        await TickRepository.deleteOlderThan(cutoff)
      }
    },
    ctx,
    ErrorCode.DB_WRITE_FAILED
  )

  // Log but don't throw - tick data loss is acceptable
  if (!result.success) {
    // Error already logged by tryCatchAsync via errorHandler
  }
}

async function handleTradeExecuted(payload: unknown): Promise<void> {
  console.log('[Background] Trade executed:', payload)
  // TODO: Record trade in database
}

// ============================================================
// Notifications
// ============================================================

function notifyStatusChange(): void {
  // Broadcast status change to all extension pages (side panel)
  // Use ignoreError since side panel may not be open
  chrome.runtime.sendMessage({
    type: 'STATUS_UPDATE',
    payload: tradingStatus,
  }).catch(() => {
    // Side panel may not be open - this is expected
  })
}

// ============================================================
// Alarms for periodic tasks
// ============================================================

chrome.alarms.onAlarm.addListener((alarm) => {
  switch (alarm.name) {
    case 'cleanup':
      cleanupOldData()
      break
  }
})

async function cleanupOldData(): Promise<void> {
  const ctx = { module: 'background' as const, function: 'cleanupOldData' }

  await tryCatchAsync(
    async () => {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000 // 7 days
      await TickRepository.deleteOlderThan(cutoff)
    },
    ctx,
    ErrorCode.DB_DELETE_FAILED
  )
}

// Setup cleanup alarm
chrome.alarms.create('cleanup', { periodInMinutes: 60 })
