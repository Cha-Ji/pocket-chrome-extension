import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createStore,
  INITIAL_BACKGROUND_STATE,
  type BackgroundState,
  type Store,
} from './store';

describe('createStore', () => {
  let store: Store<BackgroundState>;

  beforeEach(() => {
    store = createStore();
  });

  // ── getState ──────────────────────────────────────────────

  describe('getState', () => {
    it('returns initial state', () => {
      expect(store.getState()).toEqual(INITIAL_BACKGROUND_STATE);
    });

    it('applies initial overrides', () => {
      const s = createStore({
        tradingStatus: { isRunning: true, balance: 1000 },
      } as Partial<BackgroundState>);

      expect(s.getState().tradingStatus.isRunning).toBe(true);
      expect(s.getState().tradingStatus.balance).toBe(1000);
      // Unspecified fields inherit from defaults
      expect(s.getState().tradingStatus.currentTicker).toBeUndefined();
    });
  });

  // ── setState ──────────────────────────────────────────────

  describe('setState', () => {
    it('updates state with an object', () => {
      store.setState({
        tradingStatus: { ...store.getState().tradingStatus, isRunning: true },
      });
      expect(store.getState().tradingStatus.isRunning).toBe(true);
    });

    it('updates state with an updater function', () => {
      store.setState((prev) => ({
        tradingStatus: { ...prev.tradingStatus, balance: 500 },
      }));
      expect(store.getState().tradingStatus.balance).toBe(500);
    });

    it('preserves unrelated fields on sequential updates', () => {
      store.setState((s) => ({
        tradingStatus: { ...s.tradingStatus, isRunning: true, balance: 100 },
      }));
      store.setState((s) => ({
        tradingStatus: { ...s.tradingStatus, currentTicker: 'EURUSD' },
      }));

      const status = store.getState().tradingStatus;
      expect(status.isRunning).toBe(true);
      expect(status.balance).toBe(100);
      expect(status.currentTicker).toBe('EURUSD');
    });
  });

  // ── subscribe ─────────────────────────────────────────────

  describe('subscribe', () => {
    it('notifies listener with next and prev state', () => {
      const listener = vi.fn();
      store.subscribe(listener);

      store.setState((s) => ({
        tradingStatus: { ...s.tradingStatus, isRunning: true },
      }));

      expect(listener).toHaveBeenCalledOnce();
      const [next, prev] = listener.mock.calls[0];
      expect(next.tradingStatus.isRunning).toBe(true);
      expect(prev.tradingStatus.isRunning).toBe(false);
    });

    it('supports multiple listeners', () => {
      const l1 = vi.fn();
      const l2 = vi.fn();
      store.subscribe(l1);
      store.subscribe(l2);

      store.setState((s) => ({
        tradingStatus: { ...s.tradingStatus, isRunning: true },
      }));

      expect(l1).toHaveBeenCalledOnce();
      expect(l2).toHaveBeenCalledOnce();
    });

    it('returns an unsubscribe function', () => {
      const listener = vi.fn();
      const unsub = store.subscribe(listener);

      unsub();

      store.setState((s) => ({
        tradingStatus: { ...s.tradingStatus, isRunning: true },
      }));

      expect(listener).not.toHaveBeenCalled();
    });

    it('listener error does not break other listeners', () => {
      const bad = vi.fn(() => {
        throw new Error('boom');
      });
      const good = vi.fn();
      vi.spyOn(console, 'error').mockImplementation(() => {});

      store.subscribe(bad);
      store.subscribe(good);

      store.setState((s) => ({
        tradingStatus: { ...s.tradingStatus, isRunning: true },
      }));

      expect(bad).toHaveBeenCalledOnce();
      expect(good).toHaveBeenCalledOnce();
    });

    it('tracks multiple sequential changes', () => {
      const listener = vi.fn();
      store.subscribe(listener);

      store.setState((s) => ({
        tradingStatus: { ...s.tradingStatus, isRunning: true },
      }));
      store.setState((s) => ({
        tradingStatus: { ...s.tradingStatus, balance: 100 },
      }));
      store.setState((s) => ({
        tradingStatus: { ...s.tradingStatus, sessionId: 42 },
      }));

      expect(listener).toHaveBeenCalledTimes(3);

      // Last call should reflect cumulative state
      const [latest] = listener.mock.calls[2];
      expect(latest.tradingStatus).toEqual({
        isRunning: true,
        balance: 100,
        sessionId: 42,
        currentTicker: undefined,
      });
    });
  });

  // ── reset ─────────────────────────────────────────────────

  describe('reset', () => {
    it('restores initial state', () => {
      store.setState((s) => ({
        tradingStatus: { ...s.tradingStatus, isRunning: true, balance: 999 },
      }));

      store.reset();

      expect(store.getState()).toEqual(INITIAL_BACKGROUND_STATE);
    });

    it('clears all listeners', () => {
      const listener = vi.fn();
      store.subscribe(listener);

      store.reset();

      store.setState((s) => ({
        tradingStatus: { ...s.tradingStatus, isRunning: true },
      }));

      expect(listener).not.toHaveBeenCalled();
    });

    it('respects initial overrides on reset', () => {
      const s = createStore({
        tradingStatus: { balance: 500 },
      } as Partial<BackgroundState>);

      s.setState((prev) => ({
        tradingStatus: { ...prev.tradingStatus, balance: 999 },
      }));
      s.reset();

      expect(s.getState().tradingStatus.balance).toBe(500);
    });
  });

  // ── isolation ─────────────────────────────────────────────

  describe('isolation', () => {
    it('independent instances do not share state', () => {
      const s1 = createStore();
      const s2 = createStore();

      s1.setState((s) => ({
        tradingStatus: { ...s.tradingStatus, isRunning: true },
      }));

      expect(s1.getState().tradingStatus.isRunning).toBe(true);
      expect(s2.getState().tradingStatus.isRunning).toBe(false);
    });

    it('independent instances do not share subscribers', () => {
      const s1 = createStore();
      const s2 = createStore();
      const listener = vi.fn();

      s1.subscribe(listener);

      s2.setState((s) => ({
        tradingStatus: { ...s.tradingStatus, isRunning: true },
      }));

      expect(listener).not.toHaveBeenCalled();
    });

    it('reset of one instance does not affect another', () => {
      const s1 = createStore();
      const s2 = createStore();

      s1.setState((s) => ({
        tradingStatus: { ...s.tradingStatus, balance: 100 },
      }));
      s2.setState((s) => ({
        tradingStatus: { ...s.tradingStatus, balance: 200 },
      }));

      s1.reset();

      expect(s1.getState().tradingStatus.balance).toBeUndefined();
      expect(s2.getState().tradingStatus.balance).toBe(200);
    });
  });

  // ── destroy ───────────────────────────────────────────────

  describe('destroy', () => {
    it('clears listeners but preserves state', () => {
      store.setState((s) => ({
        tradingStatus: { ...s.tradingStatus, isRunning: true },
      }));

      const listener = vi.fn();
      store.subscribe(listener);

      store.destroy();

      store.setState((s) => ({
        tradingStatus: { ...s.tradingStatus, balance: 100 },
      }));

      expect(listener).not.toHaveBeenCalled();
      expect(store.getState().tradingStatus.isRunning).toBe(true);
      expect(store.getState().tradingStatus.balance).toBe(100);
    });
  });
});
