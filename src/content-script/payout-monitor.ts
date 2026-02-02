// ============================================================
// Payout Monitor - Real-time asset payout tracking
// ============================================================
// Monitors all available assets and their payouts
// Filters for high-payout assets (92%+) for optimal trading
// ============================================================

import { forceClick } from '../lib/dom-utils'

export interface AssetPayout {
  name: string
  payout: number // percentage, e.g., 92
  isOTC: boolean
  lastUpdated: number
}

export interface PayoutFilter {
  minPayout: number // minimum payout percentage
  onlyOTC: boolean
}

const DEFAULT_FILTER: PayoutFilter = {
  minPayout: 92,
  onlyOTC: true,
}

// DOM Selectors for asset list
const SELECTORS = {
  assetList: '.assets-block__alist.alist',
  assetItem: '.alist__item', // Reverted to simple selector
  assetLabel: '.alist__label',
  assetProfit: '.alist__profit',
  pairTrigger: '.current-symbol',
  overlay: '.modal-overlay',
}

export class PayoutMonitor {
  private assets: Map<string, AssetPayout> = new Map()
  private filter: PayoutFilter
  private pollInterval: ReturnType<typeof setInterval> | null = null
  private observers: ((assets: AssetPayout[]) => void)[] = []
  private _isMonitoring = false

  constructor(filter: PayoutFilter = DEFAULT_FILTER) {
    this.filter = filter
  }

  get isMonitoring(): boolean {
    return this._isMonitoring
  }

  /**
   * Start monitoring payouts
   * Opens asset list and polls for updates
   */
  async start(pollIntervalMs = 30000): Promise<void> {
    if (this._isMonitoring) return

    console.log('[PayoutMonitor] Starting payout monitoring...')
    this._isMonitoring = true

    // Initial fetch
    await this.fetchPayouts()

    // Poll periodically
    this.pollInterval = setInterval(async () => {
      await this.fetchPayouts()
    }, pollIntervalMs)
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
    this._isMonitoring = false
    console.log('[PayoutMonitor] Stopped payout monitoring')
  }

  /**
   * Subscribe to payout updates
   */
  subscribe(callback: (assets: AssetPayout[]) => void): () => void {
    this.observers.push(callback)
    return () => {
      this.observers = this.observers.filter(cb => cb !== callback)
    }
  }

  /**
   * Get all assets
   */
  getAllAssets(): AssetPayout[] {
    return Array.from(this.assets.values())
  }

  /**
   * Get filtered assets (high payout)
   */
  getHighPayoutAssets(): AssetPayout[] {
    return this.getAllAssets()
      .filter(a => a.payout >= this.filter.minPayout)
      .filter(a => !this.filter.onlyOTC || a.isOTC)
      .sort((a, b) => b.payout - a.payout)
  }

  /**
   * Get best asset for trading
   */
  getBestAsset(): AssetPayout | null {
    const highPayout = this.getHighPayoutAssets()
    return highPayout.length > 0 ? highPayout[0] : null
  }

  /**
   * Switch to a specific asset
   */
  async switchAsset(assetName: string): Promise<boolean> {
    console.log(`[PayoutMonitor] Attempting to switch to: ${assetName}`)

    // 1. Open picker
    await this.openAssetPicker()
    await this.wait(500) // Wait for animation

    // 2. Find asset element
    const assetItems = document.querySelectorAll(SELECTORS.assetItem)
    let targetElement: HTMLElement | null = null

    for (const item of assetItems) {
      const labelEl = item.querySelector(SELECTORS.assetLabel)
      if (labelEl && labelEl.textContent?.trim() === assetName) {
        targetElement = item as HTMLElement
        break
      }
    }

    // 3. Click if found using advanced force click
    if (targetElement) {
      const clicked = await forceClick(targetElement)
      
      if (clicked) {
        console.log(`[PayoutMonitor] Force clicked asset: ${assetName}`)
      } else {
        console.warn(`[PayoutMonitor] Force click failed for: ${assetName}`)
      }
      
      // Wait for switch
      await this.wait(500)
      return clicked
    } else {
      console.warn(`[PayoutMonitor] Asset not found in list: ${assetName}`)
      await this.closeAssetPicker()
      return false
    }
  }

