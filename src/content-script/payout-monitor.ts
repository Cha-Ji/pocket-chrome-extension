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

  /** .asset-inactive 리로드 시도 — "다시 로드하려면 클릭" 메시지가 있으면 클릭 후 복구 대기 */
  private async tryReloadInactive(): Promise<boolean> {
    const MAX_RELOAD_ATTEMPTS = 3
    const POLL_INTERVAL_MS = 1000
    const POLL_MAX_WAIT_MS = 8000 // 클릭 후 최대 8초간 폴링

    for (let attempt = 1; attempt <= MAX_RELOAD_ATTEMPTS; attempt++) {
      const inactiveEl = this.findChartInactiveEl()
      if (!inactiveEl) {
        log.info('✅ asset-inactive 해소됨')
        return true
      }

      log.info(`🔄 asset-inactive 리로드 시도 ${attempt}/${MAX_RELOAD_ATTEMPTS}...`)
      await forceClick(inactiveEl)

      // 폴링으로 오버레이 소멸 대기 (고정 대기 대신)
      const resolved = await this.waitForCondition(
        () => !this.findChartInactiveEl(),
        POLL_MAX_WAIT_MS,
        POLL_INTERVAL_MS,
      )
      if (resolved) {
        log.info('✅ asset-inactive 리로드 성공')
        return true
      }
    }

    log.warn('🔍 리로드 시도 모두 실패, asset-inactive 유지')
    return false
  }

  /** 자산 전환 전 잔류 .asset-inactive 오버레이 사전 제거 */
  private async dismissStaleInactive(): Promise<void> {
    const inactiveEl = this.findChartInactiveEl()
    if (inactiveEl) {
      log.info('🧹 잔류 asset-inactive 오버레이 제거 시도...')
      await forceClick(inactiveEl)
      await this.wait(1500)
    }
  }

  /** Enhanced detection of unavailable assets */
  private detectAssetUnavailable(): boolean {
    // Pattern 1: '.asset-inactive' with Korean text
    // 차트 영역 내의 .asset-inactive만 감지 (피커 리스트 내 요소 제외)
    const chartContainer = document.querySelector('.chart-item') || document.querySelector('.chart-block')
    const inactiveEl = chartContainer
      ? chartContainer.querySelector('.asset-inactive')
      : document.querySelector('.chart-item .asset-inactive, .chart-block .asset-inactive')
    if (inactiveEl && (inactiveEl as HTMLElement).offsetParent !== null) {
      const htmlEl = inactiveEl as HTMLElement
      const rect = htmlEl.getBoundingClientRect()
      // 추가 가시성 체크: 크기가 0이면 실제로 보이지 않는 요소
      if (rect.width === 0 && rect.height === 0) {
        log.debug('🔍 .asset-inactive 발견했으나 크기 0 → 무시')
        // 크기 0이면 보이지 않으므로 스킵
      } else {
        const text = inactiveEl.textContent || ''
        if (text.includes('불가능') || text.includes('unavailable') || text.toLowerCase().includes('not available')) {
          log.warn(`🔍 Unavailable detected: Pattern 1 (.asset-inactive), text: "${text.substring(0, 80)}", rect: ${Math.round(rect.width)}x${Math.round(rect.height)}, parent: ${htmlEl.parentElement?.className?.substring(0, 40)}`)
          return true
        }
      }
    }
    // Pattern 2: 모달/알림 검사 — 가시성 체크(offsetParent) 추가로 숨겨진 모달 오탐 방지
    const modals = document.querySelectorAll('.modal, .notification, .alert, .toast')
    for (const modal of modals) {
      if ((modal as HTMLElement).offsetParent === null) continue
      const text = (modal.textContent || '').toLowerCase()
      if (text.includes('not available') || text.includes('unavailable') || text.includes('이용 불가')) {
        log.warn(`🔍 Unavailable detected: Pattern 2 (${modal.className}), text: "${text.substring(0, 80)}"`)
        return true
      }
    }
    // Pattern 3: Check if chart area shows loading/error state
    const chartError = document.querySelector('.chart-error, .chart-loading-error')
    if (chartError && (chartError as HTMLElement).offsetParent !== null) {
      log.warn('🔍 Unavailable detected: Pattern 3 (.chart-error/.chart-loading-error)')
      return true
    }
    return false
  }

  /** 자산명 정규화 (NBSP, 공백 통합, 소문자) */
  private normalizeAssetName(name: string): string {
    return name.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
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
    const currentEl = document.querySelector('.current-symbol')
    if (currentEl && this.normalizeAssetName(currentEl.textContent || '').includes(normalizedTarget)) {
       log.info(`Already on ${assetName}`)
       return true
    }

    // 이전 자산의 잔류 .asset-inactive 오버레이 사전 제거
    await this.dismissStaleInactive()

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
      await this.wait(2000)

      // 전환 성공 여부 확인
      const afterEl = document.querySelector('.current-symbol')
      const isSwitched = afterEl && this.normalizeAssetName(afterEl.textContent || '').includes(normalizedTarget)

      if (!isSwitched) {
         log.warn('❌ Switch failed (UI did not update).')
         this.markAssetUnavailable(assetName)
         await this.closeAssetPicker()
         return false
      }

      await this.closeAssetPicker()

      // 차트 로딩 대기: .asset-inactive가 자연 소멸할 때까지 폴링 (최대 15초)
      // 자산 전환 직후 일시적으로 unavailable 오버레이가 나타날 수 있으므로
      // 클릭 없이 passive하게 대기하여 차트 로딩을 방해하지 않음
      const chartReady = await this.waitForCondition(
        () => !this.detectAssetUnavailable(),
        15000,  // 최대 15초 대기
        1000,   // 1초 간격 폴링
      )

      if (!chartReady) {
        log.warn(`⚠️ 차트 로딩 15초 타임아웃, .asset-inactive 여전히 표시됨`)
        // 타임아웃 후에만 적극적 리로드 시도
        const recovered = await this.tryReloadInactive()
        if (!recovered || this.detectAssetUnavailable()) {
          this.markAssetUnavailable(assetName)
          return false
        }
      }

      log.info(`✅ Switch finished: ${assetName}`)
      return true
    }

    log.warn(`❌ Asset not found in list: ${assetName}`)
    this.markAssetUnavailable(assetName)
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
