// ============================================================
// Account Verifier — Decoder Chain for Demo/Real Detection
// ============================================================
// Issue #52: Harden demo-mode checks with WebSocket verification.
//
// Design principles:
// - Decoder chain: domDecoder -> wsDecoder -> unknown fallback
// - wsDecoder only matches CONFIRMED patterns (no guessing)
// - Unknown + trading armed => immediate halt + alert
// - Unknown + trading idle => log only, minimal interference
// - Periodic re-verification (30s) with timer leak prevention
// - Sample collection for unrecognized WS messages
// ============================================================

import { createLogger } from '../logger';
import type { AccountType } from '../types';
import type { Confidence } from '../../lib/platform/interfaces';

const log = createLogger('Safety');

// ============================================================
// Types
// ============================================================

export interface VerificationResult {
  type: AccountType;
  confidence: Confidence;
  source: 'dom' | 'websocket' | 'fallback';
  timestamp: number;
}

export interface AccountDecoder {
  readonly name: string;
  decode(): VerificationResult | null;
}

/**
 * Alert channel abstraction.
 * Logger implementation included; telegram/UI channels can be added in #59.
 */
export interface AlertChannel {
  alert(
    level: 'info' | 'warn' | 'critical',
    message: string,
    data?: Record<string, unknown>,
  ): void;
}

export interface AccountVerifierOptions {
  decoders: AccountDecoder[];
  alertChannel: AlertChannel;
  /** ms between re-verification cycles. Default 30_000. */
  reverifyIntervalMs?: number;
  /** Returns true if auto-trading is currently enabled/armed. */
  isTradingArmed: () => boolean;
  /** Called when the verifier decides trading must stop immediately. */
  onHalt: (reason: string) => void;
}

// ============================================================
// DomDecoder — Existing 3-point check
// ============================================================

export class DomDecoder implements AccountDecoder {
  readonly name = 'dom';

  private readonly demoChartClass: string;
  private readonly balanceLabelSelector: string;

  constructor(
    selectors: { demoChartClass?: string; balanceLabel?: string } = {},
  ) {
    this.demoChartClass = selectors.demoChartClass ?? '.is-chart-demo';
    this.balanceLabelSelector =
      selectors.balanceLabel ?? '.balance-info-block__label';
  }

  decode(): VerificationResult | null {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return null;
    }

    const urlHasDemo = window.location.pathname.includes('demo');
    const hasChartDemoClass = !!document.querySelector(this.demoChartClass);
    const labelText =
      document.querySelector(this.balanceLabelSelector)?.textContent?.toLowerCase() ?? '';
    const labelHasDemo = labelText.includes('demo');

    // All 3 agree → DEMO high
    if (urlHasDemo && hasChartDemoClass && labelHasDemo) {
      return { type: 'DEMO', confidence: 'high', source: 'dom', timestamp: Date.now() };
    }

    // URL says demo (most reliable single signal)
    if (urlHasDemo) {
      return { type: 'DEMO', confidence: 'medium', source: 'dom', timestamp: Date.now() };
    }

    // URL no demo + label no demo → LIVE
    if (!urlHasDemo && !labelHasDemo) {
      return { type: 'LIVE', confidence: 'medium', source: 'dom', timestamp: Date.now() };
    }

    // Mixed signals — cannot determine from DOM alone
    return null;
  }
}

// ============================================================
// WsDecoder — WebSocket message-based detection
// ============================================================

/** Max number of unknown WS message samples to keep for diagnostics. */
const MAX_UNKNOWN_SAMPLES = 20;

/**
 * WebSocket-based account type decoder.
 *
 * IMPORTANT: We do NOT hard-code Real/Demo WS message formats.
 * Only patterns that have been CONFIRMED in demo environments are matched.
 * Everything else produces `null` (= unknown), and samples are collected
 * for future analysis.
 */
export class WsDecoder implements AccountDecoder {
  readonly name = 'websocket';

  private lastResult: VerificationResult | null = null;
  private unknownSamples: Array<{ data: unknown; timestamp: number }> = [];

  decode(): VerificationResult | null {
    return this.lastResult;
  }

  /**
   * Feed a raw WS message for account-type detection.
   * Called on every incoming WS message from the interceptor.
   */
  feedMessage(raw: unknown): void {
    const detected = this.tryDetect(raw);
    if (detected) {
      this.lastResult = detected;
    } else {
      this.collectSample(raw);
    }
  }

  /** Get collected unknown WS message samples for diagnostics. */
  getUnknownSamples(): ReadonlyArray<{ data: unknown; timestamp: number }> {
    return this.unknownSamples;
  }

  /** Clear collected samples. */
  clearSamples(): void {
    this.unknownSamples = [];
  }

