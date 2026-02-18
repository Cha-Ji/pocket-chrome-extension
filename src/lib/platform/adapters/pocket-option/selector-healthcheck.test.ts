import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SelectorHealthcheck,
  resetSelectorHealthcheck,
  getSelectorHealthcheck,
  hasResultChanged,
  type HealthcheckResult,
} from './selector-healthcheck';

// Mock chrome.runtime.sendMessage (not available in jsdom)
vi.stubGlobal('chrome', {
  runtime: {
    sendMessage: vi.fn().mockReturnValue(Promise.resolve()),
  },
});

/**
 * Helper: create DOM elements matching the given CSS selectors.
 * Returns cleanup function.
 */
function createDOMElements(selectors: Record<string, string>): () => void {
  const elements: HTMLElement[] = [];

  for (const [key, selector] of Object.entries(selectors)) {
    // Parse simple selectors and create matching elements
    if (selector.startsWith('.')) {
      // Class selector: .some-class__item → <div class="some-class__item">
      const className = selector.slice(1).split(':')[0]; // strip pseudo-classes
      const el = document.createElement('div');
      el.className = className;
      el.dataset.selectorKey = key;
      document.body.appendChild(el);
      elements.push(el);
    } else if (selector.startsWith('#')) {
      // ID selector
      const id = selector.slice(1).split(' ')[0];
      const el = document.createElement('div');
      el.id = id;
      document.body.appendChild(el);
      elements.push(el);

      // If there's a descendant selector (e.g. #foo input[type="text"])
      const rest = selector.slice(selector.indexOf(' ') + 1);
      if (rest !== selector && rest.startsWith('input')) {
        const input = document.createElement('input');
        input.type = 'text';
        el.appendChild(input);
      }
    }
  }

  return () => {
    for (const el of elements) {
      el.remove();
    }
  };
}

/**
 * Create a full set of DOM elements for all critical + non-critical selectors.
 */
function createFullDemoDOM(): () => void {
  // Critical selectors
  const wrapper = document.createElement('div');
  wrapper.className = 'switch-state-block';
  const callItem = document.createElement('div');
  callItem.className = 'switch-state-block__item';
  wrapper.appendChild(callItem);
  const putItem = document.createElement('div');
  putItem.className = 'switch-state-block__item';
  wrapper.appendChild(putItem);
  document.body.appendChild(wrapper);

  // Amount input
  const amountContainer = document.createElement('div');
  amountContainer.id = 'put-call-buttons-chart-1';
  const input = document.createElement('input');
  input.type = 'text';
  amountContainer.appendChild(input);
  document.body.appendChild(amountContainer);

  // Balance display
  const balanceVal = document.createElement('div');
  balanceVal.className = 'balance-info-block__value';
  balanceVal.textContent = '10000';
  document.body.appendChild(balanceVal);

  // Balance label
  const balanceLabel = document.createElement('div');
  balanceLabel.className = 'balance-info-block__label';
  balanceLabel.textContent = 'Demo';
  document.body.appendChild(balanceLabel);

  // Ticker
  const chartItem = document.createElement('div');
  chartItem.className = 'chart-item';
  const pair = document.createElement('div');
  pair.className = 'pair';
  chartItem.appendChild(pair);
  // Price display
  const valueEl = document.createElement('div');
  valueEl.className = 'value__val';
  chartItem.appendChild(valueEl);
  document.body.appendChild(chartItem);

  // Expiration
  const expBlock = document.createElement('div');
  expBlock.className = 'block--expiration-inputs';
  const expVal = document.createElement('div');
  expVal.className = 'value__val';
  expBlock.appendChild(expVal);
  document.body.appendChild(expBlock);

  return () => {
    document.body.innerHTML = '';
  };
}

