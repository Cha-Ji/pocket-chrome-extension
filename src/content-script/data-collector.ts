// ============================================================
// Data Collector - Captures price data from DOM
// ============================================================
// NOTE: Actual DOM selectors need to be discovered after login
// Current implementation uses stubs that will be replaced
// ============================================================

import { DOMSelectors, Tick } from '../lib/types'

export class DataCollector {
  private selectors: DOMSelectors
  private observer: MutationObserver | null = null
  private _isCollecting = false
  private currentPrice: number | null = null
  private priceHistory: Tick[] = []
  private maxHistorySize = 5000

  constructor(selectors: DOMSelectors) {
    this.selectors = selectors
  }

  get isCollecting(): boolean {
    return this._isCollecting
  }

  /**
   * Start collecting price data
   * TODO: Implement actual DOM observation after login
   */
  start(): void {
    if (this._isCollecting) return
    
    console.log('[PO] [DataCollector] Starting data collection...')
    this._isCollecting = true
    
    // TODO: Replace with actual MutationObserver setup
    // This is a stub that demonstrates the interface
    this.setupPriceObserver()
  }

  /**
   * Stop collecting price data
   */
  stop(): void {
    if (!this._isCollecting) return
    
    console.log('[PO] [DataCollector] Stopping data collection...')
    this.observer?.disconnect()
    this.observer = null
    this._isCollecting = false
  }

  /**
   * Get current price
   */
  getCurrentPrice(): number | null {
    return this.currentPrice
  }

  /**
   * Get price history
   */
  getPriceHistory(): Tick[] {
    return [...this.priceHistory]
  }

  /**
   * Get recent prices as array
   */
  getRecentPrices(count: number): number[] {
    return this.priceHistory
      .slice(-count)
      .map(tick => tick.price)
  }

  // ============================================================
  // STUB: DOM Observation Setup
  // These methods need actual implementation after login
  // ============================================================

  /**
   * Setup MutationObserver for price changes
   * STUB: Actual selectors and logic TBD
   */
  private setupPriceObserver(): void {
    const priceElement = document.querySelector(this.selectors.priceDisplay)
    
    if (!priceElement) {
      console.warn('[DataCollector] Price element not found. Selectors may need updating.')
      // In production, we would retry or notify the user
      return
    }

    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData' || mutation.type === 'childList') {
          this.handlePriceUpdate(priceElement)
        }
      }
    })

    this.observer.observe(priceElement, {
      characterData: true,
      childList: true,
      subtree: true,
    })

    // Initial price capture
    this.handlePriceUpdate(priceElement)
  }

  /**
   * Handle price update from DOM
   * STUB: Actual parsing logic TBD
   */
  private handlePriceUpdate(element: Element): void {
    const priceText = element.textContent?.trim()
    if (!priceText) return

    const price = this.parsePrice(priceText)
    if (price === null) return

    this.currentPrice = price
    this.recordTick(price)
  }

  /**
   * Parse price from text
   * STUB: Actual format TBD based on site's price display
   */
  private parsePrice(text: string): number | null {
    // Remove currency symbols, commas, etc.
    const cleaned = text.replace(/[^0-9.]/g, '')
    const price = parseFloat(cleaned)
    return isNaN(price) ? null : price
  }

  /**
   * Record a tick to history
   */
  private recordTick(price: number): void {
    const tick: Tick = {
      ticker: this.getCurrentTicker(),
      timestamp: Date.now(),
      price,
    }

    this.priceHistory.push(tick)

    // Trim history if too large
    if (this.priceHistory.length > this.maxHistorySize) {
      this.priceHistory = this.priceHistory.slice(-this.maxHistorySize)
    }

    // Notify background script
    this.notifyPriceUpdate(tick)
  }

  /**
   * Get current ticker symbol
   * STUB: Actual implementation TBD
   */
  private getCurrentTicker(): string {
    const tickerElement = document.querySelector(this.selectors.tickerSelector)
    return tickerElement?.textContent?.trim() || 'UNKNOWN'
  }

  /**
   * Notify background script of price update
   */
  private notifyPriceUpdate(tick: Tick): void {
    chrome.runtime.sendMessage({
      type: 'TICK_DATA',
      payload: tick,
    }).catch(() => {
      // Background script may not be ready
    })
  }
}
