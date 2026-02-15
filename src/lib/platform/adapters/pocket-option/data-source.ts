// ============================================================
// Pocket Option Data Source - IDataSource 구현
// ============================================================
// 기존 DataCollector, CandleCollector, PayoutMonitor를 래핑하여
// 플랫폼 독립적인 IDataSource 인터페이스로 노출한다.
// ============================================================

import type { Tick } from '../../../types';
import type { IDataSource, Asset, Candle, Timeframe, Unsubscribe } from '../../interfaces';
import { PO_PRICE_SELECTORS, PO_PAYOUT_SELECTORS, PO_SELECTOR_FALLBACKS } from './selectors';

export class PocketOptionDataSource implements IDataSource {
  private tickCallbacks: ((tick: Tick) => void)[] = [];
  private candleCallbacks: ((ticker: string, candle: Candle) => void)[] = [];
  private observer: MutationObserver | null = null;
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private _isRunning = false;
  private assets: Map<string, Asset> = new Map();

  // 캔들 버퍼
  private candleIntervalMs = 60_000; // 1분 기본값
  private candleBuffer: Map<
    string,
    { open: number; high: number; low: number; close: number; startTime: number; ticks: number }
  > = new Map();

  get isRunning(): boolean {
    return this._isRunning;
  }

  subscribeTicks(callback: (tick: Tick) => void): Unsubscribe {
    this.tickCallbacks.push(callback);
    return () => {
      this.tickCallbacks = this.tickCallbacks.filter((cb) => cb !== callback);
    };
  }

  subscribeCandles(
    timeframe: Timeframe,
    callback: (ticker: string, candle: Candle) => void,
  ): Unsubscribe {
    this.candleIntervalMs = timeframe * 1000;
    this.candleCallbacks.push(callback);
    return () => {
      this.candleCallbacks = this.candleCallbacks.filter((cb) => cb !== callback);
    };
  }

  getCurrentPrice(): { price: number; ticker: string } | null {
    const price = this.scrapePriceFromDOM();
    const ticker = this.scrapeTickerFromDOM();
    if (price !== null && ticker !== 'UNKNOWN') {
      return { price, ticker };
    }
    return null;
  }

  getCurrentAsset(): Asset | null {
    const ticker = this.scrapeTickerFromDOM();
    if (ticker === 'UNKNOWN') return null;
    return (
      this.assets.get(ticker) ?? {
        id: ticker,
        name: ticker,
        isOTC: ticker.toUpperCase().includes('OTC'),
        payout: null,
      }
    );
  }

  getAvailableAssets(): Asset[] {
    return Array.from(this.assets.values());
  }

  getPayout(assetName: string): number | null {
    return this.assets.get(assetName)?.payout ?? null;
  }

  start(): void {
    if (this._isRunning) return;
    this._isRunning = true;
    this.setupPriceObserver();
    this.startPolling();
  }

  stop(): void {
    if (!this._isRunning) return;
    this.observer?.disconnect();
    this.observer = null;
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this._isRunning = false;
  }

  // ============================================================
  // 페이아웃 스크래핑 (PayoutMonitor 로직 래핑)
  // ============================================================

  /** 페이아웃 정보 새로고침 */
  refreshPayouts(): void {
    const items = document.querySelectorAll(PO_PAYOUT_SELECTORS.assetItem);
    items.forEach((item) => {
      const labelEl = item.querySelector(PO_PAYOUT_SELECTORS.assetLabel);
      const profitEl = item.querySelector(PO_PAYOUT_SELECTORS.assetProfit);
      if (!labelEl || !profitEl) return;

      const name = (labelEl.textContent || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const profitText = profitEl.textContent?.trim() || '';
      const payout = parseInt(profitText.replace(/[^0-9]/g, ''), 10);

      if (name && !isNaN(payout) && payout > 0) {
        this.assets.set(name, {
          id: name,
          name,
          isOTC: name.toUpperCase().includes('OTC'),
          payout,
        });
      }
    });
  }

  // ============================================================
  // Private: DOM 가격 추출
  // ============================================================

  private scrapePriceFromDOM(): number | null {
    // fallback 체인으로 가격 요소 찾기
    const selectors = PO_SELECTOR_FALLBACKS.priceDisplay ?? [
      PO_PRICE_SELECTORS.priceValue,
      PO_PRICE_SELECTORS.currentPrice,
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const price = this.parsePrice(el.textContent || '');
        if (price !== null) return price;
      }
    }
    return null;
  }

  private scrapeTickerFromDOM(): string {
    const el = document.querySelector(PO_PRICE_SELECTORS.assetName);
    const name = el?.textContent?.trim() || '';
    return name || 'UNKNOWN';
  }

  private parsePrice(text: string): number | null {
    const cleaned = text.replace(/[,\s]/g, '');
    const match = cleaned.match(/[\d.]+/);
    if (match) {
      const price = parseFloat(match[0]);
      return isNaN(price) ? null : price;
    }
    return null;
  }

  // ============================================================
  // Private: 관찰자 설정
  // ============================================================

  private setupPriceObserver(): void {
    const targets = [
      document.querySelector(PO_PRICE_SELECTORS.priceValue),
      document.querySelector(PO_PRICE_SELECTORS.currentPrice),
    ].filter(Boolean) as Element[];

    if (targets.length === 0) return;

    this.observer = new MutationObserver(() => {
      this.processPriceUpdate();
    });

    targets.forEach((target) => {
      this.observer!.observe(target, {
        characterData: true,
        childList: true,
        subtree: true,
      });
    });
  }

  private startPolling(): void {
    this.pollingInterval = setInterval(() => {
      this.processPriceUpdate();
    }, 500);
  }

  private processPriceUpdate(): void {
    const price = this.scrapePriceFromDOM();
    const ticker = this.scrapeTickerFromDOM();
    if (price === null || ticker === 'UNKNOWN') return;

    const tick: Tick = { ticker, timestamp: Date.now(), price };
    this.tickCallbacks.forEach((cb) => cb(tick));
    this.updateCandleBuffer(ticker, price, tick.timestamp);
  }

  private updateCandleBuffer(ticker: string, price: number, timestamp: number): void {
    const candleStart = Math.floor(timestamp / this.candleIntervalMs) * this.candleIntervalMs;
    let buffer = this.candleBuffer.get(ticker);

    if (!buffer || buffer.startTime !== candleStart) {
      // 이전 캔들 확정
      if (buffer && buffer.ticks > 0) {
        const candle: Candle = {
          timestamp: buffer.startTime,
          open: buffer.open,
          high: buffer.high,
          low: buffer.low,
          close: buffer.close,
          volume: buffer.ticks,
        };
        this.candleCallbacks.forEach((cb) => cb(ticker, candle));
      }
      buffer = {
        open: price,
        high: price,
        low: price,
        close: price,
        startTime: candleStart,
        ticks: 1,
      };
      this.candleBuffer.set(ticker, buffer);
    } else {
      buffer.high = Math.max(buffer.high, price);
      buffer.low = Math.min(buffer.low, price);
      buffer.close = price;
      buffer.ticks++;
    }
  }
}
