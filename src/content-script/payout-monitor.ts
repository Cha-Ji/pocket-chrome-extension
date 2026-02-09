import { forceClick } from '../lib/dom-utils'
import { loggers } from '../lib/logger'
import { PO_PAYOUT_SELECTORS } from '../lib/platform/adapters/pocket-option/selectors'

const log = loggers.monitor

export interface AssetPayout { name: string; payout: number; isOTC: boolean; lastUpdated: number; }
export interface PayoutFilter { minPayout: number; onlyOTC: boolean; }
export interface UnavailableAsset { name: string; failedAt: number; retryCount: number; }
const DEFAULT_FILTER: PayoutFilter = { minPayout: 92, onlyOTC: true, }
const UNAVAILABLE_COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes cooldown for unavailable assets
const MAX_RETRY_COUNT = 3 // Max retries before cooldown

export class PayoutMonitor {
  private assets: Map<string, AssetPayout> = new Map()
  private unavailableAssets: Map<string, UnavailableAsset> = new Map()
  private filter: PayoutFilter
  private pollInterval: ReturnType<typeof setInterval> | null = null
  private observers: ((assets: AssetPayout[]) => void)[] = []
  private _isMonitoring = false
  private consecutiveErrors = 0
  private static readonly MAX_CONSECUTIVE_ERRORS = 3
  private static readonly RESTART_DELAY_MS = 5000
  private pollIntervalMs = 30000

  constructor(filter: PayoutFilter = DEFAULT_FILTER) { this.filter = filter }
  get isMonitoring(): boolean { return this._isMonitoring }

  async start(pollIntervalMs = 30000): Promise<void> {
    if (this._isMonitoring) return
    log.info('Starting...')
    this._isMonitoring = true
    this.pollIntervalMs = pollIntervalMs
    this.consecutiveErrors = 0
    await this.fetchPayouts()
    this.pollInterval = setInterval(async () => {
      try {
        await this.fetchPayouts()
        this.consecutiveErrors = 0
      } catch (error) {
        this.consecutiveErrors++
        log.error(`Interval error (${this.consecutiveErrors}/${PayoutMonitor.MAX_CONSECUTIVE_ERRORS}):`, error)
        if (this.consecutiveErrors >= PayoutMonitor.MAX_CONSECUTIVE_ERRORS) {
          log.warn('연속 에러 한도 초과, interval 중지 후 재시작 예약')
          this.stop()
          setTimeout(() => {
            log.info('자동 재시작 시도...')
            this.start(this.pollIntervalMs)
          }, PayoutMonitor.RESTART_DELAY_MS)
        }
      }
    }, pollIntervalMs)
  }

  stop(): void {
    if (this.pollInterval) { clearInterval(this.pollInterval); this.pollInterval = null; }
    this._isMonitoring = false
    log.info('Stopped')
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

  /** 자산이 unavailable 목록에 있는지 확인 (쿨다운 조건 무관) */
  isAssetUnavailable(assetName: string): boolean {
    return this.unavailableAssets.has(assetName)
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
    } else {
      this.unavailableAssets.set(assetName, { name: assetName, failedAt: Date.now(), retryCount: 1 })
    }
  }

  /** 차트 영역 내 .asset-inactive 요소를 찾는 헬퍼 */
  private findChartInactiveEl(): HTMLElement | null {
    const chart = document.querySelector('.chart-item') || document.querySelector('.chart-block')
    const el = chart
      ? chart.querySelector('.asset-inactive') as HTMLElement | null
      : document.querySelector('.chart-item .asset-inactive, .chart-block .asset-inactive') as HTMLElement | null
    if (!el || el.offsetParent === null) return null
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return null
    return el
  }

  /** 자산명 정규화 (NBSP, 공백 통합, 소문자) */
  private normalizeAssetName(name: string): string {
    return name.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
  }

  /** 현재 활성 자산이 target인지 확인 (.current-symbol + .pair-number-wrap 이중 체크) */
  private isCurrentAsset(normalizedTarget: string): boolean {
    const symbolEl = document.querySelector('.current-symbol')
    if (symbolEl && this.normalizeAssetName(symbolEl.textContent || '').includes(normalizedTarget)) {
      return true
    }
    const pairEl = document.querySelector('.pair-number-wrap')
    if (pairEl && this.normalizeAssetName(pairEl.textContent || '').includes(normalizedTarget)) {
      return true
    }
    return false
  }

