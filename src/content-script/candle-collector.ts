// ============================================================
// Candle Collector - DOM에서 직접 캔들 데이터 수집
// ============================================================
// Pocket Option의 DOM에서 가격 데이터를 수집하고 캔들로 변환
// 외부 API 사용 불가 (Binance 가격과 Pocket Option 가격이 다름)
// ============================================================

import { CandleRepository } from '../lib/db';
import { normalizeSymbol, normalizeTimestampMs } from '../lib/utils/normalize';

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface TickData {
  price: number;
  timestamp: number;
  ticker: string;
}

interface CandleBuffer {
  open: number;
  high: number;
  low: number;
  close: number;
  startTime: number;
  ticks: number;
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
};

/** Configuration for adaptive observer/polling behavior */
interface AdaptivePollingConfig {
  /** Throttle interval for processPriceUpdate to prevent duplicate ticks (ms) */
  throttleMs: number;
  /** If observer has no update for this long, polling activates as fallback (ms) */
  observerTimeoutMs: number;
  /** Polling interval when observer is inactive (fallback mode) (ms) */
  pollingFallbackMs: number;
  /** Polling interval when observer is active (health-check only) (ms) */
  pollingIdleMs: number;
}

const DEFAULT_ADAPTIVE_CONFIG: AdaptivePollingConfig = {
  throttleMs: 200,
  observerTimeoutMs: 3000,
  pollingFallbackMs: 500,
  pollingIdleMs: 5000,
};

export class CandleCollector {
  private candleInterval: number; // ms
  private maxCandles: number;
  private candles: Map<string, Candle[]> = new Map();
  private currentBuffer: Map<string, CandleBuffer> = new Map();
  private observer: MutationObserver | null = null;
  private pricePollingInterval: ReturnType<typeof setTimeout> | null = null;
  private _isCollecting = false;
  private listeners: ((ticker: string, candle: Candle) => void)[] = [];
  private tickHistory: TickData[] = [];
  /** Ticker-keyed tick buffer for O(1) lookup by ticker */
  private ticksByTicker: Map<string, TickData[]> = new Map();
  private maxTickHistory = 10000;
  private maxTicksPerTicker = 2000;
  private static readonly MAX_LISTENERS_WARNING = 10;

  /** Adaptive observer/polling state */
  private adaptiveConfig: AdaptivePollingConfig;
  private _observerAttached = false;
  private _lastObserverUpdateAt = 0;
  private _lastProcessedAt = 0;
  private _pollingMode: 'idle' | 'fallback' = 'idle';

  /** Observability counters */
  private _collectorStats = {
    observerUpdates: 0,
    pollingUpdates: 0,
    throttledSkips: 0,
    pollingModeChanges: 0,
  };

  constructor(
    candleIntervalSeconds: number = 60,
    maxCandles: number = 500,
    adaptiveConfig?: Partial<AdaptivePollingConfig>,
  ) {
    this.candleInterval = candleIntervalSeconds * 1000;
    this.maxCandles = maxCandles;
    this.adaptiveConfig = { ...DEFAULT_ADAPTIVE_CONFIG, ...adaptiveConfig };
  }

  get isCollecting(): boolean {
    return this._isCollecting;
  }

  // ============================================================
  // Public API
  // ============================================================

  /**
   * Start collecting candles from DOM.
   *
   * Adaptive strategy:
   *  - Tries MutationObserver first (primary source, low CPU).
   *  - Polling runs at a slow "idle" rate when observer is healthy.
   *  - If observer has no updates for `observerTimeoutMs`, polling switches
   *    to "fallback" mode with faster interval.
   *  - `processPriceUpdate()` is throttled to prevent duplicate ticks
   *    from simultaneous observer + polling invocations.
   */
  start(): void {
    if (this._isCollecting) return;

    console.log('[PO] [CandleCollector] Starting candle collection...');
    this._isCollecting = true;

    // Primary: MutationObserver for price changes
    this.setupPriceObserver();

    // Secondary: adaptive polling (idle check when observer works, fallback when it doesn't)
    this.startAdaptivePolling();

    console.log('[PO] [CandleCollector] Collection started');
  }

  /**
   * Stop collecting
   */
  stop(): void {
    if (!this._isCollecting) return;

    console.log('[PO] [CandleCollector] Stopping candle collection...');

    this.observer?.disconnect();
    this.observer = null;
    this._observerAttached = false;

    if (this.pricePollingInterval) {
      clearTimeout(this.pricePollingInterval);
      this.pricePollingInterval = null;
    }

    this._isCollecting = false;
    console.log('[PO] [CandleCollector] Collection stopped');
  }

