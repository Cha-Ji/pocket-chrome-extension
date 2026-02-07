/**
 * 메시지 핸들러 설정
 * Content Script 및 Side Panel과의 통신
 */

import type { TradingStateManager } from './state';

export type MessageType =
  | { type: 'GET_STATE' }
  | { type: 'START_TRADING'; tabId: number }
  | { type: 'PAUSE_TRADING' }
  | { type: 'STOP_TRADING' }
  | { type: 'PRICE_UPDATE'; data: { ticker: string; price: number; timestamp: number } }
  | { type: 'TRADE_RESULT'; data: { win: boolean } };

export function setupMessageHandlers(stateManager: TradingStateManager): void {
  chrome.runtime.onMessage.addListener((message: MessageType, _sender, sendResponse) => {
    switch (message.type) {
      case 'GET_STATE':
        sendResponse({ success: true, data: stateManager.getSession() });
        break;

      case 'START_TRADING':
        const started = stateManager.start(message.tabId);
        sendResponse({ success: started });
        break;

      case 'PAUSE_TRADING':
        const paused = stateManager.pause();
        sendResponse({ success: paused });
        break;

      case 'STOP_TRADING':
        stateManager.stop();
        sendResponse({ success: true });
        break;

      case 'PRICE_UPDATE':
        // 가격 업데이트 처리 (DB 저장 등)
        console.log('[Message] Price update:', message.data);
        sendResponse({ success: true });
        break;

      case 'TRADE_RESULT':
        stateManager.recordTrade(message.data.win);
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }

    return true; // 비동기 응답을 위해 true 반환
  });
}
