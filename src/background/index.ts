// ============================================================
// Background Service Worker
// Manages trading state and coordinates between components
// ============================================================

import { ExtensionMessage, Tick, Trade, TradingStatus } from '../lib/types'
import { TickRepository, TradeRepository } from '../lib/db'
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
import { PORT_CHANNEL, RELAY_MESSAGE_TYPES, THROTTLE_CONFIG } from '../lib/port-channel'

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
// Storage Access Level (Content Script에서 session storage 접근 허용)
// ============================================================
chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })

// ============================================================
// Port-based Side Panel Communication
// ============================================================

const connectedPorts = new Set<chrome.runtime.Port>()
const lastRelayedAt = new Map<string, number>()

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_CHANNEL) return

  console.log('[Background] Side panel port connected')
  connectedPorts.add(port)

  port.onDisconnect.addListener(() => {
    connectedPorts.delete(port)
    console.log('[Background] Side panel port disconnected')
  })
})

/**
 * Relay a message from content script to all connected side panel ports.
 * Only relays types listed in RELAY_MESSAGE_TYPES.
 * Throttles high-frequency messages per THROTTLE_CONFIG.
 */
function relayToSidePanels(message: { type: string; payload?: unknown }): void {
  if (connectedPorts.size === 0) return
  if (!RELAY_MESSAGE_TYPES.has(message.type)) return

  // Throttle high-frequency messages
  const throttleMs = THROTTLE_CONFIG[message.type]
  if (throttleMs) {
    const now = Date.now()
    const last = lastRelayedAt.get(message.type) || 0
    if (now - last < throttleMs) return
    lastRelayedAt.set(message.type, now)
  }

  for (const port of connectedPorts) {
    try {
      port.postMessage(message)
    } catch {
      connectedPorts.delete(port)
    }
  }
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
  _sender: chrome.runtime.MessageSender
): Promise<unknown> {
  const ctx = { module: 'background' as const, function: 'handleMessage' }

  // Relay eligible messages to connected side panel ports
  relayToSidePanels(message as { type: string; payload?: unknown })

  // Ensure Telegram service is initialized (singleton will handle it)
  await ignoreError(
    () => getTelegramService(),
    { ...ctx, function: 'getTelegramService' },
    { logLevel: 'warn' }
  )

  switch (message.type) {
    case 'TICK_DATA':
      return handleTickData(message.payload)

    case 'TRADE_EXECUTED':
      return handleTradeExecuted(message.payload)

    case 'GET_STATUS':
      return tradingStatus

    case 'START_TRADING':
      return startTrading()

    case 'STOP_TRADING':
      return stopTrading()

    case 'STATUS_UPDATE':
      return updateStatus(message.payload)

    case 'GET_ERROR_STATS':
      return errorHandler.getStats()

    case 'GET_ERROR_HISTORY':
      return errorHandler.getHistory(message.payload?.limit ?? 20)

    default:
      // Don't log errors for relay-only messages (already forwarded via port)
      if (!RELAY_MESSAGE_TYPES.has((message as { type: string }).type)) {
        errorHandler.handle(
          new POError({
            code: ErrorCode.MSG_INVALID_TYPE,
            message: `Unknown message type: ${(message as { type: string }).type}`,
            context: ctx,
          })
        )
      }
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

// Tick 저장 실패 시 재시도를 위한 메모리 버퍼
const failedTickBuffer: Tick[] = []
const MAX_FAILED_TICK_BUFFER = 100
let consecutiveTickFailures = 0

async function handleTickData(tick: Tick): Promise<void> {
  if (!tick) return

  const ctx = { module: 'background' as const, function: 'handleTickData' }

  // 이전에 실패한 tick이 있으면 함께 재시도
  const ticksToSave = [...failedTickBuffer, tick]
  failedTickBuffer.length = 0

  const result = await tryCatchAsync(
    async () => {
      if (ticksToSave.length === 1) {
        await TickRepository.add(ticksToSave[0])
      } else {
        await TickRepository.bulkAdd(ticksToSave)
      }

      // 저장 성공 시 연속 실패 카운터 리셋
      consecutiveTickFailures = 0

      // 현재 티커 업데이트
      tradingStatus.currentTicker = tick.ticker

      // 주기적으로 오래된 데이터 정리 (10000개 초과 시)
      const count = (await TickRepository.count()) || 0
      if (count > 10000) {
        const cutoff = Date.now() - 24 * 60 * 60 * 1000 // 24시간
        await TickRepository.deleteOlderThan(cutoff)
      }
    },
    ctx,
    ErrorCode.DB_WRITE_FAILED
  )

  if (!result.success) {
    consecutiveTickFailures++

    // 실패한 tick을 버퍼에 보관 (버퍼 크기 제한)
    for (const t of ticksToSave) {
      if (failedTickBuffer.length < MAX_FAILED_TICK_BUFFER) {
        failedTickBuffer.push(t)
      }
    }

    // 연속 5회 실패 시 경고 알림
    if (consecutiveTickFailures === 5) {
      errorHandler.handle(
        new POError({
          code: ErrorCode.DB_WRITE_FAILED,
          message: `Tick 데이터 연속 ${consecutiveTickFailures}회 저장 실패 (버퍼: ${failedTickBuffer.length}건)`,
          severity: ErrorSeverity.WARNING,
          context: ctx,
        })
      )
    }
  }
}

async function handleTradeExecuted(payload: {
  signalId?: string
  result?: unknown
  timestamp?: number
  direction?: Trade['direction']
  amount?: number
  ticker?: string
  entryPrice?: number
}): Promise<void> {
  const ctx = { module: 'background' as const, function: 'handleTradeExecuted' }

  console.log('[Background] Trade executed:', payload)

  const result = await tryCatchAsync(
    async () => {
      const trade: Omit<Trade, 'id'> = {
        sessionId: tradingStatus.sessionId ?? 0,
        ticker: payload.ticker ?? tradingStatus.currentTicker ?? 'unknown',
        direction: payload.direction ?? 'CALL',
        entryTime: payload.timestamp ?? Date.now(),
        entryPrice: payload.entryPrice ?? 0,
        result: 'PENDING',
        amount: payload.amount ?? 0,
      }

      await TradeRepository.create(trade)
    },
    ctx,
    ErrorCode.DB_WRITE_FAILED
  )

  // 저장 실패 시 에러 핸들러를 통해 알림
  if (!result.success) {
    errorHandler.handle(
      new POError({
        code: ErrorCode.DB_WRITE_FAILED,
        message: `거래 기록 DB 저장 실패: ${result.error}`,
        severity: ErrorSeverity.ERROR,
        context: ctx,
      })
    )
  }
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
