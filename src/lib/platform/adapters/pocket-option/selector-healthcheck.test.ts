import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SelectorHealthcheck,
  resetSelectorHealthcheck,
  getSelectorHealthcheck,
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
  });

  afterEach(() => {
    healthcheck.destroy();
    document.body.innerHTML = '';
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
