/**
 * 가격 데이터 감시
 * MutationObserver를 사용한 DOM 기반 가격 캡처
 */

// DOM 셀렉터 (Pocket Option 구조에 맞게 조정 필요)
const SELECTORS = {
  priceElement: '.current-price, [data-testid="current-price"]',
  tickerElement: '.asset-name, [data-testid="asset-name"]',
  chartContainer: '.chart-container, [data-testid="chart"]',
} as const;

export interface PriceData {
  ticker: string;
  price: number;
  timestamp: number;
  serverTime?: number;
}

export class PriceObserver {
  private observer: MutationObserver | null = null;
  private currentPrice: PriceData | null = null;
  private callbacks: ((data: PriceData) => void)[] = [];

  start(): void {
    if (this.observer) {
      console.log('[PriceObserver] Already running');
      return;
    }

    // 가격 요소 찾기
    const priceElement = document.querySelector(SELECTORS.priceElement);
    if (!priceElement) {
      console.warn('[PriceObserver] Price element not found, retrying...');
      setTimeout(() => this.start(), 1000);
      return;
    }

    // MutationObserver 설정
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData' || mutation.type === 'childList') {
          this.handlePriceChange();
        }
      }
    });

    // 감시 시작
    this.observer.observe(priceElement, {
      characterData: true,
      childList: true,
      subtree: true,
    });

    // 초기 가격 캡처
    this.handlePriceChange();

    console.log('[PriceObserver] Started');
  }

  stop(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
      console.log('[PriceObserver] Stopped');
    }
  }

  getCurrentPrice(): PriceData | null {
    return this.currentPrice;
  }

  onPriceChange(callback: (data: PriceData) => void): void {
    this.callbacks.push(callback);
  }

  private handlePriceChange(): void {
    const priceElement = document.querySelector(SELECTORS.priceElement);
    const tickerElement = document.querySelector(SELECTORS.tickerElement);

    if (!priceElement) return;

    const priceText = priceElement.textContent?.trim() ?? '';
    const price = parseFloat(priceText.replace(/[^0-9.]/g, ''));

    if (isNaN(price)) return;

    const ticker = tickerElement?.textContent?.trim() ?? 'UNKNOWN';

    const data: PriceData = {
      ticker,
      price,
      timestamp: Date.now(),
    };

    this.currentPrice = data;

    // Background로 가격 업데이트 전송
    chrome.runtime.sendMessage({
      type: 'PRICE_UPDATE',
      data,
    });

    // 콜백 호출
    this.callbacks.forEach((cb) => cb(data));
  }
}
