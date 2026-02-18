// ============================================================
// bootstrap.ts — Initialization, selector loading, element waiting
// ============================================================

import { DOMSelectors, DEFAULT_SELECTORS } from '../../lib/types';
import { DataCollector } from '../data-collector';
import { TradeExecutor } from '../executor';
import { getCandleCollector } from '../candle-collector';
import { getPayoutMonitor } from '../payout-monitor';
import { getIndicatorReader } from '../indicator-reader';
import { getSignalGeneratorV2 } from '../../lib/signals/signal-generator-v2';
import { getTelegramService, resetTelegramService } from '../../lib/notifications/telegram';
import { getWebSocketInterceptor } from '../websocket-interceptor';
import { AutoMiner } from '../auto-miner';
import { ContentScriptContext } from './context';
import { setupAllHandlers } from './ws-handlers';
import { getSystemStatus } from './message-handler';
import {
  AccountVerifier,
  DomDecoder,
  WsDecoder,
  LoggerAlertChannel,
} from '../../lib/safety/account-verifier';
import { createLogger } from '../../lib/logger';

const safetyLog = createLogger('Safety');

export async function initialize(ctx: ContentScriptContext): Promise<void> {
  if (ctx.isInitialized) return;
  try {
    console.log('[PO] [1] Starting initialization...');
    await waitForElement('body');
    console.log('[PO] [2] Body element available');
    if (typeof chrome === 'undefined' || !chrome.storage) {
      throw new Error('Chrome API not available');
    }
    const selectors = await loadSelectors();
    console.log('[PO] [3] Selectors loaded');

    ctx.dataCollector = new DataCollector(selectors);
    ctx.tradeExecutor = new TradeExecutor(selectors);
    ctx.candleCollector = getCandleCollector();
    ctx.payoutMonitor = getPayoutMonitor();
    ctx.indicatorReader = getIndicatorReader();
    ctx.signalGenerator = getSignalGeneratorV2({
      symbols: ['CURRENT'],
      minConfidence: 0.3,
      expirySeconds: 60,
    });
    try {
      ctx.telegramService = await getTelegramService();
    } catch {
      console.warn('[PO] Telegram service unavailable, continuing without it');
      ctx.telegramService = null;
    }
    ctx.wsInterceptor = getWebSocketInterceptor();

    // Account Verifier (#52): decoder chain + periodic re-verification
    const alertChannel = new LoggerAlertChannel();
    alertChannel.setBroadcast((level, message) => {
      try {
        const lastResult = ctx.accountVerifier?.getLastResult();
        chrome.runtime.sendMessage({
          type: 'ACCOUNT_VERIFY_ALERT',
          payload: {
            level,
            message,
            accountType: lastResult?.type ?? 'UNKNOWN',
            source: lastResult?.source ?? 'fallback',
          },
        }).catch(() => {});
      } catch { /* extension context may be lost */ }
    });

    ctx.accountVerifier = new AccountVerifier({
      decoders: [new DomDecoder(), new WsDecoder()],
      alertChannel,
      reverifyIntervalMs: 30_000,
      isTradingArmed: () => ctx.tradingConfig.enabled,
      onHalt: (reason) => {
        safetyLog.error(`Trading halted: ${reason}`);
        ctx.tradingConfig.enabled = false;
      },
    });

    console.log('[PO] [4] Modules initialized');

    setupAllHandlers(ctx);
    console.log('[PO] [5] Handlers attached');

    ctx.dataCollector.start();
    ctx.candleCollector.start();
    ctx.payoutMonitor.start(30000);
    ctx.indicatorReader.start();
    ctx.wsInterceptor.start();
    ctx.accountVerifier?.start();
    console.log('[PO] [6] Background monitors started');

    AutoMiner.init(ctx.payoutMonitor);

    ctx.isInitialized = true;
    console.log('[PO] [SUCCESS] Initialized successfully');
    console.log('[PO] Build Version: 2026-02-04 19:20 (PO-16 Fix)');
    logSystemStatus(ctx);
  } catch (error) {
    console.error('[PO] [FATAL] Initialization failed:', error);
  }
}

export async function loadSelectors(): Promise<DOMSelectors> {
  try {
    const result = await chrome.storage.local.get('domSelectors');
    return result.domSelectors || DEFAULT_SELECTORS;
  } catch {
    return DEFAULT_SELECTORS;
  }
}

export function waitForElement(selector: string, timeout = 10000): Promise<Element | null> {
  return new Promise((resolve) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }
    const observer = new MutationObserver((_, obs) => {
      const el = document.querySelector(selector);
      if (el) {
        obs.disconnect();
        resolve(el);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

function logSystemStatus(ctx: ContentScriptContext): void {
  const status = getSystemStatus(ctx);
  console.log('[PO] System Status:', JSON.stringify(status, null, 2));
}

// Auto-reset Telegram service on storage changes
export function setupTelegramStorageListener(ctx: ContentScriptContext): void {
  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.appConfig) {
        const oldTelegram = changes.appConfig.oldValue?.telegram;
        const newTelegram = changes.appConfig.newValue?.telegram;
        if (JSON.stringify(oldTelegram) !== JSON.stringify(newTelegram)) {
          console.log('[PO] Telegram config changed in storage — resetting service');
          resetTelegramService();
          getTelegramService()
            .then((svc) => {
              ctx.telegramService = svc;
            })
            .catch(() => {});
        }
      }
      if (areaName === 'session' && changes.telegramSecure) {
        console.log('[PO] Telegram secure data changed — resetting service');
        resetTelegramService();
        getTelegramService()
          .then((svc) => {
            ctx.telegramService = svc;
          })
          .catch(() => {});
      }
    });
  } catch {
    /* Extension context may be lost */
  }
}
