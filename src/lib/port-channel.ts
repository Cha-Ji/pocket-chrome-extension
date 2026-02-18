/**
 * Port-based communication channel for side panel ↔ background.
 *
 * Replaces polling-based state sync with event-driven push.
 * The background service worker relays content-script messages to
 * connected side panel ports, reducing unnecessary setInterval polls.
 *
 * Handles MV3 service worker sleep/wake:
 *   - Port disconnects when worker sleeps
 *   - Side panel auto-reconnects with exponential backoff
 */

/** Port channel name used by chrome.runtime.connect() */
export const PORT_CHANNEL = 'side-panel' as const;

/**
 * Message types that background relays from content script to side panels.
 * Only these types are forwarded via port — everything else is ignored.
 */
export const RELAY_MESSAGE_TYPES: Set<string> = new Set([
  'STATUS_UPDATE',
  'NEW_SIGNAL_V2',
  'TRADE_EXECUTED',
  'TRADE_LOGGED',
  'TRADE_SETTLED',
  'PAYOUT_UPDATE',
  'BEST_ASSET',
  'MINING_STATS',
  'MINING_STOPPED',
  'MINER_STATUS_PUSH',
  'INDICATOR_UPDATE',
  // P0-4: Register WS relay types to prevent MSG_INVALID_TYPE errors
  'WS_PRICE_UPDATE',
  'WS_MESSAGE',
  'WS_CONNECTION',
  // P2 review fix: Relay account verification alerts to side panel UI
  'ACCOUNT_VERIFY_ALERT',
  // Selector healthcheck results relayed to side panel
  'SELECTOR_HEALTHCHECK_RESULT',
]);

/**
 * High-frequency message types that get throttled before relaying.
 * Value = minimum interval (ms) between consecutive relays of the same type.
 */
export const THROTTLE_CONFIG: Record<string, number> = {
  INDICATOR_UPDATE: 2000,
  MINER_STATUS_PUSH: 1000,
  // P0-4: Throttle high-frequency WS price updates (every tick)
  WS_PRICE_UPDATE: 500,
};