  /**
   * Get candles for a ticker
   */
  getCandles(ticker: string): Candle[] {
    return this.candles.get(ticker) || [];
  }

  /**
   * Get all tickers with candles
   */
  getTickers(): string[] {
    return Array.from(this.candles.keys());
  }

  /**
   * Get tick history
   */
  getTickHistory(): TickData[] {
    return [...this.tickHistory];
  }

  /**
   * Get latest tick price for a specific ticker.
   * Uses the ticker-indexed map for O(1) lookup.
   * Used for trade settlement (exit price at expiry).
   */
  getLatestTickPrice(ticker: string): number | null {
    const ticks = this.ticksByTicker.get(ticker);
    if (ticks && ticks.length > 0) return ticks[ticks.length - 1].price;
    return null;
  }

  /**
   * Get ticks for a specific ticker, optionally filtered to recent N milliseconds.
   * O(1) lookup via ticker-indexed map. Avoids full-array filter.
   */
  getTicksByTicker(ticker: string, sinceMs?: number): TickData[] {
    const ticks = this.ticksByTicker.get(ticker);
    if (!ticks) return [];
    if (sinceMs == null) return [...ticks];
    const cutoff = Date.now() - sinceMs;
    // Binary-ish scan from end (ticks are in chronological order)
    let start = ticks.length;
    for (let i = ticks.length - 1; i >= 0; i--) {
      if (ticks[i].timestamp < cutoff) break;
      start = i;
    }
    return ticks.slice(start);
  }

  /**
   * Get current price for ticker
   */
  getCurrentPrice(): { price: number; ticker: string } | null {
    const price = this.scrapePriceFromDOM();
    const ticker = this.scrapeTickerFromDOM();

    if (price && ticker) {
      return { price, ticker };
    }
    return null;
  }

