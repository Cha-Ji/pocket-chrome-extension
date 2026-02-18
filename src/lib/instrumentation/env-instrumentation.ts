// ============================================================
// Environment Instrumentation — Orchestrator
// ============================================================
// Manages the debug flag, wires DOM/WS snapshot collectors,
// and exposes a console API via window.pqEnvDebug.
// ALL instrumentation is OFF by default. Zero overhead when disabled.
// ============================================================

import { detectEnvironment, type PocketOptionEnvironment } from './env-detect';
import { captureDOMSnapshot, type DOMSnapshotResult } from './dom-snapshot';
import { WSSchemaCollector, type WSSnapshotResult } from './ws-snapshot';
import { createLogger } from '../logger';

const logger = createLogger('EnvDebug');

const STORAGE_KEY = 'pq-env-debug-enabled';

export interface EnvSnapshotExport {
  exportedAt: number;
  environment: PocketOptionEnvironment;
  dom: DOMSnapshotResult | null;
  ws: WSSnapshotResult | null;
}

/**
 * Main instrumentation controller.
 * Singleton — use `getEnvInstrumentation()`.
 */
class EnvInstrumentation {
  private _enabled = false;
  private wsCollector = new WSSchemaCollector();
  private lastDOMSnapshot: DOMSnapshotResult | null = null;
  private _wsUnsubscribe: (() => void) | null = null;

  private static instance: EnvInstrumentation | null = null;

  static getInstance(): EnvInstrumentation {
    if (!EnvInstrumentation.instance) {
      EnvInstrumentation.instance = new EnvInstrumentation();
    }
    return EnvInstrumentation.instance;
  }

  private constructor() {
    // Restore previous enabled state from localStorage
    this.loadState();
  }

  /** Whether instrumentation is currently active. */
  get enabled(): boolean {
    return this._enabled;
  }

  /** Current detected environment. */
  get environment(): PocketOptionEnvironment {
    return detectEnvironment().environment;
  }

  // ─── Public API (exposed via window.pqEnvDebug) ───

  /** Enable instrumentation. Starts collecting WS schemas. */
  enable(): void {
    if (this._enabled) {
      logger.info('Already enabled');
      return;
    }
    this._enabled = true;
    this.saveState();
    logger.start('Environment instrumentation ENABLED');
    logger.info(`Detected environment: ${this.environment}`);
  }

  /** Disable instrumentation and clear all collected data. */
  disable(): void {
    this._enabled = false;
    this.wsCollector.clear();
    this.lastDOMSnapshot = null;
    this.saveState();
    if (this._wsUnsubscribe) {
      this._wsUnsubscribe();
      this._wsUnsubscribe = null;
    }
    logger.stop('Environment instrumentation DISABLED — data cleared');
  }

  /** Capture a DOM snapshot right now. */
  captureDOM(): DOMSnapshotResult {
    const env = detectEnvironment().environment;
    this.lastDOMSnapshot = captureDOMSnapshot(env);
    logger.info('DOM snapshot captured', {
      environment: env,
      selectorCount: Object.keys(this.lastDOMSnapshot.selectors).length,
    });
    return this.lastDOMSnapshot;
  }

  /**
   * Record a WS message (called from content-script WS hook).
   * No-op if instrumentation is disabled.
   */
  recordWSMessage(
    parsed: unknown,
    rawText: string | null | undefined,
    rawSize: number,
    frameType: 'text' | 'binary' | 'unknown' = 'unknown',
  ): void {
    if (!this._enabled) return;
    this.wsCollector.record(parsed, rawText, rawSize, frameType);
  }

  /** Export all collected data as a JSON-serializable object. */
  buildExport(): EnvSnapshotExport {
    const env = detectEnvironment().environment;
    return {
      exportedAt: Date.now(),
      environment: env,
      dom: this.lastDOMSnapshot,
      ws: this.wsCollector.snapshot(env),
    };
  }

  /**
   * Export and copy to clipboard (if available), otherwise log to console.
   * Returns the export object.
   */
  async export(): Promise<EnvSnapshotExport> {
    // Auto-capture DOM at export time
    this.captureDOM();

    const data = this.buildExport();
    const json = JSON.stringify(data, null, 2);

    // Try clipboard API
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(json);
        logger.success('Snapshot exported to clipboard!');
      } catch {
        logger.warn('Clipboard write failed — logging to console instead');
        console.log('[PO EnvDebug Export]', json);
      }
    } else {
      console.log('[PO EnvDebug Export]', json);
    }

    return data;
  }

  /** Show current status in console. */
  status(): void {
    const detection = detectEnvironment();
    console.log('%c[PO] Environment Instrumentation Status', 'color: #0ff; font-weight: bold');
    console.table({
      enabled: this._enabled,
      environment: detection.environment,
      confidence: detection.confidence,
      wsEntriesCollected: this.wsCollector.size,
      hasDOMSnapshot: this.lastDOMSnapshot !== null,
      signals: detection.signals,
    });
  }

  /** Getter for WS collector (for wiring from outside). */
  getWSCollector(): WSSchemaCollector {
    return this.wsCollector;
  }

  // ─── Persistence ───

  private loadState(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      this._enabled = localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      // Ignore
    }
  }

  private saveState(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, String(this._enabled));
    } catch {
      // Ignore
    }
  }
}

export function getEnvInstrumentation(): EnvInstrumentation {
  return EnvInstrumentation.getInstance();
}

/**
 * Install console API on `window.pqEnvDebug`.
 * Called once from content-script initialization.
 * Safe to call in non-browser environments (no-op).
 */
export function installEnvDebugConsoleAPI(): void {
  if (typeof window === 'undefined') return;

  const inst = getEnvInstrumentation();

  (window as any).pqEnvDebug = {
    enable: () => inst.enable(),
    disable: () => inst.disable(),
    captureDOM: () => inst.captureDOM(),
    export: () => inst.export(),
    status: () => inst.status(),
    detect: () => {
      const result = detectEnvironment();
      console.table(result);
      return result;
    },
  };
}
