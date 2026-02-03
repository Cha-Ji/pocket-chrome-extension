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
  assetItem: '.alist__item',
  assetLabel: '.alist__label',
  assetProfit: '.alist__payout', // Changed from .alist__profit
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
    console.log(`[PayoutMonitor] 🔄 Attempting to switch to: ${assetName}`)

    // 1. Open picker and wait for stability
    await this.openAssetPicker()
    await this.wait(1000)

    // 2. Find asset element
    let targetElement: HTMLElement | null = null
    const assetItems = document.querySelectorAll(SELECTORS.assetItem)
    for (const item of assetItems) {
      const labelEl = item.querySelector(SELECTORS.assetLabel)
      if (labelEl && labelEl.textContent?.trim() === assetName) {
        targetElement = (item.querySelector('.alist__link') as HTMLElement) || (item as HTMLElement)
        break
      }
    }

    // 3. Click if found
    if (targetElement) {
      console.log(`[PayoutMonitor] Target link found for ${assetName}. Executing forceClick...`)
      await forceClick(targetElement)
      
      // IMPORTANT: After clicking the asset, wait for it to process
      await this.wait(1000)
      
      // 4. Close the picker (The picker usually stays open after a React-invoked click)
      await this.closeAssetPicker()
      
      console.log(`[PayoutMonitor] ✅ Switch process finished for: ${assetName}`)
      return true
    }
    
    console.warn(`[PayoutMonitor] ❌ Asset not found in list: ${assetName}`)
    await this.closeAssetPicker()
    return false
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
    const startTime = Date.now();
    try {
      // 1. Try to get payouts from already visible list
      let payouts = this.scrapePayoutsFromDOM()
      
      // 2. If not enough, try opening the asset picker
      if (payouts.length < 5) {
        console.log('[PayoutMonitor] Payouts insufficient or empty. Checking if picker is actually visible...');
        
        await this.openAssetPicker()
        // Wait longer and multiple times for React rendering
        for (let i = 0; i < 3; i++) {
            await this.wait(500)
            payouts = this.scrapePayoutsFromDOM()
            if (payouts.length >= 5) break;
            console.log(`[PayoutMonitor] Waiting for assets to render... (${i+1}/3)`)
        }
        
        if (payouts.length < 5) {
          console.warn('[PayoutMonitor] Still no assets after opening picker. Closing.');
          await this.closeAssetPicker()
        }
      }

      // Update internal state
      if (payouts.length > 0) {
        const now = Date.now()
        payouts.forEach(p => {
          this.assets.set(p.name, { ...p, lastUpdated: now })
        })
        const highCount = this.getHighPayoutAssets().length;
        console.log(`[PayoutMonitor] Cycle Complete: Total=${payouts.length}, High=${highCount}, Time=${Date.now() - startTime}ms`);
      }

      this.notifyObservers()
    } catch (error) {
      console.error('[PayoutMonitor] Critical error:', error)
    }
  }

  /**
   * Scrape payouts from visible DOM
   */
  private scrapePayoutsFromDOM(): AssetPayout[] {
    const payouts: AssetPayout[] = []

    // Try asset list
    const assetItems = document.querySelectorAll(SELECTORS.assetItem)
    console.log(`[PayoutMonitor] Scraping ${assetItems.length} items from DOM...`);

    assetItems.forEach((item, index) => {
      const labelEl = item.querySelector(SELECTORS.assetLabel)
      const profitEl = item.querySelector(SELECTORS.assetProfit)

      if (labelEl && profitEl) {
        const name = labelEl.textContent?.trim() || ''
        // Use textContent or innerText to ensure we get the nested span value
        const profitText = profitEl.textContent?.trim() || ''
        const payout = this.parsePayoutPercent(profitText)

        if (index < 3) {
          console.log(`[PayoutMonitor] Sample Item ${index}: Name="${name}", RawText="${profitText}", Parsed=${payout}`);
        }

        if (name && payout > 0) {
          payouts.push({
            name,
            payout,
            isOTC: name.includes('OTC'),
            lastUpdated: Date.now(),
          })
        }
      } else if (index < 3) {
        console.warn(`[PayoutMonitor] Missing elements in item ${index}: Label=${!!labelEl}, Profit=${!!profitEl}`);
      }
    })

    return payouts
  }

  /**
   * Parse payout percentage from text like "+92%"
   */
  private parsePayoutPercent(text: string): number {
    if (!text) return 0;
    // Remove all non-numeric characters except the numbers
    const cleaned = text.replace(/[^0-9]/g, '');
    const payout = parseInt(cleaned, 10);
    return isNaN(payout) ? 0 : payout;
  }

  /**
   * Open asset picker dropdown
   */
  private async openAssetPicker(): Promise<void> {
    // Check if already open and visible in the viewport
    const list = document.querySelector(SELECTORS.assetList) as HTMLElement
    if (list) {
      const rect = list.getBoundingClientRect()
      const isVisible = rect.height > 0 && 
                        rect.width > 0 && 
                        window.getComputedStyle(list).display !== 'none' &&
                        rect.top >= 0 // Ensure it's not scrolled away or hidden
      
      if (isVisible) {
          console.log('[PayoutMonitor] Asset picker already open and visible')
          return
      }
    }

    console.log('[PayoutMonitor] Opening asset picker...')
    
    // Find the trigger element - Priority: .pair-number-wrap (has React onClick) -> .current-symbol
    const trigger = (document.querySelector('.pair-number-wrap') || 
                     document.querySelector(SELECTORS.pairTrigger)) as HTMLElement
    
    if (trigger) {
      await forceClick(trigger)
    } else {
        const fallback = document.querySelector('.pair') as HTMLElement
        if (fallback) await forceClick(fallback)
    }
  }

  /**
   * Close asset picker
   */
  private async closeAssetPicker(): Promise<void> {
    const list = document.querySelector(SELECTORS.assetList)
    if (!list || window.getComputedStyle(list).display === 'none' || list.getBoundingClientRect().height === 0) {
        return
    }

    console.log('[PayoutMonitor] Closing asset picker...')
    
    // 1. Try clicking overlay first
    const overlay = document.querySelector(SELECTORS.overlay) as HTMLElement
    if (overlay) {
        await forceClick(overlay)
        await this.wait(300)
    }

    // 2. If still open, click the trigger again (toggle)
    const listAfter = document.querySelector(SELECTORS.assetList)
    if (listAfter && listAfter.getBoundingClientRect().height > 0) {
      const trigger = (document.querySelector('.pair-number-wrap') || 
                       document.querySelector(SELECTORS.pairTrigger)) as HTMLElement
      if (trigger) {
        console.log('[PayoutMonitor] Overlay failed or not present, toggling trigger to close...')
        await forceClick(trigger)
      }
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