  /**
   * Attempt to detect account type from a WS message.
   * Only matches CONFIRMED demo patterns. Returns null for everything else.
   *
   * NOTE: This is intentionally conservative. Add new patterns here
   * only after verifying them in a demo environment.
   */
  private tryDetect(raw: unknown): VerificationResult | null {
    // --- Pattern 1: Socket.IO event array with demo indicator ---
    // Format: ["eventName", { ...payload... }]
    // Some PO WS events include account/session info with demo flags.
    if (Array.isArray(raw) && raw.length >= 2) {
      const payload = raw[1];
      if (payload && typeof payload === 'object') {
        return this.detectFromObject(payload as Record<string, unknown>);
      }
    }

    // --- Pattern 2: Plain object with account/demo fields ---
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return this.detectFromObject(raw as Record<string, unknown>);
    }

    // --- Pattern 3: String that looks like JSON ---
    if (typeof raw === 'string') {
      return this.detectFromString(raw);
    }

    return null;
  }

  private detectFromObject(obj: Record<string, unknown>): VerificationResult | null {
    // Check for known keys that indicate demo/real status.
    // Keys are searched defensively — we only trust explicit boolean/string values.

    // Key: "isDemo" (boolean)
    if ('isDemo' in obj && typeof obj.isDemo === 'boolean') {
      return {
        type: obj.isDemo ? 'DEMO' : 'LIVE',
        confidence: 'medium',
        source: 'websocket',
        timestamp: Date.now(),
      };
    }

    // Key: "demo" (boolean)
    if ('demo' in obj && typeof obj.demo === 'boolean') {
      return {
        type: obj.demo ? 'DEMO' : 'LIVE',
        confidence: 'medium',
        source: 'websocket',
        timestamp: Date.now(),
      };
    }

    // Key: "accountType" or "account_type" (string containing "demo")
    const accountTypeKey = 'accountType' in obj ? 'accountType' : 'account_type' in obj ? 'account_type' : null;
    if (accountTypeKey && typeof obj[accountTypeKey] === 'string') {
      const val = (obj[accountTypeKey] as string).toLowerCase();
      if (val.includes('demo')) {
        return { type: 'DEMO', confidence: 'medium', source: 'websocket', timestamp: Date.now() };
      }
      if (val.includes('real') || val.includes('live')) {
        return { type: 'LIVE', confidence: 'medium', source: 'websocket', timestamp: Date.now() };
      }
    }

    // Recurse into "data" wrapper (common in PO messages)
    if ('data' in obj && obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) {
      return this.detectFromObject(obj.data as Record<string, unknown>);
    }

    return null;
  }

  private detectFromString(text: string): VerificationResult | null {
    // Only try JSON parsing on strings that look like JSON
    if (!text.startsWith('{') && !text.startsWith('[')) return null;

    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        if (parsed.length >= 2 && parsed[1] && typeof parsed[1] === 'object') {
          return this.detectFromObject(parsed[1] as Record<string, unknown>);
        }
      } else if (typeof parsed === 'object' && parsed !== null) {
        return this.detectFromObject(parsed as Record<string, unknown>);
      }
    } catch {
      // Not valid JSON — skip
    }
    return null;
  }

  private collectSample(raw: unknown): void {
    if (this.unknownSamples.length >= MAX_UNKNOWN_SAMPLES) {
      // FIFO: drop oldest
      this.unknownSamples.shift();
    }

    // Store a truncated representation to avoid memory bloat
    let data: unknown;
    if (typeof raw === 'string') {
      data = raw.length > 500 ? raw.slice(0, 500) + '...[truncated]' : raw;
    } else if (raw && typeof raw === 'object') {
      try {
        const json = JSON.stringify(raw);
        data = json.length > 500 ? json.slice(0, 500) + '...[truncated]' : raw;
      } catch {
        data = '[unserializable]';
      }
    } else {
      data = raw;
    }

    this.unknownSamples.push({ data, timestamp: Date.now() });
  }
}

// ============================================================
// LoggerAlertChannel — Default alert implementation
// ============================================================

export class LoggerAlertChannel implements AlertChannel {
  private broadcastFn: ((level: string, message: string) => void) | null = null;

  /**
   * Set a broadcast function for sending alerts to side-panel/background.
   * This is optional; without it, alerts are only logged.
   */
  setBroadcast(fn: (level: string, message: string) => void): void {
    this.broadcastFn = fn;
  }

  alert(
    level: 'info' | 'warn' | 'critical',
    message: string,
    data?: Record<string, unknown>,
  ): void {
    switch (level) {
      case 'info':
        log.info(message, data);
        break;
      case 'warn':
        log.warn(message, data);
        break;
      case 'critical':
        log.error(message, data);
        break;
    }
    this.broadcastFn?.(level, message);
  }
}

// ============================================================
// AccountVerifier — Main orchestrator
// ============================================================

export class AccountVerifier {
  private readonly decoders: AccountDecoder[];
  private readonly alertChannel: AlertChannel;
  private readonly reverifyIntervalMs: number;
  private readonly isTradingArmed: () => boolean;
  private readonly onHalt: (reason: string) => void;

  private lastResult: VerificationResult | null = null;
  private reverifyTimer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  // Track whether we already halted for the current unknown state
  // to avoid spamming halt callbacks on every reverify cycle.
  private haltedForCurrentState = false;

