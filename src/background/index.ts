// ============================================================
// Background Service Worker
// Manages trading state and coordinates between components
// ============================================================

import { ExtensionMessage, Tick, TradingStatus } from '../lib/types'
import { db, TickRepository } from '../lib/db'

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
  try {
    const telegram = await getTelegramService()
    await telegram.notifyStatus('Extension Service Worker Started')
  } catch (e) {
    console.error('[Background] Startup notification failed:', e)
  }
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
  // Ensure Telegram service is initialized (singleton will handle it)
  // This helps prevent missing notifications on fresh session starts
  try {
    await getTelegramService()
  } catch (e) {
    console.error('[Background] Telegram Init Error:', e)
  }

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
    
    default:
      console.warn('[Background] Unknown message type:', message.type)
      return null
  }
}

// ============================================================
// Trading Control
// ============================================================

async function startTrading(): Promise<{ success: boolean; error?: string }> {
  if (tradingStatus.isRunning) {
    return { success: false, error: 'Already running' }
  }

  try {
    // Send message to content script
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) {
      return { success: false, error: 'No active tab' }
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: 'START_TRADING' })
    
    if (response?.success) {
      tradingStatus.isRunning = true
      notifyStatusChange()
      return { success: true }
    }
    
    return { success: false, error: response?.message || 'Failed to start' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

async function stopTrading(): Promise<{ success: boolean; error?: string }> {
  if (!tradingStatus.isRunning) {
    return { success: false, error: 'Not running' }
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) {
      return { success: false, error: 'No active tab' }
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: 'STOP_TRADING' })
    
    tradingStatus.isRunning = false
    notifyStatusChange()
    
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
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

  try {
    // Store tick in database
    await TickRepository.add(tick)
    
    // Update current ticker
    tradingStatus.currentTicker = tick.ticker
    
    // Periodically clean old data (every 1000 ticks)
    const count = await TickRepository.count() || 0
    if (count > 10000) {
      const cutoff = Date.now() - 24 * 60 * 60 * 1000 // 24 hours
      await TickRepository.deleteOlderThan(cutoff)
    }
  } catch (error) {
    console.error('[Background] Failed to store tick:', error)
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
  chrome.runtime.sendMessage({
    type: 'STATUS_UPDATE',
    payload: tradingStatus,
  }).catch(() => {
    // Side panel may not be open
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
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000 // 7 days
  await TickRepository.deleteOlderThan(cutoff)
}

// Setup cleanup alarm
chrome.alarms.create('cleanup', { periodInMinutes: 60 })
