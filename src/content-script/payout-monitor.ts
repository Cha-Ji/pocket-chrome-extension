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
    const normalizedTarget = assetName.replace(/\s+/g, ' ').trim().toLowerCase();
    
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
         console.warn(`[PO] [Monitor] ❌ Switch failed (UI didn't update).`);
         await this.closeAssetPicker();
         return false;
      }

      await this.closeAssetPicker()
      await this.wait(1000)

      // 이용 불가능 여부 최종 확인
      const errorMsg = document.querySelector('.asset-inactive');
      if (errorMsg && errorMsg.textContent?.includes('불가능') && (errorMsg as HTMLElement).offsetParent !== null) {
         console.warn(`[PO] [Monitor] ⚠️ Asset ${assetName} is confirmed unavailable.`);
         return false;
      }

      console.log(`[PO] [Monitor] ✅ Switch finished: ${assetName}`)
      return true
    }

    console.warn(`[PO] [Monitor] ❌ Asset not found in list: ${assetName}`)
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