  /** 피커 리스트 아이템이 inactive 상태인지 DOM에서 사전 감지 */
  private isItemInactive(item: Element): boolean {
    const el = item as HTMLElement
    const cls = (el.className || '').toLowerCase()

    // 클래스 기반: inactive, disabled, closed, locked, suspended
    if (/\b(inactive|disabled|closed|locked|suspended)\b/.test(cls)) return true

    // aria 속성 기반
    if (el.getAttribute('aria-disabled') === 'true') return true

    // 자식 요소에 inactive 지표가 있는 경우 (잠금 아이콘, 닫힘 배지 등)
    const inactiveChild = item.querySelector('.inactive, .disabled, .closed, .locked, [data-status="closed"]')
    if (inactiveChild) return true

    // 시각적 비활성화: opacity가 0.5 이하
    const opacity = parseFloat(getComputedStyle(el).opacity || '1')
    if (opacity <= 0.5) return true

    return false
  }

  /** DOM에서 자산 요소를 찾는다. 최대 maxAttempts회 재시도 (간격 retryDelayMs) */
  private async findAssetElement(normalizedTarget: string, maxAttempts = 3, retryDelayMs = 800): Promise<{ element: HTMLElement; rawLabel: string; inactive?: boolean } | null> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const assetItems = document.querySelectorAll(PO_PAYOUT_SELECTORS.assetItem)
      for (const item of assetItems) {
        const labelEl = item.querySelector(PO_PAYOUT_SELECTORS.assetLabel)
        const rawLabel = labelEl?.textContent || ''
        if (this.normalizeAssetName(rawLabel) === normalizedTarget) {
          // 클릭 전 inactive 사전 감지
          if (this.isItemInactive(item)) {
            log.warn(`⛔ ${rawLabel.trim()} — 피커 리스트에서 inactive 감지, 클릭 생략`)
            return { element: item as HTMLElement, rawLabel: rawLabel.trim(), inactive: true }
          }
          const clickTarget = (item.querySelector('.alist__link') as HTMLElement) || (item as HTMLElement)
          return { element: clickTarget, rawLabel: rawLabel.trim() }
        }
      }
      if (attempt < maxAttempts) {
        log.info(`Asset not found yet, retrying... (${attempt}/${maxAttempts})`)
        await this.wait(retryDelayMs)
      }
    }
    return null
  }

  async switchAsset(assetName: string): Promise<boolean> {
    log.info(`🔄 Switching to: ${assetName}`)
    const normalizedTarget = this.normalizeAssetName(assetName)

    // 이전 사이클에서 unavailable로 판정된 자산 → 피커 열지 않고 즉시 스킵
    if (this.isAssetUnavailable(assetName)) {
      log.warn(`⛔ ${assetName} already known unavailable, skipping without opening picker`)
      return false
    }

    // 쿨다운 중인지 확인
    if (this.isAssetInCooldown(assetName)) {
      log.warn(`⏳ Asset ${assetName} is in cooldown, skipping...`)
      return false
    }

    // 현재 이미 해당 자산인지 확인
    if (this.isCurrentAsset(normalizedTarget)) {
       log.info(`Already on ${assetName}`)
       return true
    }

    // 피커 열기 전 잔류 오버레이는 무시 — 자산 전환이 새 차트를 로드하므로 불필요
    await this.openAssetPicker()
    await this.wait(1500)

    // DOM 재시도 포함 자산 탐색
    const found = await this.findAssetElement(normalizedTarget)

    if (found) {
      // 피커 리스트에서 inactive 사전 감지 → 클릭 없이 즉시 unavailable 처리
      if (found.inactive) {
        this.markAssetUnavailable(assetName)
        await this.closeAssetPicker()
        return false
      }

      log.info(`🎯 Found match: ${found.rawLabel}`)
      await forceClick(found.element)

      // 폴링으로 전환 성공 여부 확인 (최대 5초, 500ms 간격)
      const isSwitched = await this.waitForCondition(
        () => this.isCurrentAsset(normalizedTarget),
        5000,
        500,
      )

      if (!isSwitched) {
         log.warn(`❌ Switch failed (UI did not update within 5s). target="${normalizedTarget}"`)
         // 기술적 전환 실패 — markAssetUnavailable 호출하지 않음
         // auto-miner가 기술적 실패와 실제 unavailable을 구분하도록 함
         await this.closeAssetPicker()
         return false
      }

      await this.closeAssetPicker()
      await this.wait(2000)

      // "다시 로드하려면 클릭" 오버레이가 있으면 클릭하여 차트 리로드 시도
      // 이것은 오류가 아니라 PO의 정상적인 차트 로딩 메커니즘
      const overlay = this.findChartInactiveEl()
      if (overlay) {
        log.info('🔄 차트 inactive 오버레이 감지, 클릭하여 리로드 요청...')
        await forceClick(overlay)
        // 리로드 완료 대기 (최대 5초)
        await this.waitForCondition(
          () => !this.findChartInactiveEl(),
          5000,
          500,
        )
      }

      // 오버레이 존재 여부와 관계없이 전환 성공으로 처리
      // WS 응답 타임아웃(auto-miner.ts)이 실제 데이터 가용성을 판단
      log.info(`✅ Switch finished: ${assetName}`)
      return true
    }

    log.warn(`❌ Asset not found in list: ${assetName}`)
    await this.closeAssetPicker()
    return false
  }

  /** 피커를 열어서라도 페이아웃을 가져온다 (Miner 등 외부 호출용) */
  async fetchPayoutsForce(): Promise<void> {
    let payouts = this.scrapePayoutsFromDOM()
    if (payouts.length < 5) {
      log.info('Force fetch: opening picker to scrape payouts...')
      await this.openAssetPicker()
      for (let i = 0; i < 3; i++) {
        await this.wait(500)
        payouts = this.scrapePayoutsFromDOM()
        if (payouts.length >= 5) break
      }
      await this.closeAssetPicker()
    }
    if (payouts.length > 0) {
      const now = Date.now()
      payouts.forEach(p => { this.assets.set(p.name, { ...p, lastUpdated: now }) })
    }
    this.notifyObservers()
  }

  private async fetchPayouts(): Promise<void> {
    try {
      let payouts = this.scrapePayoutsFromDOM()
      if (payouts.length === 0) {
        // 페이아웃 데이터가 전혀 없으면 피커를 열지 않고 대기
        log.debug('Payouts empty, waiting for data...')
      } else if (payouts.length < 5) {
        log.info(`Payouts partial (${payouts.length}), opening picker to fetch more...`);
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
    } catch (error) { log.error('Error:', error) }
  }

  private scrapePayoutsFromDOM(): AssetPayout[] {
    const payouts: AssetPayout[] = []
    const assetItems = document.querySelectorAll(PO_PAYOUT_SELECTORS.assetItem)
    assetItems.forEach((item) => {
      const labelEl = item.querySelector(PO_PAYOUT_SELECTORS.assetLabel)
      const profitEl = item.querySelector(PO_PAYOUT_SELECTORS.assetProfit)
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
    const list = document.querySelector(PO_PAYOUT_SELECTORS.assetList) as HTMLElement
    if (list && list.getBoundingClientRect().height > 0) return
    log.info('Opening picker...')
    const trigger = (document.querySelector('.pair-number-wrap') || document.querySelector(PO_PAYOUT_SELECTORS.pairTrigger)) as HTMLElement
    if (trigger) await forceClick(trigger)
  }

  private async closeAssetPicker(): Promise<void> {
    const list = document.querySelector(PO_PAYOUT_SELECTORS.assetList)
    if (!list || list.getBoundingClientRect().height === 0) return
    log.info('Closing picker...')

    // [PO-17] ESC 키 시뮬레이션 추가
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await this.wait(200);

    const overlay = document.querySelector(PO_PAYOUT_SELECTORS.overlay) as HTMLElement
    if (overlay) { await forceClick(overlay); await this.wait(300); }
    
    // 여전히 열려있다면 다시 시도
    const listAfter = document.querySelector(PO_PAYOUT_SELECTORS.assetList)
    if (listAfter && listAfter.getBoundingClientRect().height > 0) {
      const trigger = (document.querySelector('.pair-number-wrap') || document.querySelector(PO_PAYOUT_SELECTORS.pairTrigger)) as HTMLElement
      if (trigger) await forceClick(trigger)
    }
  }

  private wait(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms)) }

  /** 조건이 true가 될 때까지 폴링. 타임아웃 시 false 반환 */
  private async waitForCondition(
    predicate: () => boolean, timeoutMs: number, intervalMs = 500
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (predicate()) return true
      await this.wait(intervalMs)
    }
    return predicate() // 마지막 한 번 더 확인
  }
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
