// ============================================================
// Candle Collector - DOM에서 직접 캔들 데이터 수집
// ============================================================
// Pocket Option의 DOM에서 가격 데이터를 수집하고 캔들로 변환
// 외부 API 사용 불가 (Binance 가격과 Pocket Option 가격이 다름)
// ============================================================

import { CandleRepository } from '../lib/db'
import { normalizeSymbol, normalizeTimestampMs } from '../lib/utils/normalize'

export interface Candle {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export interface TickData {
  price: number
  timestamp: number
  ticker: string
}

interface CandleBuffer {
  open: number
  high: number
  low: number
  close: number
  startTime: number
  ticks: number
}

// DOM Selectors (Pocket Option 전용)
const SELECTORS = {
  // 가격 표시 영역
  currentPrice: '.chart-item .value, .chart-block__price .value',
  priceValue: '.chart-item .value__val, .chart-block__price .value__val',
  
  // 차트 영역
  chartCanvas: 'canvas.chart-area',
  chartContainer: '.chart-item, .chart-block',
  
  // 자산 정보
  assetName: '.chart-item .pair, .chart-block .pair',
  assetProfit: '.chart-item .profit, .chart-block .profit',
  
  // 거래 시간
  expirationTime: '.value--expiration .value__val',
  serverTime: '.server-time, .time-block',
}

export class CandleCollector {
  private candleInterval: number // ms
  private maxCandles: number
  private candles: Map<string, Candle[]> = new Map()
  private currentBuffer: Map<string, CandleBuffer> = new Map()
  private observer: MutationObserver | null = null
  private pricePollingInterval: ReturnType<typeof setInterval> | null = null
  private _isCollecting = false
  private listeners: ((ticker: string, candle: Candle) => void)[] = []
  private tickHistory: TickData[] = []
  private maxTickHistory = 10000
  private static readonly MAX_LISTENERS_WARNING = 10

  constructor(candleIntervalSeconds: number = 60, maxCandles: number = 500) {
    this.candleInterval = candleIntervalSeconds * 1000
    this.maxCandles = maxCandles
  }

  get isCollecting(): boolean {
    return this._isCollecting
  }

  // ============================================================
  // Public API
  // ============================================================

  /**
   * Start collecting candles from DOM
   */
  start(): void {
    if (this._isCollecting) return
    
    console.log('[PO] [CandleCollector] Starting candle collection...')
    this._isCollecting = true
    
    // 방법 1: MutationObserver로 가격 변화 감지
    this.setupPriceObserver()
    
    // 방법 2: 폴링 백업 (500ms마다)
    this.startPricePolling()
    
    console.log('[PO] [CandleCollector] Collection started')
  }

  /**
   * Stop collecting
   */
  stop(): void {
    if (!this._isCollecting) return
    
    console.log('[PO] [CandleCollector] Stopping candle collection...')
    
    this.observer?.disconnect()
    this.observer = null
    
    if (this.pricePollingInterval) {
      clearInterval(this.pricePollingInterval)
      this.pricePollingInterval = null
    }
    
    this._isCollecting = false
    console.log('[PO] [CandleCollector] Collection stopped')
  }

  /**
   * Get candles for a ticker
   */
  getCandles(ticker: string): Candle[] {
    return this.candles.get(ticker) || []
  }

  /**
   * Get all tickers with candles
   */
  getTickers(): string[] {
    return Array.from(this.candles.keys())
  }

  /**
   * Get tick history
   */
  getTickHistory(): TickData[] {
    return [...this.tickHistory]
  }

  /**
   * Get current price for ticker
   */
  getCurrentPrice(): { price: number; ticker: string } | null {
    const price = this.scrapePriceFromDOM()
    const ticker = this.scrapeTickerFromDOM()
    
    if (price && ticker) {
      return { price, ticker }
    }
    return null
  }

  /**
   * Subscribe to new candles
   * 중복 등록 방지 및 max listener 경고 포함
   */
  onCandle(callback: (ticker: string, candle: Candle) => void): () => void {
    // 중복 등록 방지: 같은 함수 참조가 이미 등록되어 있으면 기존 unsubscribe 반환
    if (this.listeners.includes(callback)) {
      console.warn('[CandleCollector] 이미 등록된 리스너입니다. 중복 등록을 건너뜁니다.')
      return () => {
        this.listeners = this.listeners.filter(l => l !== callback)
      }
    }

    this.listeners.push(callback)

    // max listener 경고
    if (this.listeners.length > CandleCollector.MAX_LISTENERS_WARNING) {
      console.warn(
        `[CandleCollector] 리스너가 ${this.listeners.length}개로 ${CandleCollector.MAX_LISTENERS_WARNING}개를 초과했습니다. ` +
        'unsubscribe 누락이 없는지 확인하세요.'
      )
    }

    return () => {
      this.listeners = this.listeners.filter(l => l !== callback)
    }
  }

