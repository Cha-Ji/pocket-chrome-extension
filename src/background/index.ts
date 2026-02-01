/**
 * Background Service Worker
 * 자동 매매 루프 및 탭 상태 관리
 */

import { TradingState, TradingStateManager } from './state';
import { setupMessageHandlers } from './messages';

// 거래 상태 관리자 초기화
const stateManager = new TradingStateManager();

// 메시지 핸들러 설정
setupMessageHandlers(stateManager);

// Side Panel 열기 (액션 버튼 클릭 시)
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

// 탭 상태 변화 감지
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('pocketoption.com')) {
    stateManager.onTabReady(tabId);
  }
});

// 탭 닫힘 감지
chrome.tabs.onRemoved.addListener((tabId) => {
  stateManager.onTabClosed(tabId);
});

console.log('[Background] Service worker initialized');
