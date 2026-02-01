/**
 * Content Script
 * DOM 감시로 실시간 가격/차트 캡처 및 UI 시뮬레이션
 */

import { PriceObserver } from './observers/price';
import { UIController } from './ui/controller';

// 가격 감시자 초기화
const priceObserver = new PriceObserver();

// UI 컨트롤러 초기화
const uiController = new UIController();

// 메시지 수신 핸들러
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'EXECUTE_TRADE':
      const { direction } = message.data as { direction: 'call' | 'put' };
      uiController.executeTrade(direction);
      sendResponse({ success: true });
      break;

    case 'CHANGE_TICKER':
      const { ticker } = message.data as { ticker: string };
      uiController.changeTicker(ticker);
      sendResponse({ success: true });
      break;

    case 'GET_CURRENT_PRICE':
      sendResponse({ success: true, data: priceObserver.getCurrentPrice() });
      break;

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }

  return true;
});

// 페이지 로드 완료 후 감시 시작
function init(): void {
  console.log('[Content] Initializing on Pocket Option...');

  // DOM이 준비되면 가격 감시 시작
  priceObserver.start();

  // Background에 준비 완료 알림
  chrome.runtime.sendMessage({ type: 'CONTENT_READY' });
}

// 페이지 로드 상태에 따라 초기화
if (document.readyState === 'complete') {
  init();
} else {
  window.addEventListener('load', init);
}
