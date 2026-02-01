/**
 * UI 컨트롤러
 * 버튼 클릭 시뮬레이션 및 티커 변경
 */

// DOM 셀렉터 (Pocket Option 구조에 맞게 조정 필요)
const SELECTORS = {
  callButton: '.call-btn, [data-testid="call-button"]',
  putButton: '.put-btn, [data-testid="put-button"]',
  tickerDropdown: '.asset-selector, [data-testid="asset-selector"]',
  tickerOption: (ticker: string) => `[data-asset="${ticker}"], [data-ticker="${ticker}"]`,
} as const;

export class UIController {
  /**
   * 거래 실행 (CALL/PUT)
   */
  async executeTrade(direction: 'call' | 'put'): Promise<boolean> {
    const selector = direction === 'call' ? SELECTORS.callButton : SELECTORS.putButton;
    const button = document.querySelector<HTMLElement>(selector);

    if (!button) {
      console.error(`[UIController] ${direction.toUpperCase()} button not found`);
      return false;
    }

    // 인간적인 딜레이 추가 (50-150ms)
    await this.humanDelay();

    // 클릭 시뮬레이션
    this.simulateClick(button);

    console.log(`[UIController] Executed ${direction.toUpperCase()} trade`);
    return true;
  }

  /**
   * 티커 변경
   */
  async changeTicker(ticker: string): Promise<boolean> {
    // 드롭다운 열기
    const dropdown = document.querySelector<HTMLElement>(SELECTORS.tickerDropdown);
    if (!dropdown) {
      console.error('[UIController] Ticker dropdown not found');
      return false;
    }

    await this.humanDelay();
    this.simulateClick(dropdown);

    // 티커 옵션 선택
    await this.humanDelay(200, 400);
    const option = document.querySelector<HTMLElement>(SELECTORS.tickerOption(ticker));

    if (!option) {
      console.error(`[UIController] Ticker option not found: ${ticker}`);
      return false;
    }

    this.simulateClick(option);

    console.log(`[UIController] Changed ticker to: ${ticker}`);
    return true;
  }

  /**
   * 인간적인 딜레이
   */
  private humanDelay(min = 50, max = 150): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * 클릭 시뮬레이션
   */
  private simulateClick(element: HTMLElement): void {
    // MouseEvent 생성 및 디스패치
    const mouseDown = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      view: window,
    });

    const mouseUp = new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      view: window,
    });

    const click = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
    });

    element.dispatchEvent(mouseDown);
    element.dispatchEvent(mouseUp);
    element.dispatchEvent(click);
  }
}
