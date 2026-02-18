import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AccountVerifier,
  DomDecoder,
  WsDecoder,
  LoggerAlertChannel,
  type AccountDecoder,
  type AlertChannel,
  type VerificationResult,
} from './account-verifier';

// ============================================================
// Mock chrome API
// ============================================================
const mockChrome = {
  runtime: { sendMessage: vi.fn().mockResolvedValue(undefined) },
};
// @ts-ignore
globalThis.chrome = mockChrome;

// ============================================================
// DOM Helpers
// ============================================================

function setupDemoMode(): void {
  Object.defineProperty(window, 'location', {
    value: { pathname: '/ko/cabinet/demo-quick-high-low/', origin: 'https://pocketoption.com' },
    writable: true,
  });

  const label = document.createElement('div');
  label.className = 'balance-info-block__label';
  label.textContent = 'QT Demo';
  document.body.appendChild(label);

  const chartDemo = document.createElement('div');
  chartDemo.className = 'is-chart-demo';
  document.body.appendChild(chartDemo);
}

function setupLiveMode(): void {
  Object.defineProperty(window, 'location', {
    value: { pathname: '/ko/cabinet/quick-high-low/', origin: 'https://pocketoption.com' },
    writable: true,
  });

  const label = document.createElement('div');
  label.className = 'balance-info-block__label';
  label.textContent = 'Real Account';
  document.body.appendChild(label);
}

function setupMixedMode(): void {
  // URL has no demo, but label says demo (ambiguous)
  Object.defineProperty(window, 'location', {
    value: { pathname: '/ko/cabinet/quick-high-low/', origin: 'https://pocketoption.com' },
    writable: true,
  });

  const label = document.createElement('div');
  label.className = 'balance-info-block__label';
  label.textContent = 'QT Demo';
  document.body.appendChild(label);
}

// ============================================================
// DomDecoder Tests
// ============================================================

describe('DomDecoder', () => {
  let decoder: DomDecoder;

  beforeEach(() => {
    document.body.innerHTML = '';
    decoder = new DomDecoder();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should detect DEMO with high confidence when all 3 signals agree', () => {
    setupDemoMode();
    const result = decoder.decode();
    expect(result).not.toBeNull();
    expect(result!.type).toBe('DEMO');
    expect(result!.confidence).toBe('high');
    expect(result!.source).toBe('dom');
  });

  it('should detect DEMO with medium confidence when only URL has demo', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/demo/', origin: 'https://pocketoption.com' },
      writable: true,
    });
    const result = decoder.decode();
    expect(result).not.toBeNull();
    expect(result!.type).toBe('DEMO');
    expect(result!.confidence).toBe('medium');
  });

  it('should detect LIVE with medium confidence for live URL + no demo label', () => {
    setupLiveMode();
    const result = decoder.decode();
    expect(result).not.toBeNull();
    expect(result!.type).toBe('LIVE');
    expect(result!.confidence).toBe('medium');
  });

  it('should return null for mixed signals (URL live + label demo)', () => {
    setupMixedMode();
    const result = decoder.decode();
    expect(result).toBeNull();
  });
});

// ============================================================
// WsDecoder Tests
// ============================================================

