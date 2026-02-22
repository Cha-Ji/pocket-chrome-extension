// ============================================================
// Data Collector - Captures price data from DOM
// ============================================================
// NOTE: Actual DOM selectors need to be discovered after login
// Current implementation uses stubs that will be replaced
// ============================================================

import { DOMSelectors, Tick } from '../lib/types';
import { getSelectorResolver, SelectorResolver } from './selector-resolver';

export class DataCollector {
  private resolver: SelectorResolver;
  private observer: MutationObserver | null = null;
  private _isCollecting = false;
  private currentPrice: number | null = null;
  private priceHistory: Tick[] = [];
  private maxHistorySize = 5000;

  constructor(_selectors: DOMSelectors) {
    // SelectorResolver가 환경별 셀렉터를 자동 관리하므로 직접 사용하지 않음
    this.resolver = getSelectorResolver();
  }

  get isCollecting(): boolean {
    return this._isCollecting;
  }

  /**
   * Start collecting price data
   * TODO: Implement actual DOM observation after login
   */
  start(): void {
    if (this._isCollecting) return;

    console.log('[PO] [DataCollector] Starting data collection...');
    this._isCollecting = true;

    // TODO: Replace with actual MutationObserver setup
    // This is a stub that demonstrates the interface
    this.setupPriceObserver();
  }

  /**
   * Stop collecting price data
   */
  stop(): void {
    if (!this._isCollecting) return;

    console.log('[PO] [DataCollector] Stopping data collection...');
    this.observer?.disconnect();
    this.observer = null;
    this._isCollecting = false;
  }

  /**
   * Get current price
   */
  getCurrentPrice(): number | null {
    return this.currentPrice;
  }

  /**
   * Get price history
   */
  getPriceHistory(): Tick[] {
    return [...this.priceHistory];
  }

  /**
   * Get recent prices as array
   */
  getRecentPrices(count: number): number[] {
    return this.priceHistory.slice(-count).map((tick) => tick.price);
  }

  // ============================================================
  // STUB: DOM Observation Setup
  // These methods need actual implementation after login
  // ============================================================

  /**
   * Setup MutationObserver for price changes
   * STUB: Actual selectors and logic TBD
   */
  private async setupPriceObserver(): Promise<void> {
    const priceElement = await this.resolver.resolve('priceDisplay');

    if (!priceElement) {
      console.warn('[DataCollector] Price element not found (even with fallbacks). Selectors may need updating.');
      return;
    }

    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData' || mutation.type === 'childList') {
          this.handlePriceUpdate(priceElement);
        }
      }
    });

    this.observer.observe(priceElement, {
      characterData: true,
      childList: true,
      subtree: true,
    });

    // Initial price capture
    this.handlePriceUpdate(priceElement);
  }

  /**
   * Handle price update from DOM
   * STUB: Actual parsing logic TBD
   */
  private handlePriceUpdate(element: Element): void {
    const priceText = element.textContent?.trim();
    if (!priceText) return;

    const price = this.parsePrice(priceText);
    if (price === null) return;

    this.currentPrice = price;
    this.recordTick(price).catch(() => {
      // ticker resolve 실패 시 무시 — price는 이미 기록됨
    });
  }

  /**
   * Parse price from text
   * STUB: Actual format TBD based on site's price display
   */
  private parsePrice(text: string): number | null {
    // Remove currency symbols, commas, etc.
    const cleaned = text.replace(/[^0-9.]/g, '');
    const price = parseFloat(cleaned);
    return isNaN(price) ? null : price;
  }

  /**
   * Record a tick to history
   */
  private async recordTick(price: number): Promise<void> {
    const tick: Tick = {
      ticker: await this.getCurrentTicker(),
      timestamp: Date.now(),
      price,
    };

    this.priceHistory.push(tick);

    // Trim history if too large
    if (this.priceHistory.length > this.maxHistorySize) {
      this.priceHistory = this.priceHistory.slice(-this.maxHistorySize);
    }

    // Notify background script
    this.notifyPriceUpdate(tick);
  }

  /**
   * Get current ticker symbol
   * STUB: Actual implementation TBD
   */
  private async getCurrentTicker(): Promise<string> {
    const tickerElement = await this.resolver.resolve('tickerSelector');
    return tickerElement?.textContent?.trim() || 'UNKNOWN';
  }

  /**
   * Notify background script of price update
   */
  private notifyPriceUpdate(tick: Tick): void {
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
