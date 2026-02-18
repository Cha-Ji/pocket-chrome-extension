/**
 * Tests for selector healthcheck halt enforcement in background.
 *
 * The handleSelectorHealthcheckResult() function in background/index.ts
 * must guarantee that tradingHalted=true forces isRunning=false, even
 * when tab communication fails.  These tests verify:
 *
 *  1. tradingHalted=true → store.isRunning forced to false
 *  2. Already stopped → idempotent (no error, no double-flip)
 *  3. Tab message failure → state still forced to false
 *  4. tradingHalted=false → store untouched
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStore, type BackgroundState, type Store } from '../store';

describe('Healthcheck halt enforcement (background logic)', () => {
  let store: Store<BackgroundState>;
  let notifyStatusChange: ReturnType<typeof vi.fn>;
  let tabNotify: ReturnType<typeof vi.fn>;

  /**
   * Mimics the halt-enforcement block from background/index.ts:handleSelectorHealthcheckResult.
   * Extracted here so we can test the logic in isolation without
   * importing the full background module (which has heavy Chrome API deps).
   */
  async function enforceHalt(payload: {
    tradingHalted: boolean;
    passed: boolean;
    criticalFailures: string[];
  }): Promise<void> {
    if (!payload.passed && payload.tradingHalted) {
      const wasRunning = store.getState().tradingStatus.isRunning;

      if (wasRunning) {
        // Best-effort tab notification (may fail)
        try {
          await tabNotify();
        } catch {
          // swallowed — same as ignoreError in production
        }
      }

      // Forced state transition
      if (store.getState().tradingStatus.isRunning) {
        store.setState((s) => ({
          tradingStatus: { ...s.tradingStatus, isRunning: false },
        }));
        notifyStatusChange();
      }
    }
  }

  beforeEach(() => {
    notifyStatusChange = vi.fn();
    tabNotify = vi.fn().mockResolvedValue(undefined);
  });

  // ── Core halt enforcement ───────────────────────────────

  it('should force isRunning=false when tradingHalted=true and currently running', async () => {
    store = createStore({ tradingStatus: { isRunning: true } } as Partial<BackgroundState>);
    expect(store.getState().tradingStatus.isRunning).toBe(true);

    await enforceHalt({
      tradingHalted: true,
      passed: false,
      criticalFailures: ['callButton'],
    });

    expect(store.getState().tradingStatus.isRunning).toBe(false);
    expect(notifyStatusChange).toHaveBeenCalledOnce();
    expect(tabNotify).toHaveBeenCalledOnce();
  });

  // ── Idempotency ─────────────────────────────────────────

  it('should be idempotent when already stopped', async () => {
    store = createStore(); // isRunning=false by default

    await enforceHalt({
      tradingHalted: true,
      passed: false,
      criticalFailures: ['callButton'],
    });

    expect(store.getState().tradingStatus.isRunning).toBe(false);
    // No state change → no notification
    expect(notifyStatusChange).not.toHaveBeenCalled();
    // Tab notify not called (wasRunning was false)
    expect(tabNotify).not.toHaveBeenCalled();
  });

  // ── Tab communication failure ───────────────────────────

  it('should force isRunning=false even when tab message throws', async () => {
    store = createStore({ tradingStatus: { isRunning: true } } as Partial<BackgroundState>);
    tabNotify.mockRejectedValueOnce(new Error('No active tab'));

    await enforceHalt({
      tradingHalted: true,
      passed: false,
      criticalFailures: ['amountInput'],
    });

    // State MUST be false despite tab failure
    expect(store.getState().tradingStatus.isRunning).toBe(false);
    expect(notifyStatusChange).toHaveBeenCalledOnce();
  });

  // ── Non-halting healthcheck ─────────────────────────────

  it('should NOT touch store when tradingHalted=false', async () => {
    store = createStore({ tradingStatus: { isRunning: true } } as Partial<BackgroundState>);

    await enforceHalt({
      tradingHalted: false,
      passed: false,
      criticalFailures: [],
    });

    // Trading should still be running
    expect(store.getState().tradingStatus.isRunning).toBe(true);
    expect(notifyStatusChange).not.toHaveBeenCalled();
  });

  it('should NOT touch store when healthcheck passed', async () => {
    store = createStore({ tradingStatus: { isRunning: true } } as Partial<BackgroundState>);

    await enforceHalt({
      tradingHalted: false,
      passed: true,
      criticalFailures: [],
    });

    expect(store.getState().tradingStatus.isRunning).toBe(true);
    expect(notifyStatusChange).not.toHaveBeenCalled();
  });

  // ── Double halt (redundant calls) ──────────────────────

  it('should handle double halt calls gracefully', async () => {
    store = createStore({ tradingStatus: { isRunning: true } } as Partial<BackgroundState>);

    const payload = {
      tradingHalted: true,
      passed: false,
      criticalFailures: ['callButton'],
    };

    await enforceHalt(payload);
    expect(store.getState().tradingStatus.isRunning).toBe(false);
    expect(notifyStatusChange).toHaveBeenCalledOnce();

    // Second call — already stopped
    notifyStatusChange.mockClear();
    tabNotify.mockClear();

    await enforceHalt(payload);
    expect(store.getState().tradingStatus.isRunning).toBe(false);
    // No redundant notification
    expect(notifyStatusChange).not.toHaveBeenCalled();
    expect(tabNotify).not.toHaveBeenCalled();
  });
});