  /**
   * Export candles to JSON for backup/analysis
   */
  exportCandles(ticker: string): string {
    const candles = this.getCandles(ticker)
    return JSON.stringify({
      ticker,
      interval: this.candleInterval / 1000,
      exportTime: Date.now(),
      count: candles.length,
      candles
    }, null, 2)
  }

  /**
   * Import candles from JSON backup
   */
  importCandles(json: string): number {
    try {
      const data = JSON.parse(json)
      if (data.ticker && Array.isArray(data.candles)) {
        const existing = this.candles.get(data.ticker) || []
        const merged = this.mergeCandles(existing, data.candles)
        this.candles.set(data.ticker, merged)
        console.log(`[CandleCollector] Imported ${data.candles.length} candles for ${data.ticker}`)
        return data.candles.length
      }
    } catch (e) {
      console.error('[CandleCollector] Import error:', e)
    }
    return 0
  }

  /**
   * Add tick data from WebSocket (external source)
   * WebSocket interceptor에서 가격 데이터를 받아 캔들 버퍼에 추가
   */
  addTickFromWebSocket(symbol: string, price: number, timestamp: number): void {
    const tick: TickData = {
      price,
      timestamp: normalizeTimestampMs(timestamp),
      ticker: normalizeSymbol(symbol)
    }
    
    // 틱 기록
    this.recordTick(tick)
    
    // 캔들 업데이트
    this.updateCandleBuffer(tick)
    
    // Background에 알림
    this.notifyBackground(tick)
  }

  // ============================================================
  // DOM Scraping
  // ============================================================

  /**
   * Scrape current price from DOM
   */
  private scrapePriceFromDOM(): number | null {
    // 시도 1: value__val 클래스
    let priceEl = document.querySelector(SELECTORS.priceValue)
    if (priceEl) {
      const price = this.parsePrice(priceEl.textContent || '')
      if (price) return price
    }
    
    // 시도 2: value 클래스
    priceEl = document.querySelector(SELECTORS.currentPrice)
    if (priceEl) {
      const price = this.parsePrice(priceEl.textContent || '')
      if (price) return price
    }
    
    // 시도 3: 차트 영역의 숫자 찾기
    const chartContainer = document.querySelector(SELECTORS.chartContainer)
    if (chartContainer) {
      // 차트 컨테이너 내의 모든 텍스트에서 가격 패턴 찾기
      const text = chartContainer.textContent || ''
      const priceMatch = text.match(/(\d+\.?\d*)/g)
      if (priceMatch && priceMatch.length > 0) {
        // 가장 큰 숫자를 가격으로 추정
        const prices = priceMatch.map(p => parseFloat(p)).filter(p => !isNaN(p))
        if (prices.length > 0) {
          return Math.max(...prices)
        }
      }
    }
    
    return null
  }

  /**
   * Scrape current ticker from DOM
   */
  private scrapeTickerFromDOM(): string {
    const assetEl = document.querySelector(SELECTORS.assetName)
    if (assetEl) {
      const name = assetEl.textContent?.trim() || ''
      // 공백 제거하고 정규화
      return name.replace(/\s+/g, '-').toUpperCase() || 'UNKNOWN'
    }
    return 'UNKNOWN'
  }

  /**
   * Parse price from text
   */
  private parsePrice(text: string): number | null {
    // 공백, 쉼표 제거
    const cleaned = text.replace(/[,\s]/g, '')
    // 숫자와 소수점만 추출
    const match = cleaned.match(/[\d.]+/)
    if (match) {
      const price = parseFloat(match[0])
      return isNaN(price) ? null : price
    }
    return null
  }

  // ============================================================
  // Price Observation
  // ============================================================

  /**
   * Setup MutationObserver for price changes
   */
  private setupPriceObserver(): void {
    const targets = [
      document.querySelector(SELECTORS.priceValue),
      document.querySelector(SELECTORS.currentPrice),
      document.querySelector(SELECTORS.chartContainer),
    ].filter(Boolean) as Element[]

    if (targets.length === 0) {
      console.warn('[CandleCollector] No price elements found. Using polling only.')
      return
    }

    this.observer = new MutationObserver((_mutations) => {
      // 가격 변화 감지 시 즉시 처리
      this.processPriceUpdate()
    })

    targets.forEach(target => {
      this.observer!.observe(target, {
        characterData: true,
        childList: true,
        subtree: true,
      })
    })

    console.log(`[CandleCollector] Observing ${targets.length} price elements`)
  }

