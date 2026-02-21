// ============================================================
// message-handler.ts — chrome.runtime.onMessage dispatch
// ============================================================

import { ExtensionMessage, TradingConfigV2 } from '../../lib/types';
import { generateLLMReport } from '../../lib/signals/signal-generator-v2';
import { AutoMiner } from '../auto-miner';
import { DataSender } from '../../lib/data-sender';
import { ContentScriptContext } from './context';
import { TRADE_EXECUTION_LOCK } from '../../lib/trading/execution-lock';

// ============================================================
// P1-3: Config validation
// ============================================================

interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  sanitized: Partial<TradingConfigV2>;
}

export function validateConfigUpdate(update: Partial<TradingConfigV2>): ConfigValidationResult {
  const errors: string[] = [];
  const sanitized = { ...update };

  if (sanitized.enabled !== undefined) {
    if (typeof sanitized.enabled !== 'boolean') {
      errors.push(`enabled must be boolean (got ${typeof sanitized.enabled})`);
      delete sanitized.enabled;
    } else if (TRADE_EXECUTION_LOCK.locked && sanitized.enabled) {
      errors.push('enabled=true is blocked by trade execution safety lock');
      delete sanitized.enabled;
    }
  }

  if (sanitized.tradeAmount !== undefined) {
    if (typeof sanitized.tradeAmount !== 'number' || sanitized.tradeAmount <= 0) {
      errors.push(`tradeAmount must be > 0 (got ${sanitized.tradeAmount})`);
      delete sanitized.tradeAmount;
    } else if (sanitized.tradeAmount > 10000) {
      errors.push(`tradeAmount too high: ${sanitized.tradeAmount} (max 10000)`);
      delete sanitized.tradeAmount;
    }
  }

  if (sanitized.minPayout !== undefined) {
    if (
      typeof sanitized.minPayout !== 'number' ||
      sanitized.minPayout < 0 ||
      sanitized.minPayout > 100
    ) {
      errors.push(`minPayout must be 0-100 (got ${sanitized.minPayout})`);
      delete sanitized.minPayout;
    }
  }

  if (sanitized.maxDrawdown !== undefined) {
    if (
      typeof sanitized.maxDrawdown !== 'number' ||
      sanitized.maxDrawdown < 0 ||
      sanitized.maxDrawdown > 100
    ) {
      errors.push(`maxDrawdown must be 0-100 (got ${sanitized.maxDrawdown})`);
      delete sanitized.maxDrawdown;
    }
  }

  if (sanitized.maxConsecutiveLosses !== undefined) {
    if (
      typeof sanitized.maxConsecutiveLosses !== 'number' ||
      sanitized.maxConsecutiveLosses < 1 ||
      sanitized.maxConsecutiveLosses > 100
    ) {
      errors.push(`maxConsecutiveLosses must be 1-100 (got ${sanitized.maxConsecutiveLosses})`);
      delete sanitized.maxConsecutiveLosses;
    }
  }

  return { valid: errors.length === 0, errors, sanitized };
}

export function registerMessageListener(ctx: ContentScriptContext): void {
  try {
    chrome.runtime.onMessage.addListener((message: ExtensionMessage, _, sendResponse) => {
      handleMessage(ctx, message)
        .then(sendResponse)
        .catch((err) => {
          console.error('[PO] Message handler error:', err);
          sendResponse({ error: String(err) });
        });
      return true;
    });
  } catch (e) {
    console.warn('[PO] Extension context lost', e);
  }
}

async function switchToAsset(ctx: ContentScriptContext, assetName: string): Promise<boolean> {
  if (!ctx.payoutMonitor) return false;
  console.log(`[PO] Switching to asset: ${assetName}`);
  return await ctx.payoutMonitor.switchAsset(assetName);
}

export function getSystemStatus(ctx: ContentScriptContext): object {
  return {
    initialized: ctx.isInitialized,
    modules: {
      dataCollector: ctx.dataCollector?.isCollecting ?? false,
      candleCollector: ctx.candleCollector?.isCollecting ?? false,
      payoutMonitor: ctx.payoutMonitor?.isMonitoring ?? false,
      indicatorReader: ctx.indicatorReader?.isReading ?? false,
      wsInterceptor: ctx.wsInterceptor?.getStatus() ?? null,
    },
    config: ctx.tradingConfig,
    highPayoutAssets: ctx.payoutMonitor?.getHighPayoutAssets().length ?? 0,
    candleCount:
      ctx.candleCollector
        ?.getTickers()
        .map((t) => ({ ticker: t, count: ctx.candleCollector!.getCandles(t).length })) ?? [],
  };
}

function getLLMReport(ctx: ContentScriptContext): object {
  if (!ctx.signalGenerator) return { error: 'Signal generator not initialized' };
  const signals = ctx.signalGenerator.getSignals(100);
  return generateLLMReport(signals);
}

export async function handleMessage(
  ctx: ContentScriptContext,
  message: ExtensionMessage,
): Promise<unknown> {
  switch (message.type) {
    case 'START_AUTO_MINER':
      AutoMiner.start();
      return { success: true, message: 'Auto Miner Started' };
    case 'STOP_AUTO_MINER':
      AutoMiner.stop();
      return { success: true, message: 'Auto Miner Stopped' };
    case 'GET_MINER_STATUS':
      return AutoMiner.getStatus();
    case 'GET_DB_MONITOR_STATUS':
      return {
        sender: DataSender.getStats(),
      };
    case 'DRAIN_SENDER_RETRY_QUEUE': {
      const maxRetries = message.payload?.maxRetries ?? 2;
      const sent = await DataSender.drainRetryQueue(maxRetries);
      return { sent, stats: DataSender.getStats() };
    }
    case 'SET_MINER_CONFIG':
      AutoMiner.updateConfig(message.payload);
      return { success: true, config: AutoMiner.getConfig() };
    case 'GET_STATUS_V2':
      return getSystemStatus(ctx);
    case 'GET_LLM_REPORT':
      return getLLMReport(ctx);
    case 'SET_CONFIG_V2': {
      const validation = validateConfigUpdate(message.payload);
      if (!validation.valid) {
        console.warn('[PO] Config validation errors:', validation.errors);
      }
      ctx.tradingConfig = { ...ctx.tradingConfig, ...validation.sanitized };
      if (TRADE_EXECUTION_LOCK.locked) {
        ctx.tradingConfig.enabled = false;
      }
      return { success: true, config: ctx.tradingConfig, validationErrors: validation.errors };
    }
    case 'START_TRADING_V2':
      if (TRADE_EXECUTION_LOCK.locked) {
        ctx.tradingConfig.enabled = false;
        return { success: false, error: TRADE_EXECUTION_LOCK.reason, locked: true };
      }
      ctx.tradingConfig.enabled = true;
      return { success: true };
    case 'STOP_TRADING_V2':
      ctx.tradingConfig.enabled = false;
      return { success: true };
    case 'GET_SIGNALS':
      return ctx.signalGenerator?.getSignals(message.payload.limit ?? 20) ?? [];
    case 'GET_HIGH_PAYOUT_ASSETS':
      return ctx.payoutMonitor?.getHighPayoutAssets() ?? [];
    case 'SWITCH_ASSET':
      return switchToAsset(ctx, message.payload.assetName);
    case 'EXPORT_CANDLES':
      return ctx.candleCollector?.exportCandles(message.payload.ticker) ?? null;
    default:
      return null;
  }
}