describe('WsDecoder', () => {
  let decoder: WsDecoder;

  beforeEach(() => {
    decoder = new WsDecoder();
  });

  it('should return null before any messages are fed', () => {
    expect(decoder.decode()).toBeNull();
  });

  describe('fixture-based detection', () => {
    it('should detect demo from { isDemo: true }', () => {
      decoder.feedMessage({ isDemo: true, balance: 10000 });
      const result = decoder.decode();
      expect(result).not.toBeNull();
      expect(result!.type).toBe('DEMO');
      expect(result!.source).toBe('websocket');
    });

    it('should detect live from { isDemo: false }', () => {
      decoder.feedMessage({ isDemo: false, balance: 500 });
      const result = decoder.decode();
      expect(result).not.toBeNull();
      expect(result!.type).toBe('LIVE');
    });

    it('should detect demo from { demo: true }', () => {
      decoder.feedMessage({ demo: true });
      const result = decoder.decode();
      expect(result!.type).toBe('DEMO');
    });

    it('should detect live from { demo: false }', () => {
      decoder.feedMessage({ demo: false });
      const result = decoder.decode();
      expect(result!.type).toBe('LIVE');
    });

    it('should detect demo from { accountType: "demo" }', () => {
      decoder.feedMessage({ accountType: 'demo' });
      const result = decoder.decode();
      expect(result!.type).toBe('DEMO');
    });

    it('should detect live from { accountType: "real" }', () => {
      decoder.feedMessage({ accountType: 'real' });
      const result = decoder.decode();
      expect(result!.type).toBe('LIVE');
    });

    it('should detect live from { account_type: "live" }', () => {
      decoder.feedMessage({ account_type: 'live' });
      const result = decoder.decode();
      expect(result!.type).toBe('LIVE');
    });

    it('should detect demo from Socket.IO event array ["auth", { isDemo: true }]', () => {
      decoder.feedMessage(['auth', { isDemo: true, userId: 123 }]);
      const result = decoder.decode();
      expect(result!.type).toBe('DEMO');
    });

    it('should detect demo from nested data wrapper { data: { isDemo: true } }', () => {
      decoder.feedMessage({ cmd: 'session', data: { isDemo: true } });
      const result = decoder.decode();
      expect(result!.type).toBe('DEMO');
    });

    it('should detect demo from JSON string', () => {
      decoder.feedMessage('{"isDemo": true, "session": "abc"}');
      const result = decoder.decode();
      expect(result!.type).toBe('DEMO');
    });

    it('should detect demo from JSON array string', () => {
      decoder.feedMessage('["session_info", {"demo": true}]');
      const result = decoder.decode();
      expect(result!.type).toBe('DEMO');
    });
  });

  describe('unknown message handling', () => {
    it('should not detect from unrecognized message formats', () => {
      decoder.feedMessage({ price: 1.2345, symbol: 'EURUSD' });
      expect(decoder.decode()).toBeNull();
    });

    it('should collect unknown samples', () => {
      decoder.feedMessage({ price: 1.2345 });
      decoder.feedMessage({ heartbeat: true });
      const samples = decoder.getUnknownSamples();
      expect(samples).toHaveLength(2);
    });

    it('should limit unknown samples to MAX_UNKNOWN_SAMPLES', () => {
      for (let i = 0; i < 25; i++) {
        decoder.feedMessage({ unknownField: i });
      }
      const samples = decoder.getUnknownSamples();
      expect(samples.length).toBeLessThanOrEqual(20);
    });

    it('should truncate large string samples', () => {
      const longString = 'x'.repeat(1000);
      decoder.feedMessage(longString);
      const samples = decoder.getUnknownSamples();
      expect(samples).toHaveLength(1);
      expect((samples[0].data as string).length).toBeLessThan(1000);
    });

    it('should not crash on non-JSON strings', () => {
      decoder.feedMessage('this is not json');
      expect(decoder.decode()).toBeNull();
    });

    it('should clearSamples', () => {
      decoder.feedMessage({ unknown: true });
      expect(decoder.getUnknownSamples().length).toBe(1);
      decoder.clearSamples();
      expect(decoder.getUnknownSamples().length).toBe(0);
    });
  });

  describe('key-based extraction (not hardcoded format)', () => {
    it('should not detect from numeric isDemo (non-boolean)', () => {
      decoder.feedMessage({ isDemo: 1 });
      expect(decoder.decode()).toBeNull();
    });

    it('should not detect from string demo field (non-boolean)', () => {
      decoder.feedMessage({ demo: 'yes' });
      expect(decoder.decode()).toBeNull();
    });

    it('should detect from accountType regardless of casing', () => {
      decoder.feedMessage({ accountType: 'DEMO_ACCOUNT' });
      const result = decoder.decode();
      expect(result!.type).toBe('DEMO');
    });
  });
});

// ============================================================
// AccountVerifier Tests
// ============================================================

