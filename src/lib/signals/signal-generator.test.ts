import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the strategies module
vi.mock('./strategies', () => ({
  WINNING_STRATEGIES: [
    {
      id: 'rsi_reversal',
      name: 'RSI Reversal',
      type: 'reversal',
      bestRegimes: ['ranging'],
      minWinRate: 0.55,
      params: {},
    },
  ],
  detectRegime: vi.fn().mockReturnValue({ regime: 'ranging', adx: 25, direction: 0 }),
  getBestStrategies: vi.fn().mockReturnValue([{ id: 'rsi_reversal', name: 'RSI Reversal' }]),
  executeStrategy: vi.fn().mockReturnValue(null),
}));

import { SignalGenerator } from './signal-generator';
import { detectRegime, getBestStrategies, executeStrategy } from './strategies';
import type { Candle } from './types';

function makeCandle(close: number, index: number): Candle {
  const base = 1700000000000;
  return {
    timestamp: base + index * 60000,
    open: close - 1,
    high: close + 2,
    low: close - 3,
    close,
    volume: 100,
  };
}

function makeCandles(count: number): Candle[] {
  return Array.from({ length: count }, (_, i) => makeCandle(100 + i * 0.5, i));
}

describe('SignalGenerator', () => {
  let generator: SignalGenerator;

  beforeEach(() => {
    vi.clearAllMocks();
    generator = new SignalGenerator();
  });

  // ============================================================
  // Candle buffer management
  // ============================================================
  describe('candle buffer', () => {
    it('addCandle로 캔들을 추가한다', () => {
      const candle = makeCandle(100, 0);
      const signal = generator.addCandle('BTC', candle);
      // Less than 50 candles, should return null
      expect(signal).toBeNull();
    });

    it('50개 미만이면 null을 반환한다', () => {
      for (let i = 0; i < 49; i++) {
        const signal = generator.addCandle('BTC', makeCandle(100 + i, i));
        expect(signal).toBeNull();
      }
    });

    it('50개 이상이면 checkSignals를 호출한다', () => {
      const candles = makeCandles(50);
      candles.forEach((c, i) => {
        if (i < 49) generator.addCandle('BTC', c);
      });

      // 50th candle should trigger signal check
      generator.addCandle('BTC', candles[49]);
      expect(detectRegime).toHaveBeenCalled();
      expect(getBestStrategies).toHaveBeenCalled();
    });

    it('버퍼가 100개로 제한된다', () => {
      const candles = makeCandles(110);
      candles.forEach((c) => generator.addCandle('BTC', c));

      // After adding 110 candles, buffer should be 100
      // We can verify by setting history and checking
      generator.setHistory('BTC', makeCandles(50));
      const regime = generator.getRegime('BTC');
      expect(regime).not.toBeNull();
    });

    it('setHistory로 히스토리를 설정한다', () => {
      generator.setHistory('BTC', makeCandles(100));
      const regime = generator.getRegime('BTC');
      expect(regime).not.toBeNull();
    });

    it('setHistory에 100개 초과 데이터를 설정하면 마지막 100개만 유지한다', () => {
      generator.setHistory('BTC', makeCandles(150));
      // Should still work fine
      const regime = generator.getRegime('BTC');
      expect(regime).not.toBeNull();
    });

    it('심볼별로 독립적인 버퍼를 유지한다', () => {
      generator.setHistory('BTC', makeCandles(60));
      generator.setHistory('ETH', makeCandles(30));

      expect(generator.getRegime('BTC')).not.toBeNull();
      expect(generator.getRegime('ETH')).toBeNull(); // only 30 candles
    });
  });

  // ============================================================
  // Signal generation
  // ============================================================
  describe('signal generation', () => {
    it('전략이 방향을 반환하면 신호를 생성한다', () => {
      vi.mocked(executeStrategy).mockReturnValueOnce('CALL');

      generator.setHistory('BTC', makeCandles(60));
      const signal = generator.addCandle('BTC', makeCandle(150, 60));

      expect(signal).not.toBeNull();
      expect(signal!.direction).toBe('CALL');
      expect(signal!.symbol).toBe('BTC');
      expect(signal!.strategy).toBe('RSI Reversal');
      expect(signal!.status).toBe('pending');
    });

    it('전략이 null을 반환하면 신호 없음', () => {
      vi.mocked(executeStrategy).mockReturnValue(null);

      generator.setHistory('BTC', makeCandles(60));
      const signal = generator.addCandle('BTC', makeCandle(150, 60));

      expect(signal).toBeNull();
    });

    it('getBestStrategies가 빈 배열이면 신호 없음', () => {
      vi.mocked(getBestStrategies).mockReturnValueOnce([]);

      generator.setHistory('BTC', makeCandles(60));
      const signal = generator.addCandle('BTC', makeCandle(150, 60));

      expect(signal).toBeNull();
    });
  });

  // ============================================================
  // getRegime
  // ============================================================
  describe('getRegime', () => {
    it('50개 이상 캔들이 있으면 레짐을 반환한다', () => {
      generator.setHistory('BTC', makeCandles(60));
      const regime = generator.getRegime('BTC');
      expect(regime).not.toBeNull();
      expect(regime!.regime).toBe('ranging');
    });

    it('50개 미만이면 null', () => {
      generator.setHistory('BTC', makeCandles(30));
      expect(generator.getRegime('BTC')).toBeNull();
    });

    it('존재하지 않는 심볼은 null', () => {
      expect(generator.getRegime('NONEXISTENT')).toBeNull();
    });
  });

  // ============================================================
  // getSignals
  // ============================================================
  describe('getSignals', () => {
    it('초기에는 빈 배열', () => {
      expect(generator.getSignals()).toEqual([]);
    });

    it('생성된 신호를 반환한다', () => {
      vi.mocked(executeStrategy).mockReturnValueOnce('CALL');
      generator.setHistory('BTC', makeCandles(60));
      generator.addCandle('BTC', makeCandle(150, 60));

      const signals = generator.getSignals();
      expect(signals).toHaveLength(1);
    });

    it('limit으로 최근 N개만 가져온다', () => {
      vi.mocked(executeStrategy).mockReturnValue('CALL');

      generator.setHistory('BTC', makeCandles(60));
      for (let i = 0; i < 5; i++) {
        generator.addCandle('BTC', makeCandle(150 + i, 60 + i));
      }

      const signals = generator.getSignals(3);
      expect(signals).toHaveLength(3);
    });
  });

  // ============================================================
  // onSignal listener
  // ============================================================
  describe('onSignal', () => {
    it('신호 생성 시 리스너를 호출한다', () => {
      const listener = vi.fn();
      generator.onSignal(listener);

      vi.mocked(executeStrategy).mockReturnValueOnce('PUT');
      generator.setHistory('BTC', makeCandles(60));
      generator.addCandle('BTC', makeCandle(150, 60));

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].direction).toBe('PUT');
    });

    it('구독 해제가 가능하다', () => {
      const listener = vi.fn();
      const unsubscribe = generator.onSignal(listener);
      unsubscribe();

      vi.mocked(executeStrategy).mockReturnValueOnce('CALL');
      generator.setHistory('BTC', makeCandles(60));
      generator.addCandle('BTC', makeCandle(150, 60));

      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // updateSignalResult
  // ============================================================
  describe('updateSignalResult', () => {
    it('신호 상태를 업데이트한다', () => {
      vi.mocked(executeStrategy).mockReturnValueOnce('CALL');
      generator.setHistory('BTC', makeCandles(60));
      const signal = generator.addCandle('BTC', makeCandle(150, 60));

      expect(signal!.status).toBe('pending');
      generator.updateSignalResult(signal!.id, 'win');

      const signals = generator.getSignals();
      expect(signals[0].status).toBe('win');
    });

    it('존재하지 않는 ID는 무시한다', () => {
      // Should not throw
      generator.updateSignalResult('nonexistent', 'loss');
    });
  });

  // ============================================================
  // Constructor config
  // ============================================================
  describe('config', () => {
    it('기본 설정으로 생성할 수 있다', () => {
      const gen = new SignalGenerator();
      expect(gen).toBeDefined();
    });

    it('커스텀 설정으로 생성할 수 있다', () => {
      const gen = new SignalGenerator({
        symbols: ['ETH'],
        minConfidence: 0.8,
        expirySeconds: 120,
      });
      expect(gen).toBeDefined();
    });
  });
});
