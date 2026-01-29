// ============================================================
// Content Script - Runs on Pocket Option pages
// ============================================================

import { DOMSelectors, DEFAULT_SELECTORS, Tick, ExtensionMessage } from '../lib/types'
import { DataCollector } from './data-collector'
import { TradeExecutor } from './executor'

let dataCollector: DataCollector | null = null
let tradeExecutor: TradeExecutor | null = null
let isInitialized = false

/**
 * Initialize content script
 */
async function initialize(): Promise<void> {
  if (isInitialized) return
  
  console.log('[Pocket Quant] Content script initializing...')
  
  // Wait for page to fully load
  await waitForElement('body')
  
  // Initialize modules with selectors (will use defaults/stubs until configured)
  const selectors = await loadSelectors()
  
  dataCollector = new DataCollector(selectors)
  tradeExecutor = new TradeExecutor(selectors)
  
  // Start data collection
  dataCollector.start()
  
  isInitialized = true
  console.log('[Pocket Quant] Content script initialized')
}

/**
 * Load DOM selectors from storage or use defaults
 */
async function loadSelectors(): Promise<DOMSelectors> {
  try {
    const result = await chrome.storage.local.get('domSelectors')
    return result.domSelectors || DEFAULT_SELECTORS
  } catch {
    return DEFAULT_SELECTORS
  }
}

/**
 * Wait for an element to appear in DOM
 */
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
// Message Handling
// ============================================================

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _, sendResponse) => {
  handleMessage(message).then(sendResponse)
  return true // Keep channel open for async response
})

async function handleMessage(message: ExtensionMessage): Promise<unknown> {
  switch (message.type) {
    case 'START_TRADING':
      return tradeExecutor?.startAutoTrading()
    
    case 'STOP_TRADING':
      return tradeExecutor?.stopAutoTrading()
    
    case 'GET_STATUS':
      return {
        isCollecting: dataCollector?.isCollecting ?? false,
        isTrading: tradeExecutor?.isTrading ?? false,
        currentPrice: dataCollector?.getCurrentPrice(),
      }
    
    default:
      console.warn('[Pocket Quant] Unknown message type:', message.type)
      return null
  }
}

// ============================================================
// Initialize on load
// ============================================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize)
} else {
  initialize()
}