describe('SelectorHealthcheck', () => {
  let healthcheck: SelectorHealthcheck;

  beforeEach(() => {
    document.body.innerHTML = '';
    resetSelectorHealthcheck();
    healthcheck = new SelectorHealthcheck();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    healthcheck.destroy();
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  describe('Demo environment — all selectors present', () => {
    it('should PASS when all critical selectors are found', () => {
      const cleanup = createFullDemoDOM();

      // Set URL to demo
      Object.defineProperty(window, 'location', {
        value: { pathname: '/demo/trading', href: 'https://pocketoption.com/demo/trading' },
        writable: true,
      });

      const result = healthcheck.run();

      expect(result.environment).toBe('demo');
      expect(result.passed).toBe(true);
      expect(result.tradingHalted).toBe(false);
      expect(result.criticalFailures).toEqual([]);
      expect(result.version).toBe('1.1.0');
      expect(result.snapshot).toBeUndefined(); // No snapshot for demo

      cleanup();
    });
  });

  describe('Demo environment — critical selector missing', () => {
    it('should FAIL and halt trading when callButton is missing', () => {
      // Only create balance display (one critical selector), not trading buttons
      const el = document.createElement('div');
      el.className = 'balance-info-block__value';
      el.textContent = '10000';
      document.body.appendChild(el);

      Object.defineProperty(window, 'location', {
        value: { pathname: '/demo/trading', href: 'https://pocketoption.com/demo/trading' },
        writable: true,
      });

      const result = healthcheck.run();

      expect(result.passed).toBe(false);
      expect(result.tradingHalted).toBe(true);
      expect(result.criticalFailures).toContain('callButton');
      expect(result.criticalFailures).toContain('putButton');
      expect(result.criticalFailures).toContain('amountInput');
    });
  });

  describe('Demo environment — non-critical selector missing', () => {
    it('should warn but not halt trading when only non-critical selectors are missing', () => {
      // Create all critical selectors only
      const wrapper = document.createElement('div');
      wrapper.className = 'switch-state-block';
      const callItem = document.createElement('div');
      callItem.className = 'switch-state-block__item';
      wrapper.appendChild(callItem);
      const putItem = document.createElement('div');
      putItem.className = 'switch-state-block__item';
      wrapper.appendChild(putItem);
      document.body.appendChild(wrapper);

      const amountContainer = document.createElement('div');
      amountContainer.id = 'put-call-buttons-chart-1';
      const input = document.createElement('input');
      input.type = 'text';
      amountContainer.appendChild(input);
      document.body.appendChild(amountContainer);

      const balanceVal = document.createElement('div');
      balanceVal.className = 'balance-info-block__value';
      document.body.appendChild(balanceVal);

      Object.defineProperty(window, 'location', {
        value: { pathname: '/demo/trading', href: 'https://pocketoption.com/demo/trading' },
        writable: true,
      });

      const result = healthcheck.run();

      expect(result.passed).toBe(false);
      expect(result.tradingHalted).toBe(false); // Not halted — only non-critical
      expect(result.criticalFailures).toEqual([]);
      expect(result.nonCriticalFailures.length).toBeGreaterThan(0);
    });
  });

  describe('Unknown environment — fail-safe behavior', () => {
    it('should save snapshot and halt if critical selectors are missing', () => {
      // Empty DOM + no demo indicators
      Object.defineProperty(window, 'location', {
        value: { pathname: '/trading', href: 'https://pocketoption.com/trading' },
        writable: true,
      });

      const result = healthcheck.run();

      expect(result.environment).toBe('unknown');
      expect(result.tradingHalted).toBe(true);
      expect(result.snapshot).toBeDefined();
      expect(typeof result.snapshot).toBe('object');
      // Snapshot should contain boolean values for each key
      if (result.snapshot) {
        for (const val of Object.values(result.snapshot)) {
          expect(typeof val).toBe('boolean');
        }
      }
    });

    it('should pass healthcheck in unknown env if all selectors are present', () => {
      const cleanup = createFullDemoDOM();

      // No demo URL, but label has no demo text — unknown env
      const label = document.querySelector('.balance-info-block__label');
      if (label) label.textContent = '';

      Object.defineProperty(window, 'location', {
        value: { pathname: '/trading', href: 'https://pocketoption.com/trading' },
        writable: true,
      });

      const result = healthcheck.run();

      expect(result.environment).toBe('unknown');
      // Critical selectors should be found
      expect(result.criticalFailures.length).toBe(0);
      expect(result.tradingHalted).toBe(false);
      // Still has snapshot for unknown env
      expect(result.snapshot).toBeDefined();

      cleanup();
    });
  });

  describe('detectEnvironment integration', () => {
    it('should detect demo environment from URL', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/demo/trading', href: 'https://pocketoption.com/demo/trading' },
        writable: true,
      });

      const result = healthcheck.run();
      expect(result.environment).toBe('demo');
    });

    it('should detect real environment when no demo indicators', () => {
      const label = document.createElement('div');
      label.className = 'balance-info-block__label';
      label.textContent = 'Real Account';
      document.body.appendChild(label);

      Object.defineProperty(window, 'location', {
        value: { pathname: '/trading', href: 'https://pocketoption.com/trading' },
        writable: true,
      });

      const result = healthcheck.run();
      expect(result.environment).toBe('real');
    });
  });

  describe('runAndBroadcast', () => {
    it('should call chrome.runtime.sendMessage with result', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/demo/trading', href: 'https://pocketoption.com/demo/trading' },
        writable: true,
      });

      healthcheck.runAndBroadcast();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SELECTOR_HEALTHCHECK_RESULT',
          payload: expect.objectContaining({
            environment: 'demo',
            version: '1.1.0',
          }),
        }),
      );
    });

    it('should invoke onResult callback', () => {
      const callback = vi.fn();
      healthcheck.onResult(callback);

      Object.defineProperty(window, 'location', {
        value: { pathname: '/demo/trading', href: 'https://pocketoption.com/demo/trading' },
        writable: true,
      });

      healthcheck.runAndBroadcast();

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: 'demo',
        }),
      );
    });
  });

  describe('Singleton management', () => {
    it('getSelectorHealthcheck should return same instance', () => {
      const a = getSelectorHealthcheck();
      const b = getSelectorHealthcheck();
      expect(a).toBe(b);
    });

    it('resetSelectorHealthcheck should create new instance', () => {
      const a = getSelectorHealthcheck();
      resetSelectorHealthcheck();
      const b = getSelectorHealthcheck();
      expect(a).not.toBe(b);
    });
  });

  describe('MutationObserver', () => {
    it('should start and stop observer without errors', () => {
      healthcheck.startObserver();
      // Starting again should be idempotent
      healthcheck.startObserver();
      healthcheck.stopObserver();
      // Stopping again should be idempotent
      healthcheck.stopObserver();
    });
  });

  describe('hasResultChanged — comprehensive diff detection', () => {
    const base: HealthcheckResult = {
      environment: 'demo',
      timestamp: 1000,
      version: '1.0.0',
      results: [],
      passed: true,
      tradingHalted: false,
      criticalFailures: [],
      nonCriticalFailures: [],
    };

    it('should return true when prev is null (first run)', () => {
      expect(hasResultChanged(null, base)).toBe(true);
    });

    it('should return false when results are identical', () => {
      expect(hasResultChanged({ ...base }, { ...base })).toBe(false);
    });

    it('should detect tradingHalted change', () => {
      expect(hasResultChanged(base, { ...base, tradingHalted: true })).toBe(true);
    });

    it('should detect passed change', () => {
      expect(hasResultChanged(base, { ...base, passed: false })).toBe(true);
    });

    it('should detect environment change (demo → real)', () => {
      expect(hasResultChanged(base, { ...base, environment: 'real' })).toBe(true);
    });

    it('should detect environment change (demo → unknown)', () => {
      expect(hasResultChanged(base, { ...base, environment: 'unknown' })).toBe(true);
    });

    it('should detect version change', () => {
      expect(hasResultChanged(base, { ...base, version: '2.0.0' })).toBe(true);
    });

    it('should detect criticalFailures change', () => {
      expect(
        hasResultChanged(base, { ...base, criticalFailures: ['callButton'] }),
      ).toBe(true);
    });

    it('should detect nonCriticalFailures change (non-critical only)', () => {
      // This was the bug Codex reported: non-critical-only changes were missed
      expect(
        hasResultChanged(base, { ...base, nonCriticalFailures: ['tickerSelector'] }),
      ).toBe(true);
    });

    it('should detect nonCriticalFailures order change', () => {
      const prev = { ...base, nonCriticalFailures: ['a', 'b'] };
      const next = { ...base, nonCriticalFailures: ['b', 'a'] };
      // Different order → different join result → treated as change
      expect(hasResultChanged(prev, next)).toBe(true);
    });

    it('should ignore timestamp changes (not compared)', () => {
      expect(hasResultChanged(base, { ...base, timestamp: 9999 })).toBe(false);
    });
  });

  describe('scheduleRevalidation — broadcast on any change', () => {
    it('should broadcast when non-critical failures change after DOM mutation', async () => {
      const cleanup = createFullDemoDOM();

      Object.defineProperty(window, 'location', {
        value: { pathname: '/demo/trading', href: 'https://pocketoption.com/demo/trading' },
        writable: true,
      });

      const callback = vi.fn();
      healthcheck.onResult(callback);

      // Initial run to populate lastResult
      healthcheck.runAndBroadcast();
      callback.mockClear();
      (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockClear();

      // Now remove a non-critical element to trigger a non-critical-only change
      const chartItem = document.querySelector('.chart-item');
      chartItem?.remove();

      // Start observer and trigger DOM mutation
      healthcheck.startObserver();
      const newDiv = document.createElement('div');
      newDiv.className = 'trigger-mutation';
      document.body.appendChild(newDiv);

      // Fast-forward debounce timer
      await vi.advanceTimersByTimeAsync(6000);

      // The callback should have been called because non-critical selectors changed
      expect(callback).toHaveBeenCalled();
      expect(chrome.runtime.sendMessage).toHaveBeenCalled();

      healthcheck.stopObserver();
      cleanup();
    });

    it('should NOT broadcast when results are unchanged after DOM mutation', async () => {
      const cleanup = createFullDemoDOM();

      Object.defineProperty(window, 'location', {
        value: { pathname: '/demo/trading', href: 'https://pocketoption.com/demo/trading' },
        writable: true,
      });

      const callback = vi.fn();
      healthcheck.onResult(callback);

      // Initial run
      healthcheck.runAndBroadcast();
      callback.mockClear();
      (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockClear();

      // Trigger DOM mutation without changing any selectors
      healthcheck.startObserver();
      const newDiv = document.createElement('div');
      newDiv.className = 'irrelevant-class';
      document.body.appendChild(newDiv);

      await vi.advanceTimersByTimeAsync(6000);

      // No change in selector status → no broadcast
      expect(callback).not.toHaveBeenCalled();

      healthcheck.stopObserver();
      cleanup();
    });

    it('should capture prev BEFORE run() to avoid self-comparison', () => {
      // This test verifies the ordering invariant:
      // prev must be captured before run() overwrites lastResult.
      Object.defineProperty(window, 'location', {
        value: { pathname: '/demo/trading', href: 'https://pocketoption.com/demo/trading' },
        writable: true,
      });

      // First run: empty DOM → will have critical failures
      const result1 = healthcheck.run();
      expect(result1.tradingHalted).toBe(true);

      // Now getLastResult should match result1
      expect(healthcheck.getLastResult()).toBe(result1);

      // Create full DOM
      const cleanup = createFullDemoDOM();

      // Second run: should detect change from halted → not halted
      const result2 = healthcheck.run();
      expect(result2.tradingHalted).toBe(false);

      // lastResult is now result2, and result1 !== result2
      expect(hasResultChanged(result1, result2)).toBe(true);

      cleanup();
    });
  });

  describe('Fallback chain integration', () => {
    it('should find selectors via fallback when primary is missing', () => {
      // Create a fallback element for callButton (.btn-call instead of .switch-state-block__item:first-child)
      const el = document.createElement('div');
      el.className = 'btn-call';
      document.body.appendChild(el);

      // Also create other critical selectors
      const putEl = document.createElement('div');
      putEl.className = 'btn-put';
      document.body.appendChild(putEl);

      const amountContainer = document.createElement('div');
      amountContainer.id = 'put-call-buttons-chart-1';
      const input = document.createElement('input');
      input.type = 'text';
      amountContainer.appendChild(input);
      document.body.appendChild(amountContainer);

      const balanceVal = document.createElement('div');
      balanceVal.className = 'balance-info-block__value';
      document.body.appendChild(balanceVal);

      Object.defineProperty(window, 'location', {
        value: { pathname: '/demo/trading', href: 'https://pocketoption.com/demo/trading' },
        writable: true,
      });

      const result = healthcheck.run();

      // callButton should be found via fallback
      const callResult = result.results.find((r) => r.key === 'callButton');
      expect(callResult?.found).toBe(true);
      expect(callResult?.usedSelector).toBe('.btn-call');
    });
  });
});