  /**
   * Subscribe to new candles
   * 중복 등록 방지 및 max listener 경고 포함
   */
  onCandle(callback: (ticker: string, candle: Candle) => void): () => void {
    // 중복 등록 방지: 같은 함수 참조가 이미 등록되어 있으면 기존 unsubscribe 반환
    if (this.listeners.includes(callback)) {
      console.warn('[CandleCollector] 이미 등록된 리스너입니다. 중복 등록을 건너뜁니다.');
      return () => {
        this.listeners = this.listeners.filter((l) => l !== callback);
      };
    }

    this.listeners.push(callback);

    // max listener 경고
    if (this.listeners.length > CandleCollector.MAX_LISTENERS_WARNING) {
      console.warn(
        `[CandleCollector] 리스너가 ${this.listeners.length}개로 ${CandleCollector.MAX_LISTENERS_WARNING}개를 초과했습니다. ` +
          'unsubscribe 누락이 없는지 확인하세요.',
      );
    }

    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  /**
   * Export candles to JSON for backup/analysis
   */
  exportCandles(ticker: string): string {
    const candles = this.getCandles(ticker);
    return JSON.stringify(
      {
        ticker,
        interval: this.candleInterval / 1000,
        exportTime: Date.now(),
        count: candles.length,
        candles,
      },
      null,
      2,
    );
  }

  /**
   * Import candles from JSON backup
   */
  importCandles(json: string): number {
    try {
      const data = JSON.parse(json);
      if (data.ticker && Array.isArray(data.candles)) {
        const existing = this.candles.get(data.ticker) || [];
        const merged = this.mergeCandles(existing, data.candles);
        this.candles.set(data.ticker, merged);
        console.log(`[CandleCollector] Imported ${data.candles.length} candles for ${data.ticker}`);
        return data.candles.length;
      }
    } catch (e) {
      console.error('[CandleCollector] Import error:', e);
    }
    return 0;
  }

  /**
   * Add tick data from WebSocket (external source)
   * WebSocket interceptor에서 가격 데이터를 받아 캔들 버퍼에 추가
   */
  addTickFromWebSocket(symbol: string, price: number, timestamp: number): void {
    const tick: TickData = {
      price,
      timestamp: normalizeTimestampMs(timestamp),
      ticker: normalizeSymbol(symbol),
    };

    // 틱 기록
    this.recordTick(tick);

    // 캔들 업데이트
    this.updateCandleBuffer(tick);

    // Background에 알림
    this.notifyBackground(tick);
  }

  // ============================================================
  // DOM Scraping
  // ============================================================

  /**
   * Scrape current price from DOM
   */
  private scrapePriceFromDOM(): number | null {
    // 시도 1: value__val 클래스
    let priceEl = document.querySelector(SELECTORS.priceValue);
    if (priceEl) {
      const price = this.parsePrice(priceEl.textContent || '');
      if (price) return price;
    }

    // 시도 2: value 클래스
    priceEl = document.querySelector(SELECTORS.currentPrice);
    if (priceEl) {
      const price = this.parsePrice(priceEl.textContent || '');
      if (price) return price;
    }

    // 시도 3: 차트 영역의 숫자 찾기
    const chartContainer = document.querySelector(SELECTORS.chartContainer);
    if (chartContainer) {
      // 차트 컨테이너 내의 모든 텍스트에서 가격 패턴 찾기
      const text = chartContainer.textContent || '';
      const priceMatch = text.match(/(\d+\.?\d*)/g);
      if (priceMatch && priceMatch.length > 0) {
        // 가장 큰 숫자를 가격으로 추정
        const prices = priceMatch.map((p) => parseFloat(p)).filter((p) => !isNaN(p));
        if (prices.length > 0) {
          return Math.max(...prices);
        }
      }
    }

    return null;
  }

  /**
   * Scrape current ticker from DOM
   * P2: normalizeSymbol()을 사용하여 WS/DOM/History 간 키 일치 보장
   */
  private scrapeTickerFromDOM(): string {
    const assetEl = document.querySelector(SELECTORS.assetName);
    if (assetEl) {
      const name = assetEl.textContent?.trim() || '';
      return name ? normalizeSymbol(name) : 'UNKNOWN';
    }
    return 'UNKNOWN';
  }

  /**
   * Parse price from text
   */
  private parsePrice(text: string): number | null {
    // 공백, 쉼표 제거
    const cleaned = text.replace(/[,\s]/g, '');
    // 숫자와 소수점만 추출
    const match = cleaned.match(/[\d.]+/);
    if (match) {
      const price = parseFloat(match[0]);
      return isNaN(price) ? null : price;
    }
    return null;
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
    ].filter(Boolean) as Element[];

    if (targets.length === 0) {
      console.warn('[CandleCollector] No price elements found. Using polling only.');
      this._observerAttached = false;
      return;
    }

    this.observer = new MutationObserver((_mutations) => {
      this._lastObserverUpdateAt = Date.now();
      this._collectorStats.observerUpdates++;
      this.processPriceUpdate('observer');
    });

    targets.forEach((target) => {
      this.observer!.observe(target, {
        characterData: true,
        childList: true,
        subtree: true,
      });
    });

    this._observerAttached = true;
    this._lastObserverUpdateAt = Date.now();
    console.log(`[CandleCollector] Observing ${targets.length} price elements`);
  }

  /**
   * Start adaptive polling.
   *
   * - When observer is active and recently updated: poll at slow `pollingIdleMs` rate
   *   (acts as a health-check / heartbeat).
   * - When observer is inactive or timed out: poll at fast `pollingFallbackMs` rate
   *   (fallback data source).
   */
  private startAdaptivePolling(): void {
    const scheduleNext = () => {
      if (!this._isCollecting) return;

      const now = Date.now();
      const observerHealthy =
        this._observerAttached &&
        now - this._lastObserverUpdateAt < this.adaptiveConfig.observerTimeoutMs;

      const newMode = observerHealthy ? 'idle' : 'fallback';
      if (newMode !== this._pollingMode) {
        this._pollingMode = newMode;
        this._collectorStats.pollingModeChanges++;
        console.log(
          `[CandleCollector] Polling mode → ${newMode}` +
            (newMode === 'fallback' ? ' (observer timeout)' : ' (observer healthy)'),
        );
      }

      const interval =
        this._pollingMode === 'fallback'
          ? this.adaptiveConfig.pollingFallbackMs
          : this.adaptiveConfig.pollingIdleMs;

      this.pricePollingInterval = setTimeout(() => {
        this._collectorStats.pollingUpdates++;
        this.processPriceUpdate('polling');
        scheduleNext();
      }, interval);
    };

    scheduleNext();
  }

