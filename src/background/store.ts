// ============================================================
// Background State Store
// ============================================================
// Minimal store wrapper for background service worker globals.
// Provides getState/setState/subscribe for observability and
// test isolation. No external dependencies.
// Refs #60
// ============================================================

import type { TradingStatus } from '../lib/types';

export interface BackgroundState {
  tradingStatus: TradingStatus;
}

export const INITIAL_BACKGROUND_STATE: BackgroundState = {
  tradingStatus: {
    isRunning: false,
    currentTicker: undefined,
    balance: undefined,
    sessionId: undefined,
  },
};

type Listener<T> = (state: T, prev: T) => void;

export interface Store<T> {
  /** Current state snapshot (mutable reference — treat as read-only) */
  getState(): T;
  /** Shallow-merge partial into state, then notify subscribers */
  setState(partial: Partial<T> | ((prev: T) => Partial<T>)): void;
  /** Register a change listener. Returns an unsubscribe function. */
  subscribe(listener: Listener<T>): () => void;
  /** Reset state to initial values and clear all subscribers */
  reset(): void;
  /** Clear subscribers without resetting state */
  destroy(): void;
}

function cloneState(s: BackgroundState): BackgroundState {
  return { tradingStatus: { ...s.tradingStatus } };
}

/**
 * Create an isolated store instance.
 * Use `createStore()` in tests for full isolation.
 */
export function createStore(
  initialOverrides?: Partial<BackgroundState>,
): Store<BackgroundState> {
  const baseState: BackgroundState = {
    tradingStatus: {
      ...INITIAL_BACKGROUND_STATE.tradingStatus,
      ...initialOverrides?.tradingStatus,
    },
  };

  let state = cloneState(baseState);
  const listeners = new Set<Listener<BackgroundState>>();

  return {
    getState() {
      return state;
    },

    setState(partial) {
      const prev = state;
      const changes = typeof partial === 'function' ? partial(prev) : partial;
      state = { ...prev, ...changes };

      for (const listener of listeners) {
        try {
          listener(state, prev);
        } catch (e) {
          console.error('[Store] Listener threw:', e);
        }
      }
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    reset() {
      state = cloneState(baseState);
      listeners.clear();
    },

    destroy() {
      listeners.clear();
    },
  };
}

/** Singleton store for the background service worker */
export const backgroundStore = createStore();