  /**
   * Start price polling (backup method)
   */
  private startPricePolling(): void {
    this.pricePollingInterval = setInterval(() => {
      this.processPriceUpdate()
    }, 500) // 500ms마다 폴링
  }

  /**
   * Process price update
   */
  private processPriceUpdate(): void {
    const price = this.scrapePriceFromDOM()
    const ticker = this.scrapeTickerFromDOM()
    
    if (!price || ticker === 'UNKNOWN') return
    
    const tick: TickData = {
      price,
      timestamp: Date.now(),
      ticker
    }
    
    // 틱 기록
    this.recordTick(tick)
    
    // 캔들 업데이트
    this.updateCandleBuffer(tick)
    
    // Background에 알림
    this.notifyBackground(tick)
  }

  /**
   * Record tick to history
   */
  private recordTick(tick: TickData): void {
    this.tickHistory.push(tick)
    
    // 히스토리 크기 제한
    if (this.tickHistory.length > this.maxTickHistory) {
      this.tickHistory = this.tickHistory.slice(-this.maxTickHistory)
    }
  }

  /**
   * Update candle buffer with new tick
   */
  private updateCandleBuffer(tick: TickData): void {
    const { price, timestamp, ticker } = tick
    
    let buffer = this.currentBuffer.get(ticker)
    const candleStartTime = Math.floor(timestamp / this.candleInterval) * this.candleInterval
    
    // 새 캔들 시작
    if (!buffer || buffer.startTime !== candleStartTime) {
      // 이전 버퍼를 캔들로 확정
      if (buffer && buffer.ticks > 0) {
        this.finalizeCandle(ticker, buffer)
      }
      
      // 새 버퍼 시작
      buffer = {
        open: price,
        high: price,
        low: price,
        close: price,
        startTime: candleStartTime,
        ticks: 1
      }
      this.currentBuffer.set(ticker, buffer)
    } else {
      // 기존 버퍼 업데이트
      buffer.high = Math.max(buffer.high, price)
      buffer.low = Math.min(buffer.low, price)
      buffer.close = price
      buffer.ticks++
    }
  }

  /**
   * Finalize candle from buffer
   */
  private finalizeCandle(ticker: string, buffer: CandleBuffer): void {
    const candle: Candle = {
      timestamp: buffer.startTime,
      open: buffer.open,
      high: buffer.high,
      low: buffer.low,
      close: buffer.close,
      volume: buffer.ticks
    }
    
    // 캔들 저장
    let candles = this.candles.get(ticker) || []
    candles.push(candle)
    
    // 최대 크기 제한
    if (candles.length > this.maxCandles) {
      candles = candles.slice(-this.maxCandles)
    }
    
    this.candles.set(ticker, candles)
    
    // DB 저장 (비동기)
    CandleRepository.add({
      ticker,
      interval: this.candleInterval / 1000,
      timestamp: candle.timestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      createdAt: Date.now()
    }).catch(e => console.error('[CandleCollector] DB Save Error:', e))
    
    // 리스너 알림
    this.listeners.forEach(l => l(ticker, candle))
    
    console.log(`[CandleCollector] New candle: ${ticker} O:${candle.open.toFixed(2)} H:${candle.high.toFixed(2)} L:${candle.low.toFixed(2)} C:${candle.close.toFixed(2)}`)
  }

  /**
   * Merge candles (deduplication)
   */
  private mergeCandles(existing: Candle[], incoming: Candle[]): Candle[] {
    const map = new Map<number, Candle>()
    
    existing.forEach(c => map.set(c.timestamp, c))
    incoming.forEach(c => map.set(c.timestamp, c))
    
    const merged = Array.from(map.values())
    merged.sort((a, b) => a.timestamp - b.timestamp)
    
    return merged.slice(-this.maxCandles)
  }

  /**
   * Notify background script
   */
  private notifyBackground(tick: TickData): void {
    chrome.runtime.sendMessage({
      type: 'TICK_DATA',
      payload: tick
    }).catch(() => {
      // Background script may not be ready
    })
  }
}

// ============================================================
// Singleton Instance
// ============================================================

let collectorInstance: CandleCollector | null = null

export function getCandleCollector(): CandleCollector {
  if (!collectorInstance) {
    collectorInstance = new CandleCollector(60, 500) // 1분 캔들, 최대 500개
  }
  return collectorInstance
}