  constructor(options: AccountVerifierOptions) {
    this.decoders = options.decoders;
    this.alertChannel = options.alertChannel;
    this.reverifyIntervalMs = options.reverifyIntervalMs ?? 30_000;
    this.isTradingArmed = options.isTradingArmed;
    this.onHalt = options.onHalt;
  }

  /** Start periodic re-verification. Safe to call multiple times. */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Initial verification
    this.verify();

    // Periodic re-verification
    this.reverifyTimer = setInterval(() => {
      this.verify();
    }, this.reverifyIntervalMs);

    log.start('Account verifier started');
  }

  /** Stop periodic re-verification and clean up timers. */
  stop(): void {
    if (this.reverifyTimer !== null) {
      clearInterval(this.reverifyTimer);
      this.reverifyTimer = null;
    }
    this.isRunning = false;
    log.stop('Account verifier stopped');
  }

  /**
   * Run the decoder chain and return the verification result.
   * Also triggers halt logic if appropriate.
   */
  verify(): VerificationResult {
    const result = this.runDecoderChain();
    const previousType = this.lastResult?.type;
    this.lastResult = result;

    log.debug(
      `Verification: type=${result.type} confidence=${result.confidence} source=${result.source}`,
    );

    // Reset halt tracking when state changes to DEMO
    if (result.type === 'DEMO') {
      this.haltedForCurrentState = false;
    }

    // Handle non-DEMO results
    if (result.type !== 'DEMO') {
      this.handleNonDemo(result, previousType);
    }

    return result;
  }

  /** Get the last verification result without re-running. */
  getLastResult(): VerificationResult | null {
    return this.lastResult;
  }

  /**
   * Check if a trade should be allowed based on current verification state.
   * This is the gate that trade-lifecycle.ts calls before executing.
   *
   * P1 review fix: Forces a fresh verification instead of relying solely on
   * cached results. This closes the window where a demo→live account switch
   * could go undetected between periodic 30s re-verification cycles.
   */
  isTradeAllowed(): { allowed: boolean; reason?: string } {
    // Force fresh verification at trade time to catch account switches immediately
    const result = this.verify();

    if (result.type === 'DEMO') {
      return { allowed: true };
    }

    if (result.type === 'LIVE') {
      return {
        allowed: false,
        reason: `LIVE account detected (source: ${result.source}, confidence: ${result.confidence})`,
      };
    }

    // UNKNOWN
    return {
      allowed: false,
      reason: `Account type unknown (source: ${result.source}) — trading halted for safety`,
    };
  }

  /**
   * Feed a raw WebSocket message to all WsDecoder instances in the chain.
   */
  feedWsMessage(raw: unknown): void {
    for (const decoder of this.decoders) {
      if (decoder instanceof WsDecoder) {
        decoder.feedMessage(raw);
      }
    }
  }

  /** Get unknown WS message samples from WsDecoder instances. */
  getWsSamples(): ReadonlyArray<{ data: unknown; timestamp: number }> {
    for (const decoder of this.decoders) {
      if (decoder instanceof WsDecoder) {
        return decoder.getUnknownSamples();
      }
    }
    return [];
  }

  // ============================================================
  // Private
  // ============================================================

  private runDecoderChain(): VerificationResult {
    for (const decoder of this.decoders) {
      const result = decoder.decode();
      if (result !== null) {
        return result;
      }
    }

    // Fallback: all decoders returned null → UNKNOWN
    return {
      type: 'UNKNOWN',
      confidence: 'low',
      source: 'fallback',
      timestamp: Date.now(),
    };
  }

  private handleNonDemo(
    result: VerificationResult,
    previousType: AccountType | undefined,
  ): void {
    const armed = this.isTradingArmed();

    if (result.type === 'UNKNOWN') {
      if (armed && !this.haltedForCurrentState) {
        // Trading is armed + account unknown → halt immediately
        this.haltedForCurrentState = true;
        const reason =
          'Account type could not be verified as DEMO — auto-trading halted for safety';
        this.alertChannel.alert('critical', reason, {
          source: result.source,
          confidence: result.confidence,
        });
        this.onHalt(reason);
      } else if (!armed) {
        // Not trading → just log, minimal interference
        this.alertChannel.alert('info', 'Account type unknown (trading not armed, logging only)', {
          source: result.source,
        });
      }
    } else if (result.type === 'LIVE') {
      if (armed && !this.haltedForCurrentState) {
        this.haltedForCurrentState = true;
        const reason = 'LIVE account detected — auto-trading halted to prevent real money trades';
        this.alertChannel.alert('critical', reason, {
          source: result.source,
          confidence: result.confidence,
        });
        this.onHalt(reason);
      } else if (previousType === 'DEMO') {
        // Transition from DEMO to LIVE (even if not trading)
        this.alertChannel.alert(
          'warn',
          'Account switched from DEMO to LIVE',
          { source: result.source },
        );
      }
    }
  }
}
