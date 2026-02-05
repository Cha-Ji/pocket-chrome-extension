import { forceClick } from '../lib/dom-utils'
import { loggers } from '../lib/logger'

const log = loggers.monitor

export interface AssetPayout { name: string; payout: number; isOTC: boolean; lastUpdated: number; }
export interface PayoutFilter { minPayout: number; onlyOTC: boolean; }
export interface UnavailableAsset { name: string; failedAt: number; retryCount: number; }
const DEFAULT_FILTER: PayoutFilter = { minPayout: 92, onlyOTC: true, }
const UNAVAILABLE_COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes cooldown for unavailable assets
const MAX_RETRY_COUNT = 3 // Max retries before cooldown
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
  private unavailableAssets: Map<string, UnavailableAsset> = new Map()
  private filter: PayoutFilter
  private pollInterval: ReturnType<typeof setInterval> | null = null
  private observers: ((assets: AssetPayout[]) => void)[] = []
  private _isMonitoring = false

  constructor(filter: PayoutFilter = DEFAULT_FILTER) { this.filter = filter }
  get isMonitoring(): boolean { return this._isMonitoring }

  async start(pollIntervalMs = 30000): Promise<void> {
    if (this._isMonitoring) return
    log.info(' Starting...')
    this._isMonitoring = true
    await this.fetchPayouts()
    this.pollInterval = setInterval(async () => { await this.fetchPayouts() }, pollIntervalMs)
  }

  stop(): void {
    if (this.pollInterval) { clearInterval(this.pollInterval); this.pollInterval = null; }
    this._isMonitoring = false
    log.info(' Stopped')
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

  /** Check if an asset is in cooldown after repeated failures */
  isAssetInCooldown(assetName: string): boolean {
    const entry = this.unavailableAssets.get(assetName)
    if (!entry) return false
    const now = Date.now()
    if (entry.retryCount >= MAX_RETRY_COUNT && (now - entry.failedAt) < UNAVAILABLE_COOLDOWN_MS) {
      return true
    }
    if ((now - entry.failedAt) >= UNAVAILABLE_COOLDOWN_MS) {
      this.unavailableAssets.delete(assetName)
      return false
    }
    return false
  }

  /** Get available assets (excluding those in cooldown) */
  getAvailableAssets(): AssetPayout[] {
    return this.getHighPayoutAssets().filter(a => !this.isAssetInCooldown(a.name))
  }

  /** Mark an asset as unavailable (increments retry count) */
  private markAssetUnavailable(assetName: string): void {
    const existing = this.unavailableAssets.get(assetName)
    if (existing) {
      existing.retryCount++
      existing.failedAt = Date.now()
      log.warn(` Asset ${assetName} failed again (retry ${existing.retryCount}/${MAX_RETRY_COUNT})`)
    } else {
      this.unavailableAssets.set(assetName, { name: assetName, failedAt: Date.now(), retryCount: 1 })
      log.warn(` Asset ${assetName} marked as unavailable (retry 1/${MAX_RETRY_COUNT})`)
    }
  }

  /** Enhanced detection of unavailable assets */
  private detectAssetUnavailable(): boolean {
    // Pattern 1: '.asset-inactive' with Korean text
    const inactiveEl = document.querySelector('.asset-inactive')
    if (inactiveEl && (inactiveEl as HTMLElement).offsetParent !== null) {
      const text = inactiveEl.textContent || ''
      if (text.includes('불가능') || text.includes('unavailable') || text.toLowerCase().includes('not available')) {
        return true
      }
    }
    // Pattern 2: Modal or notification with unavailable message
    const modals = document.querySelectorAll('.modal, .notification, .alert, .toast')
    for (const modal of modals) {
      const text = (modal.textContent || '').toLowerCase()
      if (text.includes('not available') || text.includes('unavailable') || text.includes('이용 불가')) {
        return true
      }
    }
    // Pattern 3: Check if chart area shows loading/error state
    const chartError = document.querySelector('.chart-error, .chart-loading-error')
    if (chartError && (chartError as HTMLElement).offsetParent !== null) {
      return true
    }
    return false
  }

  async switchAsset(assetName: string): Promise<boolean> {
    console.log(`[PO] [Monitor] 🔄 Switching to: ${assetName}`)
    const normalizedTarget = assetName.replace(/\s+/g, ' ').trim().toLowerCase();

    // Check if asset is in cooldown
    if (this.isAssetInCooldown(assetName)) {
      log.warn(` ⏳ Asset ${assetName} is in cooldown, skipping...`)
      return false
    }

    // 현재 이미 해당 자산인지 확인
    const currentEl = document.querySelector('.current-symbol');
    if (currentEl && currentEl.textContent?.toLowerCase().includes(normalizedTarget)) {
       console.log(`[PO] [Monitor] Already on ${assetName}`);
       return true;
    }

    await this.openAssetPicker()
    await this.wait(1500)

    let targetElement: HTMLElement | null = null
    const assetItems = document.querySelectorAll(SELECTORS.assetItem)
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
      await this.wait(2000) // 전환 대기 시간 증가
      
      // 전환 성공 여부 확인
      const afterEl = document.querySelector('.current-symbol');
      const isSwitched = afterEl?.textContent?.toLowerCase().includes(normalizedTarget);
      
      if (!isSwitched) {
         log.warn(` ❌ Switch failed (UI didn't update).`);
         this.markAssetUnavailable(assetName);
         await this.closeAssetPicker();
         return false;
      }

      await this.closeAssetPicker()
      await this.wait(1000)

      // Enhanced unavailable asset detection
      if (this.detectAssetUnavailable()) {
         log.warn(` ⚠️ Asset ${assetName} is confirmed unavailable.`);
         this.markAssetUnavailable(assetName);
         return false;
      }

      console.log(`[PO] [Monitor] ✅ Switch finished: ${assetName}`)
      return true
    }

    log.warn(` ❌ Asset not found in list: ${assetName}`)
    this.markAssetUnavailable(assetName);
    await this.closeAssetPicker()
    return false
  }

  private async fetchPayouts(): Promise<void> {
    try {
      let payouts = this.scrapePayoutsFromDOM()
      if (payouts.length < 5) {
        log.info(' Payouts empty, opening picker...');
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
    } catch (error) { log.error(' Error:', error) }
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
    log.info(' Opening picker...')
    const trigger = (document.querySelector('.pair-number-wrap') || document.querySelector(SELECTORS.pairTrigger)) as HTMLElement
    if (trigger) await forceClick(trigger)
  }

  private async closeAssetPicker(): Promise<void> {
    const list = document.querySelector(SELECTORS.assetList)
    if (!list || list.getBoundingClientRect().height === 0) return
    log.info(' Closing picker...')

    // [PO-17] ESC 키 시뮬레이션 추가
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await this.wait(200);

    const overlay = document.querySelector(SELECTORS.overlay) as HTMLElement
    if (overlay) { await forceClick(overlay); await this.wait(300); }
    
    // 여전히 열려있다면 다시 시도
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
