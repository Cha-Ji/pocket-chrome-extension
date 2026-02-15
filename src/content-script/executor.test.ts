import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TradeExecutor } from './executor';
import { DEFAULT_SELECTORS } from '../lib/types';

// Mock chrome API
const mockChrome = {
  runtime: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
  },
};
// @ts-ignore
globalThis.chrome = mockChrome;

// Helper to setup demo mode environment
function setupDemoMode() {
  // Mock URL to demo path
  Object.defineProperty(window, 'location', {
    value: { pathname: '/ko/cabinet/demo-quick-high-low/' },
    writable: true,
  });

  // Add demo indicator element
  const balanceBlock = document.createElement('div');
  balanceBlock.className = 'balance-info-block';
  balanceBlock.innerHTML = `
    <div class="balance-info-block__label">QT Demo</div>
    <div class="balance-info-block__value">10,000.00</div>
  `;
  document.body.appendChild(balanceBlock);

  // Add chart with demo class
  const chartDemo = document.createElement('div');
  chartDemo.className = 'is-chart-demo';
  document.body.appendChild(chartDemo);
}

// Helper to setup live mode environment
function setupLiveMode() {
  Object.defineProperty(window, 'location', {
    value: { pathname: '/ko/cabinet/quick-high-low/' },
    writable: true,
  });
}

describe('TradeExecutor', () => {
  let executor: TradeExecutor;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    setupDemoMode(); // Default to demo mode for safety
    executor = new TradeExecutor(DEFAULT_SELECTORS);
  });

  afterEach(() => {
    // Reset location mock
    Object.defineProperty(window, 'location', {
      value: { pathname: '/' },
      writable: true,
    });
  });

  describe('initialization', () => {
    it('should initialize with isTrading false', () => {
      expect(executor.isTrading).toBe(false);
    });
  });

  describe('startAutoTrading', () => {
    it('should return success when starting in demo mode', () => {
      const result = executor.startAutoTrading();
      expect(result.success).toBe(true);
      expect(result.message).toContain('Demo mode');
    });

    it('should set isTrading to true in demo mode', () => {
      executor.startAutoTrading();
      expect(executor.isTrading).toBe(true);
    });

    it('should return failure if already trading', () => {
      executor.startAutoTrading();
      const result = executor.startAutoTrading();
      expect(result.success).toBe(false);
      expect(result.message).toBe('Already trading');
    });

    it('should block trading on live account', () => {
      setupLiveMode();
      document.body.innerHTML = ''; // Remove demo elements
      const liveExecutor = new TradeExecutor(DEFAULT_SELECTORS);
      const result = liveExecutor.startAutoTrading();
      expect(result.success).toBe(false);
      expect(result.message).toContain('BLOCKED');
      expect(result.message).toContain('Demo mode required');
    });

    it('should allow live trading when explicitly enabled', () => {
      setupLiveMode();
      document.body.innerHTML = '';
      const liveExecutor = new TradeExecutor(DEFAULT_SELECTORS);
      liveExecutor.enableLiveTrading(true);
      const result = liveExecutor.startAutoTrading();
      expect(result.success).toBe(true);
    });
  });

  describe('stopAutoTrading', () => {
    it('should return failure if not trading', () => {
      const result = executor.stopAutoTrading();
      expect(result.success).toBe(false);
      expect(result.message).toBe('Not trading');
    });

    it('should return success when stopping', () => {
      executor.startAutoTrading();
      const result = executor.stopAutoTrading();
      expect(result.success).toBe(true);
      expect(result.message).toBe('Auto-trading stopped');
    });

    it('should set isTrading to false', () => {
      executor.startAutoTrading();
      executor.stopAutoTrading();
      expect(executor.isTrading).toBe(false);
    });
  });

  describe('executeTrade', () => {
    it('should fail when trade buttons not found in demo mode', async () => {
      const result = await executor.executeTrade('CALL');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Trade buttons not found');
    });

    it('should block trade execution on live account', async () => {
      setupLiveMode();
      document.body.innerHTML = '';
      const liveExecutor = new TradeExecutor(DEFAULT_SELECTORS);
      const result = await liveExecutor.executeTrade('CALL');
      expect(result.success).toBe(false);
      expect(result.error).toContain('BLOCKED');
    });
  });

  describe('getCurrentBalance', () => {
    it('should return null when balance element not found', async () => {
      document.body.innerHTML = ''; // Remove demo elements
      expect(await executor.getCurrentBalance()).toBeNull();
    });

    it('should return balance value when element exists', async () => {
      // Balance element is set up in setupDemoMode with "10,000.00"
      expect(await executor.getCurrentBalance()).toBe(10000);
    });
  });

  describe('isInDemoMode', () => {
    it('should return true when in demo mode', () => {
      expect(executor.isInDemoMode()).toBe(true);
    });

    it('should return false when in live mode', () => {
      setupLiveMode();
      document.body.innerHTML = '';
      const liveExecutor = new TradeExecutor(DEFAULT_SELECTORS);
      expect(liveExecutor.isInDemoMode()).toBe(false);
    });
  });
});