describe('AccountVerifier', () => {
  let alertChannel: AlertChannel & { alerts: Array<{ level: string; message: string }> };
  let haltCalled: boolean;
  let haltReason: string | null;
  let tradingArmed: boolean;

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
    haltCalled = false;
    haltReason = null;
    tradingArmed = false;

    alertChannel = {
      alerts: [],
      alert(level: 'info' | 'warn' | 'critical', message: string) {
        this.alerts.push({ level, message });
      },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  function createVerifier(
    decoders?: AccountDecoder[],
    options?: { reverifyIntervalMs?: number },
  ): AccountVerifier {
    return new AccountVerifier({
      decoders: decoders ?? [new DomDecoder(), new WsDecoder()],
      alertChannel,
      reverifyIntervalMs: options?.reverifyIntervalMs ?? 30_000,
      isTradingArmed: () => tradingArmed,
      onHalt: (reason) => {
        haltCalled = true;
        haltReason = reason;
      },
    });
  }

  describe('decoder chain', () => {
    it('should use DOM decoder first when DOM gives definitive result', () => {
      setupDemoMode();
      const verifier = createVerifier();
      const result = verifier.verify();
      expect(result.type).toBe('DEMO');
      expect(result.source).toBe('dom');
    });

    it('should fall through to WS decoder when DOM returns null', () => {
      setupMixedMode(); // DOM returns null for mixed signals
      const wsDecoder = new WsDecoder();
      wsDecoder.feedMessage({ isDemo: true });
      const verifier = createVerifier([new DomDecoder(), wsDecoder]);
      const result = verifier.verify();
      expect(result.type).toBe('DEMO');
      expect(result.source).toBe('websocket');
    });

    it('should return UNKNOWN when all decoders return null', () => {
      setupMixedMode(); // DOM returns null
      const verifier = createVerifier(); // WS has no messages
      const result = verifier.verify();
      expect(result.type).toBe('UNKNOWN');
      expect(result.source).toBe('fallback');
      expect(result.confidence).toBe('low');
    });
  });

  describe('halt on UNKNOWN when trading armed', () => {
    it('should halt trading when armed + unknown', () => {
      setupMixedMode();
      tradingArmed = true;
      const verifier = createVerifier();
      verifier.verify();
      expect(haltCalled).toBe(true);
      expect(haltReason).toContain('halted');
      expect(alertChannel.alerts.some((a) => a.level === 'critical')).toBe(true);
    });

    it('should NOT halt when not armed + unknown', () => {
      setupMixedMode();
      tradingArmed = false;
      const verifier = createVerifier();
      verifier.verify();
      expect(haltCalled).toBe(false);
      // Should still log info-level alert
      expect(alertChannel.alerts.some((a) => a.level === 'info')).toBe(true);
    });

    it('should halt only once per unknown state (no spam)', () => {
      setupMixedMode();
      tradingArmed = true;
      const verifier = createVerifier();
      verifier.verify();
      verifier.verify();
      verifier.verify();
      // onHalt should only be called once
      const criticalAlerts = alertChannel.alerts.filter((a) => a.level === 'critical');
      expect(criticalAlerts).toHaveLength(1);
    });

    it('should halt again after recovery + re-occurrence', () => {
      // Start with demo
      setupDemoMode();
      tradingArmed = true;
      const verifier = createVerifier();
      verifier.verify(); // DEMO → no halt

      // Switch to mixed (unknown)
      document.body.innerHTML = '';
      setupMixedMode();
      verifier.verify(); // UNKNOWN → halt
      expect(haltCalled).toBe(true);
      haltCalled = false;

      // Recover to demo
      document.body.innerHTML = '';
      setupDemoMode();
      verifier.verify(); // DEMO → resets halt tracker

      // Back to unknown
      document.body.innerHTML = '';
      setupMixedMode();
      verifier.verify(); // UNKNOWN → halt again
      expect(haltCalled).toBe(true);
    });
  });

  describe('halt on LIVE when trading armed', () => {
    it('should halt trading when armed + LIVE detected', () => {
      setupLiveMode();
      tradingArmed = true;
      const verifier = createVerifier();
      verifier.verify();
      expect(haltCalled).toBe(true);
      expect(haltReason).toContain('LIVE');
    });
  });

  describe('isTradeAllowed', () => {
    it('should allow trades when verified as DEMO', () => {
      setupDemoMode();
      const verifier = createVerifier();
      verifier.verify();
      const check = verifier.isTradeAllowed();
      expect(check.allowed).toBe(true);
    });

    it('should block trades when UNKNOWN', () => {
      setupMixedMode();
      const verifier = createVerifier();
      verifier.verify();
      const check = verifier.isTradeAllowed();
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('unknown');
    });

    it('should block trades when LIVE', () => {
      setupLiveMode();
      const verifier = createVerifier();
      verifier.verify();
      const check = verifier.isTradeAllowed();
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('LIVE');
    });

    it('should force fresh verification even without prior verify() call', () => {
      // P1 review fix: isTradeAllowed() now calls verify() internally,
      // so "never verified" state no longer exists. With no DOM signals
      // present, DOM decoder returns LIVE → trades blocked.
      const verifier = createVerifier();
      const check = verifier.isTradeAllowed();
      expect(check.allowed).toBe(false);
      // Fresh verify runs decoder chain; default jsdom URL has no 'demo'
      // and no label → DOM returns LIVE
      expect(check.reason).toContain('LIVE');
    });

    it('should catch account switch at trade time without waiting for periodic verify', () => {
      // P1 review fix: isTradeAllowed() forces fresh verification
      // so a demo→live switch is detected immediately at trade gate.
      setupDemoMode();
      const verifier = createVerifier();
      verifier.verify(); // initial: DEMO

      // Simulate account switch to live
      document.body.innerHTML = '';
      setupLiveMode();

      // Even without waiting for the periodic re-verify timer,
      // isTradeAllowed() catches the switch immediately
      const check = verifier.isTradeAllowed();
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('LIVE');
    });
  });

  describe('periodic re-verification', () => {
    it('should re-verify on configured interval', () => {
      setupDemoMode();
      const verifier = createVerifier(undefined, { reverifyIntervalMs: 5000 });
      verifier.start();

      expect(verifier.getLastResult()?.type).toBe('DEMO');

      // Switch to live mid-flight
      document.body.innerHTML = '';
      setupLiveMode();
      tradingArmed = true;

      // Advance timer past re-verification
      vi.advanceTimersByTime(5000);

      expect(verifier.getLastResult()?.type).toBe('LIVE');
      expect(haltCalled).toBe(true);

      verifier.stop();
    });

    it('should not run re-verify after stop()', () => {
      setupDemoMode();
      const verifier = createVerifier(undefined, { reverifyIntervalMs: 100 });
      verifier.start();
      verifier.stop();

      document.body.innerHTML = '';
      setupLiveMode();
      tradingArmed = true;

      vi.advanceTimersByTime(200);

      // Should still show DEMO (from initial verify), not LIVE
      expect(verifier.getLastResult()?.type).toBe('DEMO');
      expect(haltCalled).toBe(false);
    });

    it('should prevent timer leaks on double start', () => {
      setupDemoMode();
      const verifier = createVerifier();
      verifier.start();
      verifier.start(); // should be no-op
      verifier.stop();
    });
  });

  describe('feedWsMessage integration', () => {
    it('should update WS decoder via feedWsMessage', () => {
      setupMixedMode(); // DOM returns null
      const wsDecoder = new WsDecoder();
      const verifier = createVerifier([new DomDecoder(), wsDecoder]);

      // Before feeding: UNKNOWN
      let result = verifier.verify();
      expect(result.type).toBe('UNKNOWN');

      // Feed a demo message
      verifier.feedWsMessage({ isDemo: true });

      // After feeding: DEMO from WS
      result = verifier.verify();
      expect(result.type).toBe('DEMO');
      expect(result.source).toBe('websocket');
    });
  });

  describe('getWsSamples', () => {
    it('should return unknown samples from WS decoder', () => {
      const verifier = createVerifier();
      verifier.feedWsMessage({ price: 1.234 });
      verifier.feedWsMessage({ heartbeat: true });
      const samples = verifier.getWsSamples();
      expect(samples).toHaveLength(2);
    });
  });
});

// ============================================================
// LoggerAlertChannel Tests
// ============================================================

describe('LoggerAlertChannel', () => {
  it('should call broadcast function when set', () => {
    const channel = new LoggerAlertChannel();
    const broadcast = vi.fn();
    channel.setBroadcast(broadcast);

    channel.alert('critical', 'Test alert', { foo: 'bar' });
    expect(broadcast).toHaveBeenCalledWith('critical', 'Test alert');
  });

  it('should not throw when broadcast is not set', () => {
    const channel = new LoggerAlertChannel();
    expect(() => channel.alert('info', 'Test')).not.toThrow();
  });
});
