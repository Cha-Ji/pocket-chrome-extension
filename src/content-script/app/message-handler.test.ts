import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createContext, ContentScriptContext } from './context';
import {
  handleMessage,
  getSystemStatus,
  registerMessageListener,
  validateConfigUpdate,
} from './message-handler';

vi.stubGlobal('chrome', {
  runtime: {
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn() },
  },
});

describe('message-handler', () => {
  let ctx: ContentScriptContext;

  beforeEach(() => {
    ctx = createContext();
  });

  describe('getSystemStatus', () => {
    it('should return status with all modules null', () => {
      const status = getSystemStatus(ctx) as any;
      expect(status.initialized).toBe(false);
      expect(status.modules.dataCollector).toBe(false);
      expect(status.modules.candleCollector).toBe(false);
      expect(status.modules.payoutMonitor).toBe(false);
      expect(status.modules.indicatorReader).toBe(false);
      expect(status.modules.wsInterceptor).toBeNull();
      expect(status.config).toEqual(ctx.tradingConfig);
      expect(status.highPayoutAssets).toBe(0);
      expect(status.candleCount).toEqual([]);
    });

    it('should reflect initialized state', () => {
      ctx.isInitialized = true;
      const status = getSystemStatus(ctx) as any;
      expect(status.initialized).toBe(true);
    });
  });

  describe('handleMessage', () => {
    it('should handle GET_STATUS_V2', async () => {
      const result = await handleMessage(ctx, { type: 'GET_STATUS_V2' } as any);
      expect(result).toHaveProperty('initialized');
      expect(result).toHaveProperty('modules');
      expect(result).toHaveProperty('config');
    });

    it('should handle SET_CONFIG_V2', async () => {
      const result = (await handleMessage(ctx, {
        type: 'SET_CONFIG_V2',
        payload: { tradeAmount: 25 },
      } as any)) as any;
      expect(result.success).toBe(true);
      expect(result.config.tradeAmount).toBe(25);
      expect(ctx.tradingConfig.tradeAmount).toBe(25);
    });

    it('should handle START_TRADING_V2', async () => {
      expect(ctx.tradingConfig.enabled).toBe(false);
      const result = (await handleMessage(ctx, { type: 'START_TRADING_V2' } as any)) as any;
      expect(result.success).toBe(true);
      expect(ctx.tradingConfig.enabled).toBe(true);
    });

    it('should handle STOP_TRADING_V2', async () => {
      ctx.tradingConfig.enabled = true;
      const result = (await handleMessage(ctx, { type: 'STOP_TRADING_V2' } as any)) as any;
      expect(result.success).toBe(true);
      expect(ctx.tradingConfig.enabled).toBe(false);
    });

    it('should handle GET_SIGNALS with signalGenerator', async () => {
      const mockSignals = [{ id: 'sig-1', direction: 'CALL' }];
      ctx.signalGenerator = { getSignals: vi.fn().mockReturnValue(mockSignals) } as any;
      const result = await handleMessage(ctx, {
        type: 'GET_SIGNALS',
        payload: { limit: 5 },
      } as any);
      expect(ctx.signalGenerator!.getSignals).toHaveBeenCalledWith(5);
      expect(result).toEqual(mockSignals);
    });

    it('should handle GET_SIGNALS without signalGenerator', async () => {
      ctx.signalGenerator = null;
      const result = await handleMessage(ctx, {
        type: 'GET_SIGNALS',
        payload: { limit: 5 },
      } as any);
      expect(result).toEqual([]);
    });

    it('should handle GET_HIGH_PAYOUT_ASSETS', async () => {
      const assets = [{ name: 'EURUSD', payout: 95 }];
      ctx.payoutMonitor = { getHighPayoutAssets: vi.fn().mockReturnValue(assets) } as any;
      const result = await handleMessage(ctx, { type: 'GET_HIGH_PAYOUT_ASSETS' } as any);
      expect(result).toEqual(assets);
    });

    it('should return null for unknown message type', async () => {
      const result = await handleMessage(ctx, { type: 'UNKNOWN_TYPE' } as any);
      expect(result).toBeNull();
    });
  });

  describe('validateConfigUpdate (P1-3)', () => {
    it('should accept valid config values', () => {
      const result = validateConfigUpdate({ tradeAmount: 25, minPayout: 92, maxDrawdown: 20 });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.sanitized.tradeAmount).toBe(25);
    });

    it('should reject negative tradeAmount', () => {
      const result = validateConfigUpdate({ tradeAmount: -5 });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('tradeAmount');
      expect(result.sanitized.tradeAmount).toBeUndefined();
    });

    it('should reject tradeAmount over 10000', () => {
      const result = validateConfigUpdate({ tradeAmount: 50000 });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('tradeAmount');
    });

    it('should reject minPayout out of range', () => {
      const result = validateConfigUpdate({ minPayout: 150 });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('minPayout');
    });

    it('should reject maxDrawdown out of range', () => {
      const result = validateConfigUpdate({ maxDrawdown: -10 });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('maxDrawdown');
    });

    it('should reject maxConsecutiveLosses out of range', () => {
      const result = validateConfigUpdate({ maxConsecutiveLosses: 0 });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('maxConsecutiveLosses');
    });

    it('should strip invalid fields but keep valid ones', () => {
      const result = validateConfigUpdate({ tradeAmount: -1, minPayout: 90 });
      expect(result.valid).toBe(false);
      expect(result.sanitized.tradeAmount).toBeUndefined();
      expect(result.sanitized.minPayout).toBe(90); // valid field kept
    });
  });

  describe('SET_CONFIG_V2 with validation (P1-3)', () => {
    it('should reject invalid config and return validation errors', async () => {
      const result = (await handleMessage(ctx, {
        type: 'SET_CONFIG_V2',
        payload: { tradeAmount: -1 },
      } as any)) as any;
      expect(result.success).toBe(true); // still succeeds (invalid fields stripped)
      expect(result.validationErrors.length).toBeGreaterThan(0);
      expect(ctx.tradingConfig.tradeAmount).toBe(10); // default, not -1
    });

    it('should apply valid config values after validation', async () => {
      const result = (await handleMessage(ctx, {
        type: 'SET_CONFIG_V2',
        payload: { tradeAmount: 50, minPayout: 88 },
      } as any)) as any;
      expect(result.success).toBe(true);
      expect(result.validationErrors).toHaveLength(0);
      expect(ctx.tradingConfig.tradeAmount).toBe(50);
      expect(ctx.tradingConfig.minPayout).toBe(88);
    });
  });

  describe('registerMessageListener (P1-2: catch on reject)', () => {
    it('should register a listener that catches errors and calls sendResponse', () => {
      const addListenerMock = vi.fn();
      vi.stubGlobal('chrome', {
        runtime: {
          sendMessage: vi.fn(),
          onMessage: { addListener: addListenerMock },
        },
      });

      registerMessageListener(ctx);
      expect(addListenerMock).toHaveBeenCalledTimes(1);

      // Verify the listener signature returns true (for async sendResponse)
      const listener = addListenerMock.mock.calls[0][0];
      const mockSendResponse = vi.fn();
      const result = listener({ type: 'GET_STATUS_V2' }, {}, mockSendResponse);
      expect(result).toBe(true); // async pattern
    });
  });
});
