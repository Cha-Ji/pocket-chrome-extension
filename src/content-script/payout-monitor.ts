import { forceClick } from '../lib/dom-utils'

export interface AssetPayout { name: string; payout: number; isOTC: boolean; lastUpdated: number; }
export interface PayoutFilter { minPayout: number; onlyOTC: boolean; }
const DEFAULT_FILTER: PayoutFilter = { minPayout: 92, onlyOTC: true, }
const SELECTORS = {
  assetList: '.assets-block__alist.alist',
  assetItem: '.alist__item',
  assetLabel: '.alist__label',
  assetProfit: '.alist__payout',
  pairTrigger: '.current-symbol',
  overlay: '.modal-overlay',
}

export class PayoutMonitor {
  private assets: Map<string, AssetPayout> = new Map()
  private filter: PayoutFilter
  private pollInterval: ReturnType<typeof setInterval> | null = null
  private observers: ((assets: AssetPayout[]) => void)[] = []
  private _isMonitoring = false

  constructor(filter: PayoutFilter = DEFAULT_FILTER) { this.filter = filter }
  get isMonitoring(): boolean { return this._isMonitoring }

  async start(pollIntervalMs = 30000): Promise<void> {
    if (this._isMonitoring) return
    console.log('[PO] [Monitor] Starting...')
    this._isMonitoring = true
    await this.fetchPayouts()
    this.pollInterval = setInterval(async () => { await this.fetchPayouts() }, pollIntervalMs)
  }

  stop(): void {
    if (this.pollInterval) { clearInterval(this.pollInterval); this.pollInterval = null; }
    this._isMonitoring = false
    console.log('[PO] [Monitor] Stopped')
  }

  subscribe(callback: (assets: AssetPayout[]) => void): () => void {
    this.observers.push(callback)
    return () => { this.observers = this.observers.filter(cb => cb !== callback) }
  }

  getAllAssets(): AssetPayout[] { return Array.from(this.assets.values()) }
  getHighPayoutAssets(): AssetPayout[] {
    return this.getAllAssets()
      .filter(a => a.payout >= this.filter.minPayout)
      .filter(a => !this.filter.onlyOTC || a.isOTC)
      .sort((a, b) => b.payout - a.payout)
  }

  getBestAsset(): AssetPayout | null {
    const highPayout = this.getHighPayoutAssets()
    return highPayout.length > 0 ? highPayout[0] : null
  }

  async switchAsset(assetName: string): Promise<boolean> {
    console.log(`[PO] [Monitor] 🔄 Switching to: ${assetName}`)
    await this.openAssetPicker()
    await this.wait(1000)
    let targetElement: HTMLElement | null = null
    const assetItems = document.querySelectorAll(SELECTORS.assetItem)
    const normalizedTarget = assetName.replace(/\s+/g, ' ').trim().toLowerCase();
    for (const item of assetItems) {
      const labelEl = item.querySelector(SELECTORS.assetLabel)
      const rawLabel = labelEl?.textContent || ''
      const normalizedLabel = rawLabel.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalizedLabel === normalizedTarget) {
        targetElement = (item.querySelector('.alist__link') as HTMLElement) || (item as HTMLElement)
        console.log(`[PO] [Monitor] 🎯 Found match: ${rawLabel.trim()}`)
        break
      }
    }
    if (targetElement) {
      await forceClick(targetElement)
      await this.wait(1000)
      await this.closeAssetPicker()
      console.log(`[PO] [Monitor] ✅ Switch finished: ${assetName}`)
      return true
    }
    console.warn(`[PO] [Monitor] ❌ Asset not found: ${assetName}`)
    await this.closeAssetPicker()
    return false
  }

  private async fetchPayouts(): Promise<void> {
    try {
      let payouts = this.scrapePayoutsFromDOM()
      if (payouts.length < 5) {
        console.log('[PO] [Monitor] Payouts empty, opening picker...');
        await this.openAssetPicker()
        for (let i = 0; i < 3; i++) {
            await this.wait(500); payouts = this.scrapePayoutsFromDOM();
            if (payouts.length >= 5) break;
        }
        if (payouts.length < 5) await this.closeAssetPicker()
      }
      if (payouts.length > 0) {
        const now = Date.now()
        payouts.forEach(p => { this.assets.set(p.name, { ...p, lastUpdated: now }) })
      }
      this.notifyObservers()
    } catch (error) { console.error('[PO] [Monitor] Error:', error) }
  }

  private scrapePayoutsFromDOM(): AssetPayout[] {
    const payouts: AssetPayout[] = []
    const assetItems = document.querySelectorAll(SELECTORS.assetItem)
    assetItems.forEach((item) => {
      const labelEl = item.querySelector(SELECTORS.assetLabel)
      const profitEl = item.querySelector(SELECTORS.assetProfit)
      if (labelEl && profitEl) {
        const name = (labelEl.textContent || (labelEl as HTMLElement).innerText || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
        const profitText = profitEl.textContent?.trim() || ''
        const payout = this.parsePayoutPercent(profitText)
        if (name && payout > 0) {
          payouts.push({ name, payout, isOTC: name.toUpperCase().includes('OTC'), lastUpdated: Date.now(), })
        }
      }
    })
    return payouts
  }

  private parsePayoutPercent(text: string): number {
    const cleaned = text.replace(/[^0-9]/g, '');
    const payout = parseInt(cleaned, 10);
    return isNaN(payout) ? 0 : payout;
  }

  private async openAssetPicker(): Promise<void> {
    const list = document.querySelector(SELECTORS.assetList) as HTMLElement
    if (list && list.getBoundingClientRect().height > 0) return
    console.log('[PO] [Monitor] Opening picker...')
    const trigger = (document.querySelector('.pair-number-wrap') || document.querySelector(SELECTORS.pairTrigger)) as HTMLElement
    if (trigger) await forceClick(trigger)
  }

  private async closeAssetPicker(): Promise<void> {
    const list = document.querySelector(SELECTORS.assetList)
    if (!list || list.getBoundingClientRect().height === 0) return
    console.log('[PO] [Monitor] Closing picker...')
    const overlay = document.querySelector(SELECTORS.overlay) as HTMLElement
    if (overlay) { await forceClick(overlay); await this.wait(300); }
    const listAfter = document.querySelector(SELECTORS.assetList)
    if (listAfter && listAfter.getBoundingClientRect().height > 0) {
      const trigger = (document.querySelector('.pair-number-wrap') || document.querySelector(SELECTORS.pairTrigger)) as HTMLElement
      if (trigger) await forceClick(trigger)
    }
  }

  private wait(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms)) }
  private notifyObservers(): void {
    const assets = this.getHighPayoutAssets()
    this.observers.forEach(cb => cb(assets))
    try {
        chrome.runtime.sendMessage({ type: 'PAYOUT_UPDATE', payload: { highPayoutAssets: assets, totalAssets: this.assets.size, } }).catch(() => {})
    } catch {}
  }
}

let payoutMonitorInstance: PayoutMonitor | null = null
export function getPayoutMonitor(): PayoutMonitor {
  if (!payoutMonitorInstance) payoutMonitorInstance = new PayoutMonitor()
  return payoutMonitorInstance
}