  /**
   * Process price update with throttle to prevent duplicate ticks
   * from simultaneous observer + polling invocations.
   */
  private processPriceUpdate(source: 'observer' | 'polling'): void {
    const now = Date.now();

    // Throttle: skip if last processed tick is too recent
    if (now - this._lastProcessedAt < this.adaptiveConfig.throttleMs) {
      this._collectorStats.throttledSkips++;
      return;
    }

    const price = this.scrapePriceFromDOM();
    const ticker = this.scrapeTickerFromDOM();

    if (!price || ticker === 'UNKNOWN') return;

    this._lastProcessedAt = now;

    // If observer fires, mark it alive (even if price didn't change)
    if (source === 'observer') {
      this._lastObserverUpdateAt = now;
    }

    const tick: TickData = {
      price,
      timestamp: now,
      ticker,
    };

    // 틱 기록
    this.recordTick(tick);

    // 캔들 업데이트
    this.updateCandleBuffer(tick);

    // Background에 알림
    this.notifyBackground(tick);
  }

  /**
   * Record tick to history
   */
  private recordTick(tick: TickData): void {
    this.tickHistory.push(tick);

    // 히스토리 크기 제한
    if (this.tickHistory.length > this.maxTickHistory) {
      this.tickHistory = this.tickHistory.slice(-this.maxTickHistory);
    }

    // Ticker-indexed buffer
    let tickerBuf = this.ticksByTicker.get(tick.ticker);
    if (!tickerBuf) {
      tickerBuf = [];
      this.ticksByTicker.set(tick.ticker, tickerBuf);
    }
    tickerBuf.push(tick);
    if (tickerBuf.length > this.maxTicksPerTicker) {
      this.ticksByTicker.set(tick.ticker, tickerBuf.slice(-this.maxTicksPerTicker));
    }
  }

  /**
   * Update candle buffer with new tick
   */
  private updateCandleBuffer(tick: TickData): void {
    const { price, timestamp, ticker } = tick;

    let buffer = this.currentBuffer.get(ticker);
    const candleStartTime = Math.floor(timestamp / this.candleInterval) * this.candleInterval;

    // 새 캔들 시작
    if (!buffer || buffer.startTime !== candleStartTime) {
      // 이전 버퍼를 캔들로 확정
      if (buffer && buffer.ticks > 0) {
        this.finalizeCandle(ticker, buffer);
      }

      // 새 버퍼 시작
      buffer = {
        open: price,
        high: price,
        low: price,
        close: price,
        startTime: candleStartTime,
        ticks: 1,
      };
      this.currentBuffer.set(ticker, buffer);
    } else {
      // 기존 버퍼 업데이트
      buffer.high = Math.max(buffer.high, price);
      buffer.low = Math.min(buffer.low, price);
      buffer.close = price;
      buffer.ticks++;
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
      volume: buffer.ticks,
    };

    // 캔들 저장
    let candles = this.candles.get(ticker) || [];
    candles.push(candle);

    // 최대 크기 제한
    if (candles.length > this.maxCandles) {
      candles = candles.slice(-this.maxCandles);
    }

    this.candles.set(ticker, candles);

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
    }).catch((e) => console.error('[CandleCollector] DB Save Error:', e));

    // 리스너 알림
    this.listeners.forEach((l) => l(ticker, candle));

    console.log(
      `[CandleCollector] New candle: ${ticker} O:${candle.open.toFixed(2)} H:${candle.high.toFixed(2)} L:${candle.low.toFixed(2)} C:${candle.close.toFixed(2)}`,
    );
  }

  /**
   * Merge candles (deduplication)
   */
  private mergeCandles(existing: Candle[], incoming: Candle[]): Candle[] {
    const map = new Map<number, Candle>();

    existing.forEach((c) => map.set(c.timestamp, c));
    incoming.forEach((c) => map.set(c.timestamp, c));

    const merged = Array.from(map.values());
    merged.sort((a, b) => a.timestamp - b.timestamp);

    return merged.slice(-this.maxCandles);
  }

  /**
   * Get collector observability stats
   */
  getCollectorStats() {
    return {
      observerAttached: this._observerAttached,
      pollingMode: this._pollingMode,
      lastObserverUpdateAt: this._lastObserverUpdateAt,
      ...this._collectorStats,
    };
  }

  /**
   * Notify background script
   */
  private notifyBackground(tick: TickData): void {
    chrome.runtime
      .sendMessage({
        type: 'TICK_DATA',
        payload: tick,
      })
      .catch(() => {
        // Background script may not be ready
      });
  }
}

// ============================================================
// Singleton Instance
// ============================================================

let collectorInstance: CandleCollector | null = null;

export function getCandleCollector(): CandleCollector {
  if (!collectorInstance) {
    collectorInstance = new CandleCollector(60, 500); // 1분 캔들, 최대 500개
  }
  return collectorInstance;
}