  /**
   * Update filter settings
   */
  setFilter(filter: Partial<PayoutFilter>): void {
    this.filter = { ...this.filter, ...filter }
  }

  /**
   * Fetch current payouts from DOM
   */
  private async fetchPayouts(): Promise<void> {
    try {
      // Try to get payouts from already visible list
      let payouts = this.scrapePayoutsFromDOM()

      // If not enough, try opening the asset picker
      if (payouts.length < 5) {
        await this.openAssetPicker()
        await this.wait(500)
        payouts = this.scrapePayoutsFromDOM()
        await this.closeAssetPicker()
      }

      // Update internal state
      const now = Date.now()
      payouts.forEach(p => {
        this.assets.set(p.name, { ...p, lastUpdated: now })
      })

      // Notify observers
      this.notifyObservers()

      console.log(`[PayoutMonitor] Updated ${payouts.length} assets. High payout: ${this.getHighPayoutAssets().length}`)
    } catch (error) {
      console.error('[PayoutMonitor] Error fetching payouts:', error)
    }
  }

  /**
   * Scrape payouts from visible DOM
   */
  private scrapePayoutsFromDOM(): AssetPayout[] {
    const payouts: AssetPayout[] = []

    // Try asset list
    const assetItems = document.querySelectorAll(SELECTORS.assetItem)

    assetItems.forEach(item => {
      const labelEl = item.querySelector(SELECTORS.assetLabel)
      const profitEl = item.querySelector(SELECTORS.assetProfit)

      if (labelEl && profitEl) {
        const name = labelEl.textContent?.trim() || ''
        const profitText = profitEl.textContent?.trim() || ''
        const payout = this.parsePayoutPercent(profitText)

        if (name && payout > 0) {
          payouts.push({
            name,
            payout,
            isOTC: name.includes('OTC'),
            lastUpdated: Date.now(),
          })
        }
      }
    })

    return payouts
  }

  /**
   * Parse payout percentage from text like "+92%"
   */
  private parsePayoutPercent(text: string): number {
    const match = text.match(/\+?(\d+)%?/)
    return match ? parseInt(match[1], 10) : 0
  }

  /**
   * Open asset picker dropdown
   */
  private async openAssetPicker(): Promise<void> {
    // Check if already open
    const list = document.querySelector(SELECTORS.assetList)
    if (list && list.getBoundingClientRect().height > 0) {
        console.log('[PayoutMonitor] Asset picker already open')
        return
    }

    const trigger = document.querySelector(SELECTORS.pairTrigger) as HTMLElement
    if (trigger) {
      trigger.click()
    } else {
        // Fallback for different UI versions
        const fallback = document.querySelector('.pair-number-wrap, .pair') as HTMLElement
        if (fallback) fallback.click()
    }
  }

  /**
   * Close asset picker
   */
  private async closeAssetPicker(): Promise<void> {
    // Click overlay or close button
    const overlay = document.querySelector(SELECTORS.overlay) as HTMLElement
    if (overlay) {
        overlay.click()
    } else {
        // Fallback: Click body (sometimes closes dropdowns)
        document.body.click()
    }
  }

  /**
   * Wait helper
   */
  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Notify all observers
   */
  private notifyObservers(): void {
    const assets = this.getHighPayoutAssets()
    this.observers.forEach(cb => cb(assets))

    // Also send to background
    chrome.runtime.sendMessage({
      type: 'PAYOUT_UPDATE',
      payload: { 
        highPayoutAssets: assets,
        totalAssets: this.assets.size,
      },
    }).catch(() => {})
  }
}

// Singleton instance
let payoutMonitorInstance: PayoutMonitor | null = null

export function getPayoutMonitor(): PayoutMonitor {
  if (!payoutMonitorInstance) {
    payoutMonitorInstance = new PayoutMonitor()
  }
  return payoutMonitorInstance
}
