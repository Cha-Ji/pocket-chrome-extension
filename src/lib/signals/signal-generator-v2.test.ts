import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SignalGeneratorV2, generateLLMReport } from './signal-generator-v2';
import { Candle, Signal, MarketRegime } from './types';

// strategies의 detectRegime를 모킹 (내부에서 사용)
vi.mock('./strategies', () => ({
  detectRegime: vi.fn().mockReturnValue({ regime: 'ranging', adx: 15, direction: 0 }),
}));

// high-winrate 전략들을 모킹
vi.mock('../backtest/strategies/high-winrate', () => ({
  rsiBBBounceStrategy: vi.fn().mockReturnValue(null),
  voteStrategy: vi.fn().mockReturnValue(null),
  emaTrendRsiPullbackStrategy: vi.fn().mockReturnValue(null),
  tripleConfirmationStrategy: vi.fn().mockReturnValue(null),
}));

// zmr-60 전략을 모킹
vi.mock('../backtest/strategies/zmr-60', () => ({
  zmr60WithHighWinRateConfig: vi
    .fn()
    .mockReturnValue({ signal: null, confidence: 0, reason: 'No signal', indicators: {} }),
}));

// trend-strategies 모킹
vi.mock('./trend-strategies', () => ({
  selectTrendStrategy: vi.fn().mockReturnValue(null),
}));

// ============================================================
// 헬퍼: 테스트용 캔들 데이터 생성
// ============================================================

function makeCandle(
  close: number,
  timestamp: number = Date.now(),
  partial?: Partial<Candle>,
): Candle {
  return {
    timestamp,
    open: close - 1,
    high: close + 2,
    low: close - 2,
    close,
    volume: 100,
    ...partial,
  };
}

function generateCandles(count: number, basePrice: number = 50000): Candle[] {
  const candles: Candle[] = [];
  let price = basePrice;
  for (let i = 0; i < count; i++) {
    price += (Math.random() - 0.5) * 5;
    candles.push(makeCandle(price, 1000000 + i * 60000));
  }
  return candles;
}

describe('SignalGeneratorV2', () => {
  let generator: SignalGeneratorV2;

  beforeEach(() => {
    vi.clearAllMocks();
    generator = new SignalGeneratorV2({
      minConfidence: 0.1,
    });
  });

  // ============================================================
  // 캔들 버퍼 관리
  // ============================================================

  describe('캔들 버퍼 관리', () => {
    it('addCandle로 캔들을 추가할 수 있다', () => {
      const candle = makeCandle(50000, 1000000);
      const result = generator.addCandle('BTCUSDT', candle);
      // 50개 미만이므로 null
      expect(result).toBeNull();
    });

    it('버퍼 크기가 250개로 제한된다', () => {
      const candles = generateCandles(300);
      for (const candle of candles) {
        generator.addCandle('BTCUSDT', candle);
      }
      const buffer = (generator as any).candleBuffer.get('BTCUSDT');
      expect(buffer.length).toBeLessThanOrEqual(250);
    });

    it('setHistory로 히스토리를 설정할 수 있다', () => {
      const candles = generateCandles(300);
      generator.setHistory('BTCUSDT', candles);
      const buffer = (generator as any).candleBuffer.get('BTCUSDT');
      expect(buffer).toHaveLength(250); // 최대 250개만 유지 (SBB-120: 140 필요)
    });

    it('setHistory에 100개 이하 데이터도 정상 동작한다', () => {
      const candles = generateCandles(30);
      generator.setHistory('BTCUSDT', candles);
      const buffer = (generator as any).candleBuffer.get('BTCUSDT');
      expect(buffer).toHaveLength(30);
    });

    it('심볼별로 독립적인 버퍼를 관리한다', () => {
      generator.addCandle('BTCUSDT', makeCandle(50000, 1000000));
      generator.addCandle('ETHUSDT', makeCandle(3000, 1000000));

      const btcBuffer = (generator as any).candleBuffer.get('BTCUSDT');
      const ethBuffer = (generator as any).candleBuffer.get('ETHUSDT');
      expect(btcBuffer).toHaveLength(1);
      expect(ethBuffer).toHaveLength(1);
    });
  });

  // ============================================================
  // 부족한 데이터 엣지 케이스
  // ============================================================

  describe('부족한 데이터 처리', () => {
    it('캔들 50개 미만이면 null을 반환한다', () => {
      const candles = generateCandles(49);
      for (const candle of candles) {
        generator.addCandle('BTCUSDT', candle);
      }
      const result = generator.addCandle('BTCUSDT', makeCandle(50000, 2000000));
      expect(result).toBeNull();
    });

    it('getRegime는 캔들 50개 미만이면 null을 반환한다', () => {
      const candles = generateCandles(30);
      generator.setHistory('BTCUSDT', candles);
      const regime = generator.getRegime('BTCUSDT');
      expect(regime).toBeNull();
    });

    it('존재하지 않는 심볼에 대해 getRegime은 null을 반환한다', () => {
      const regime = generator.getRegime('NONEXISTENT');
      expect(regime).toBeNull();
    });
  });

  // ============================================================
  // 신호 관리
  // ============================================================

  describe('신호 관리', () => {
    it('getSignals는 빈 배열로 시작한다', () => {
      const signals = generator.getSignals();
      expect(signals).toEqual([]);
    });

    it('getSignals는 limit에 따라 최근 신호를 반환한다', () => {
      const mockSignals: Signal[] = Array.from({ length: 15 }, (_, i) => ({
        id: `sig-${i}`,
        timestamp: Date.now() + i * 1000,
        symbol: 'BTCUSDT',
        direction: 'CALL' as const,
        strategyId: 'RSI-BB',
        strategy: 'RSI+BB',
        regime: 'ranging' as MarketRegime,
        confidence: 0.7,
        expiry: 60,
        entryPrice: 50000 + i,
        indicators: {},
        status: 'pending' as const,
      }));
      (generator as any).signals = mockSignals;

      const last5 = generator.getSignals(5);
      expect(last5).toHaveLength(5);
      expect(last5[0].id).toBe('sig-10');
    });

    it('updateSignalResult가 신호 상태를 변경한다', () => {
      const signal: Signal = {
        id: 'test-signal',
        timestamp: Date.now(),
        symbol: 'BTCUSDT',
        direction: 'CALL',
        strategyId: 'RSI-BB',
        strategy: 'RSI+BB',
        regime: 'ranging',
        confidence: 0.7,
        expiry: 60,
        entryPrice: 50000,
        indicators: {},
        status: 'pending',
      };
      (generator as any).signals = [signal];

      generator.updateSignalResult('test-signal', 'win');

      const signals = generator.getSignals();
      expect(signals[0].status).toBe('win');
    });

    it('updateSignalResult은 전략별 통계도 업데이트한다', () => {
      const signal: Signal = {
        id: 'test-signal',
        timestamp: Date.now(),
        symbol: 'BTCUSDT',
        direction: 'CALL',
        strategyId: 'RSI-BB',
        strategy: 'RSI+BB',
        regime: 'ranging',
        confidence: 0.7,
        expiry: 60,
        entryPrice: 50000,
        indicators: {},
        status: 'pending',
      };
      (generator as any).signals = [signal];

      generator.updateSignalResult('test-signal', 'win');

      const stats = generator.getStats();
      expect(stats.byStrategy['RSI-BB']).toBeDefined();
      expect(stats.byStrategy['RSI-BB'].wins).toBe(1);
    });

    it('updateSignalResult은 존재하지 않는 ID에 대해 아무 작업도 하지 않는다', () => {
      (generator as any).signals = [];
      generator.updateSignalResult('nonexistent', 'loss');
      expect(generator.getSignals()).toHaveLength(0);
    });

    it('updateSignalResult은 tie를 올바르게 처리한다', () => {
      const signal: Signal = {
        id: 'tie-signal',
        timestamp: Date.now(),
        symbol: 'BTCUSDT',
        direction: 'CALL',
        strategyId: 'RSI-BB',
        strategy: 'RSI+BB',
        regime: 'ranging',
        confidence: 0.7,
        expiry: 60,
        entryPrice: 50000,
        indicators: {},
        status: 'pending',
      };
      (generator as any).signals = [signal];

      generator.updateSignalResult('tie-signal', 'tie');

      const signals = generator.getSignals();
      expect(signals[0].status).toBe('tie');
    });

    it('updateSignalResult은 tie를 전략별 통계에 별도 카운트한다', () => {
      const signals: Signal[] = [
        {
          id: 's1',
          timestamp: Date.now(),
          symbol: 'BTC',
          direction: 'CALL',
          strategyId: 'RSI-BB',
          strategy: 'RSI+BB',
          regime: 'ranging',
          confidence: 0.7,
          expiry: 60,
          entryPrice: 50000,
          indicators: {},
          status: 'pending',
        },
        {
          id: 's2',
          timestamp: Date.now(),
          symbol: 'BTC',
          direction: 'PUT',
          strategyId: 'RSI-BB',
          strategy: 'RSI+BB',
          regime: 'ranging',
          confidence: 0.7,
          expiry: 60,
          entryPrice: 50000,
          indicators: {},
          status: 'pending',
        },
        {
          id: 's3',
          timestamp: Date.now(),
          symbol: 'BTC',
          direction: 'CALL',
          strategyId: 'RSI-BB',
          strategy: 'RSI+BB',
          regime: 'ranging',
          confidence: 0.7,
          expiry: 60,
          entryPrice: 50000,
          indicators: {},
          status: 'pending',
        },
      ];
      (generator as any).signals = signals;

      generator.updateSignalResult('s1', 'win');
      generator.updateSignalResult('s2', 'loss');
      generator.updateSignalResult('s3', 'tie');

      const stats = generator.getStats();
      expect(stats.byStrategy['RSI-BB'].wins).toBe(1);
      expect(stats.byStrategy['RSI-BB'].losses).toBe(1);
      expect(stats.byStrategy['RSI-BB'].ties).toBe(1);
    });
  });

  // ============================================================
  // 구독(onSignal) 관리
  // ============================================================

  describe('구독 관리', () => {
    it('onSignal로 콜백을 등록하고 해제할 수 있다', () => {
      const callback = vi.fn();
      const unsubscribe = generator.onSignal(callback);
      expect((generator as any).listeners).toHaveLength(1);

      unsubscribe();
      expect((generator as any).listeners).toHaveLength(0);
    });
  });

  // ============================================================
  // getStats 통계
  // ============================================================

  describe('getStats', () => {
    it('초기 상태에서 올바른 기본 통계를 반환한다', () => {
      const stats = generator.getStats();
      expect(stats.signalsGenerated).toBe(0);
      expect(stats.signalsFiltered).toBe(0);
      expect(stats.byStrategy).toEqual({});
    });
  });

  // ============================================================
  // passesTrendFilter 내부 메서드
  // ============================================================

  describe('passesTrendFilter', () => {
    it('strong_uptrend에서 CALL만 허용한다', () => {
      const passesTrendFilter = (generator as any).passesTrendFilter.bind(generator);
      expect(passesTrendFilter('CALL', { regime: 'strong_uptrend', adx: 45, direction: 1 })).toBe(
        true,
      );
      expect(passesTrendFilter('PUT', { regime: 'strong_uptrend', adx: 45, direction: 1 })).toBe(
        false,
      );
    });

    it('strong_downtrend에서 PUT만 허용한다', () => {
      const passesTrendFilter = (generator as any).passesTrendFilter.bind(generator);
      expect(passesTrendFilter('PUT', { regime: 'strong_downtrend', adx: 45, direction: -1 })).toBe(
        true,
      );
      expect(
        passesTrendFilter('CALL', { regime: 'strong_downtrend', adx: 45, direction: -1 }),
      ).toBe(false);
    });

    it('weak_uptrend에서 ADX >= 30이면 PUT을 거부한다', () => {
      const passesTrendFilter = (generator as any).passesTrendFilter.bind(generator);
      expect(passesTrendFilter('PUT', { regime: 'weak_uptrend', adx: 35, direction: 1 })).toBe(
        false,
      );
      expect(passesTrendFilter('CALL', { regime: 'weak_uptrend', adx: 35, direction: 1 })).toBe(
        true,
      );
    });

    it('weak_downtrend에서 ADX >= 30이면 CALL을 거부한다', () => {
      const passesTrendFilter = (generator as any).passesTrendFilter.bind(generator);
      expect(passesTrendFilter('CALL', { regime: 'weak_downtrend', adx: 35, direction: -1 })).toBe(
        false,
      );
      expect(passesTrendFilter('PUT', { regime: 'weak_downtrend', adx: 35, direction: -1 })).toBe(
        true,
      );
    });

    it('ADX < 30이면 약한 추세에서도 모든 방향 허용', () => {
      const passesTrendFilter = (generator as any).passesTrendFilter.bind(generator);
      expect(passesTrendFilter('PUT', { regime: 'weak_uptrend', adx: 25, direction: 1 })).toBe(
        true,
      );
      expect(passesTrendFilter('CALL', { regime: 'weak_downtrend', adx: 25, direction: -1 })).toBe(
        true,
      );
    });

    it('ranging에서는 모든 방향 허용', () => {
      const passesTrendFilter = (generator as any).passesTrendFilter.bind(generator);
      expect(passesTrendFilter('CALL', { regime: 'ranging', adx: 15, direction: 0 })).toBe(true);
      expect(passesTrendFilter('PUT', { regime: 'ranging', adx: 15, direction: 0 })).toBe(true);
    });
  });

  // ============================================================
  // selectStrategy 내부 메서드
  // ============================================================

  describe('selectStrategy — regime routing', () => {
    it('ADX >= 25 (trending)이면 selectTrendStrategy를 호출한다', async () => {
      const { selectTrendStrategy } = await import('./trend-strategies');
      (selectTrendStrategy as ReturnType<typeof vi.fn>).mockClear();

      const selectStrategy = (generator as any).selectStrategy.bind(generator);
      const candles = generateCandles(60);

      selectStrategy(candles, { regime: 'weak_uptrend', adx: 30, direction: 1 });
      expect(selectTrendStrategy).toHaveBeenCalledWith(candles, expect.objectContaining({ regime: 'weak_uptrend', adx: 30 }), expect.any(Object));
    });

    it('ADX >= 25 (trending) + trend 전략이 null이면 최종 null 반환', async () => {
      const { selectTrendStrategy } = await import('./trend-strategies');
      (selectTrendStrategy as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const selectStrategy = (generator as any).selectStrategy.bind(generator);
      const candles = generateCandles(60);

      const result = selectStrategy(candles, { regime: 'weak_uptrend', adx: 30, direction: 1 });
      expect(result).toBeNull();
    });

    it('ADX >= 25 (trending) + trend 전략이 신호를 반환하면 그대로 전달', async () => {
      const { selectTrendStrategy } = await import('./trend-strategies');
      const mockResult = {
        signal: 'CALL' as const,
        confidence: 0.7,
        strategyId: 'EMA-PULLBACK',
        reason: 'Uptrend pullback',
        indicators: { rsi: 45 },
      };
      (selectTrendStrategy as ReturnType<typeof vi.fn>).mockReturnValue(mockResult);

      const selectStrategy = (generator as any).selectStrategy.bind(generator);
      const candles = generateCandles(60);

      const result = selectStrategy(candles, { regime: 'weak_uptrend', adx: 30, direction: 1 });
      expect(result).toEqual(mockResult);
    });

    it('ADX < 25 (ranging)이면 rsiBBBounceStrategy를 호출한다', async () => {
      const { rsiBBBounceStrategy } = await import('../backtest/strategies/high-winrate');
      const { selectTrendStrategy } = await import('./trend-strategies');
      (rsiBBBounceStrategy as ReturnType<typeof vi.fn>).mockClear();
      (selectTrendStrategy as ReturnType<typeof vi.fn>).mockClear();

      const selectStrategy = (generator as any).selectStrategy.bind(generator);
      const candles = generateCandles(60);

      selectStrategy(candles, { regime: 'ranging', adx: 15, direction: 0 });
      expect(rsiBBBounceStrategy).toHaveBeenCalledWith(candles, expect.any(Object));
      expect(selectTrendStrategy).not.toHaveBeenCalled();
    });

    it('strong_uptrend(ADX 45)에서 trend 라우팅이 동작한다', async () => {
      const { selectTrendStrategy } = await import('./trend-strategies');
      (selectTrendStrategy as ReturnType<typeof vi.fn>).mockClear();

      const selectStrategy = (generator as any).selectStrategy.bind(generator);
      const candles = generateCandles(60);

      selectStrategy(candles, { regime: 'strong_uptrend', adx: 45, direction: 1 });
      expect(selectTrendStrategy).toHaveBeenCalled();
    });

    it('strong_downtrend(ADX 42)에서 trend 라우팅이 동작한다', async () => {
      const { selectTrendStrategy } = await import('./trend-strategies');
      (selectTrendStrategy as ReturnType<typeof vi.fn>).mockClear();

      const selectStrategy = (generator as any).selectStrategy.bind(generator);
      const candles = generateCandles(60);

      selectStrategy(candles, { regime: 'strong_downtrend', adx: 42, direction: -1 });
      expect(selectTrendStrategy).toHaveBeenCalled();
    });

    it('[회귀 방지] ADX < 25 + non-ranging은 ranging 경로로 폴스루한다', async () => {
      // detectRegime()은 ADX < 25를 항상 'ranging'으로 분류하지만,
      // 만약 외부에서 직접 호출할 때 regime 불일치가 있더라도 안전하게 동작
      const { rsiBBBounceStrategy } = await import('../backtest/strategies/high-winrate');
      const { selectTrendStrategy } = await import('./trend-strategies');
      (rsiBBBounceStrategy as ReturnType<typeof vi.fn>).mockClear();
      (selectTrendStrategy as ReturnType<typeof vi.fn>).mockClear();

      const selectStrategy = (generator as any).selectStrategy.bind(generator);
      const candles = generateCandles(60);

      // ADX 20 but regime says weak_uptrend (edge case) → should NOT route to trend
      selectStrategy(candles, { regime: 'weak_uptrend', adx: 20, direction: 1 });
      expect(selectTrendStrategy).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // strategy-config 기반 전략 선택
  // ============================================================

  describe('strategy-config 기반 전략 선택', () => {
    it('config가 있으면 config의 전략을 우선 사용한다', () => {
      const mockStrategy = {
        id: 'test-strategy',
        name: 'Test Strategy',
        description: 'Test',
        params: {},
        generateSignal: vi.fn().mockReturnValue({
          direction: 'CALL',
          confidence: 0.85,
          indicators: { test: 1 },
          reason: 'Test signal',
        }),
      };

      generator.registerBacktestStrategy(mockStrategy);
      generator.loadStrategyConfig({
        BTCUSDT: {
          strategies: ['test-strategy'],
          params: {},
        },
      });

      const candles = generateCandles(60);
      generator.setHistory('BTCUSDT', candles);
      const signal = generator.addCandle('BTCUSDT', makeCandle(50100, 1000000 + 60 * 60000));

      expect(signal).not.toBeNull();
      expect(signal!.strategyId).toBe('test-strategy');
      expect(mockStrategy.generateSignal).toHaveBeenCalled();
    });

    it('config의 첫 번째 전략이 실패하면 두 번째 전략을 시도한다', () => {
      const failStrategy = {
        id: 'fail-strategy',
        name: 'Fail Strategy',
        description: 'Always fails',
        params: {},
        generateSignal: vi.fn().mockReturnValue(null),
      };

      const successStrategy = {
        id: 'success-strategy',
        name: 'Success Strategy',
        description: 'Always succeeds',
        params: {},
        generateSignal: vi.fn().mockReturnValue({
          direction: 'PUT',
          confidence: 0.7,
          indicators: {},
          reason: 'Fallback signal',
        }),
      };

      generator.registerBacktestStrategies([failStrategy, successStrategy]);
      generator.loadStrategyConfig({
        BTCUSDT: {
          strategies: ['fail-strategy', 'success-strategy'],
          params: {},
        },
      });

      const selectStrategy = (generator as any).selectStrategy.bind(generator);
      const candles = generateCandles(60);

      const result = selectStrategy(
        candles,
        { regime: 'ranging', adx: 15, direction: 0 },
        'BTCUSDT',
      );

      expect(failStrategy.generateSignal).toHaveBeenCalled();
      expect(successStrategy.generateSignal).toHaveBeenCalled();
      expect(result).not.toBeNull();
      expect(result!.strategyId).toBe('success-strategy');
    });

    it('config의 모든 전략이 실패하면 기본 로직으로 fallback한다', async () => {
      const { rsiBBBounceStrategy } = await import('../backtest/strategies/high-winrate');

      const failStrategy = {
        id: 'fail-strategy',
        name: 'Fail',
        description: 'Fails',
        params: {},
        generateSignal: vi.fn().mockReturnValue(null),
      };

      generator.registerBacktestStrategy(failStrategy);
      generator.loadStrategyConfig({
        BTCUSDT: {
          strategies: ['fail-strategy'],
          params: {},
        },
      });

      const selectStrategy = (generator as any).selectStrategy.bind(generator);
      const candles = generateCandles(60);

      selectStrategy(candles, { regime: 'ranging', adx: 15, direction: 0 }, 'BTCUSDT');

      // config 전략이 실패했으므로 기본 로직(rsiBBBounceStrategy)이 호출되어야 한다
      expect(rsiBBBounceStrategy).toHaveBeenCalled();
    });

    it('config에 없는 심볼이면 기본 로직을 사용한다', async () => {
      const { rsiBBBounceStrategy } = await import('../backtest/strategies/high-winrate');
      (rsiBBBounceStrategy as ReturnType<typeof vi.fn>).mockClear();

      generator.loadStrategyConfig({
        'OTHER-SYMBOL': {
          strategies: ['some-strategy'],
          params: {},
        },
      });

      const selectStrategy = (generator as any).selectStrategy.bind(generator);
      const candles = generateCandles(60);

      selectStrategy(candles, { regime: 'ranging', adx: 15, direction: 0 }, 'BTCUSDT');

      // BTCUSDT에 대한 config가 없으므로 기본 로직 사용
      expect(rsiBBBounceStrategy).toHaveBeenCalled();
    });

    it('config가 없으면 기존 동작을 유지한다 (후방호환)', async () => {
      const { rsiBBBounceStrategy } = await import('../backtest/strategies/high-winrate');
      (rsiBBBounceStrategy as ReturnType<typeof vi.fn>).mockClear();

      // strategyConfig를 설정하지 않음
      const selectStrategy = (generator as any).selectStrategy.bind(generator);
      const candles = generateCandles(60);

      selectStrategy(candles, { regime: 'ranging', adx: 15, direction: 0 }, 'BTCUSDT');
      expect(rsiBBBounceStrategy).toHaveBeenCalled();
    });

    it('config에서 지정한 params를 전략에 전달한다', () => {
      const mockStrategy = {
        id: 'param-strategy',
        name: 'Param Strategy',
        description: 'Test',
        params: {
          period: { default: 14, min: 5, max: 50, step: 1 },
        },
        generateSignal: vi.fn().mockReturnValue({
          direction: 'CALL',
          confidence: 0.8,
          indicators: {},
        }),
      };

      generator.registerBacktestStrategy(mockStrategy);
      generator.loadStrategyConfig({
        BTCUSDT: {
          strategies: ['param-strategy'],
          params: { 'param-strategy': { period: 7 } },
        },
      });

      const selectStrategy = (generator as any).selectStrategy.bind(generator);
      const candles = generateCandles(60);

      selectStrategy(candles, { regime: 'ranging', adx: 15, direction: 0 }, 'BTCUSDT');

      // custom params가 전달되었는지 확인
      expect(mockStrategy.generateSignal).toHaveBeenCalledWith(candles, { period: 7 });
    });

    it('config에 params가 없으면 전략의 기본값을 사용한다', () => {
      const mockStrategy = {
        id: 'default-param-strategy',
        name: 'Default Param Strategy',
        description: 'Test',
        params: {
          period: { default: 14, min: 5, max: 50, step: 1 },
          threshold: { default: 70, min: 50, max: 90, step: 5 },
        },
        generateSignal: vi.fn().mockReturnValue({
          direction: 'PUT',
          confidence: 0.75,
          indicators: {},
        }),
      };

      generator.registerBacktestStrategy(mockStrategy);
      generator.loadStrategyConfig({
        BTCUSDT: {
          strategies: ['default-param-strategy'],
          params: {},
        },
      });

      const selectStrategy = (generator as any).selectStrategy.bind(generator);
      const candles = generateCandles(60);

      selectStrategy(candles, { regime: 'ranging', adx: 15, direction: 0 }, 'BTCUSDT');

      // 기본 파라미터가 사용되어야 한다
      expect(mockStrategy.generateSignal).toHaveBeenCalledWith(candles, {
        period: 14,
        threshold: 70,
      });
    });

    it('등록되지 않은 전략은 건너뛴다', () => {
      const mockStrategy = {
        id: 'registered-strategy',
        name: 'Registered',
        description: 'Test',
        params: {},
        generateSignal: vi.fn().mockReturnValue({
          direction: 'CALL',
          confidence: 0.9,
          indicators: {},
        }),
      };

      generator.registerBacktestStrategy(mockStrategy);
      generator.loadStrategyConfig({
        BTCUSDT: {
          strategies: ['unregistered-strategy', 'registered-strategy'],
          params: {},
        },
      });

      const selectStrategy = (generator as any).selectStrategy.bind(generator);
      const candles = generateCandles(60);

      const result = selectStrategy(
        candles,
        { regime: 'ranging', adx: 15, direction: 0 },
        'BTCUSDT',
      );

      expect(result).not.toBeNull();
      expect(result!.strategyId).toBe('registered-strategy');
    });
  });
});

// ============================================================
// generateLLMReport
// ============================================================

describe('generateLLMReport', () => {
  it('빈 신호 배열에서 summary 문자열을 반환한다', () => {
    const report = generateLLMReport([]) as any;
    expect(report.summary).toBe('No signals generated yet');
    expect(report.recommendation).toContain('Wait');
  });

  it('신호가 있으면 summary 객체를 반환한다', () => {
    const signals: Signal[] = [
      {
        id: '1',
        timestamp: Date.now(),
        symbol: 'BTC',
        direction: 'CALL',
        strategyId: 'RSI-BB',
        strategy: 'RSI+BB: bounce',
        regime: 'ranging',
        confidence: 0.8,
        expiry: 60,
        entryPrice: 50000,
        indicators: {},
        status: 'win',
      },
      {
        id: '2',
        timestamp: Date.now(),
        symbol: 'BTC',
        direction: 'PUT',
        strategyId: 'RSI-BB',
        strategy: 'RSI+BB: bounce',
        regime: 'ranging',
        confidence: 0.8,
        expiry: 60,
        entryPrice: 50000,
        indicators: {},
        status: 'loss',
      },
      {
        id: '3',
        timestamp: Date.now(),
        symbol: 'BTC',
        direction: 'CALL',
        strategyId: 'RSI-BB',
        strategy: 'RSI+BB: bounce',
        regime: 'ranging',
        confidence: 0.8,
        expiry: 60,
        entryPrice: 50000,
        indicators: {},
        status: 'pending',
      },
    ];

    const report = generateLLMReport(signals) as any;
    expect(report.summary.totalSignals).toBe(3);
    expect(report.summary.completed).toBe(2); // win + loss
    expect(report.summary.pending).toBe(1);
    expect(report.summary.wins).toBe(1);
    expect(report.summary.losses).toBe(1);
    expect(report.summary.winRate).toBe('50.0%');
  });

  it('전략별 성과를 strategyId 기준으로 분류한다', () => {
    const signals: Signal[] = [
      {
        id: '1',
        timestamp: Date.now(),
        symbol: 'BTC',
        direction: 'CALL',
        strategyId: 'RSI-BB',
        strategy: 'RSI+BB: oversold bounce',
        regime: 'ranging',
        confidence: 0.8,
        expiry: 60,
        entryPrice: 50000,
        indicators: {},
        status: 'win',
      },
      {
        id: '2',
        timestamp: Date.now(),
        symbol: 'BTC',
        direction: 'PUT',
        strategyId: 'RSI-BB',
        strategy: 'RSI+BB: overbought bounce',
        regime: 'ranging',
        confidence: 0.7,
        expiry: 60,
        entryPrice: 50000,
        indicators: {},
        status: 'loss',
      },
    ];

    const report = generateLLMReport(signals) as any;
    // Both signals share strategyId 'RSI-BB' → grouped into one entry
    expect(report.performance.byStrategy).toHaveLength(1);
    expect(report.performance.byStrategy[0].name).toBe('RSI-BB');
    expect(report.performance.byStrategy[0].signals).toBe(2);
  });

  it('시장 레짐별 성과를 분류한다', () => {
    const signals: Signal[] = [
      {
        id: '1',
        timestamp: Date.now(),
        symbol: 'BTC',
        direction: 'CALL',
        strategyId: 'RSI-BB',
        strategy: 'RSI+BB',
        regime: 'ranging',
        confidence: 0.8,
        expiry: 60,
        entryPrice: 50000,
        indicators: {},
        status: 'win',
      },
      {
        id: '2',
        timestamp: Date.now(),
        symbol: 'BTC',
        direction: 'PUT',
        strategyId: 'RSI-BB',
        strategy: 'RSI+BB',
        regime: 'weak_uptrend',
        confidence: 0.7,
        expiry: 60,
        entryPrice: 50000,
        indicators: {},
        status: 'loss',
      },
    ];

    const report = generateLLMReport(signals) as any;
    expect(report.performance.byRegime).toHaveLength(2);
    const ranging = report.performance.byRegime.find((r: any) => r.name === 'ranging');
    expect(ranging).toBeDefined();
    expect(ranging.signals).toBe(1);
  });

  it('최근 5개 신호만 recentSignals에 포함한다', () => {
    const signals: Signal[] = Array.from({ length: 10 }, (_, i) => ({
      id: `sig-${i}`,
      timestamp: Date.now() + i,
      symbol: 'BTC',
      direction: 'CALL' as const,
      strategyId: 'RSI-BB',
      strategy: 'RSI+BB',
      regime: 'ranging' as MarketRegime,
      confidence: 0.8,
      expiry: 60,
      entryPrice: 50000,
      indicators: {},
      status: 'win' as const,
    }));

    const report = generateLLMReport(signals) as any;
    expect(report.recentSignals).toHaveLength(5);
  });

  it('tie가 포함된 신호에서 winRate를 Policy A로 계산한다 (ties 제외)', () => {
    const signals: Signal[] = [
      {
        id: '1',
        timestamp: Date.now(),
        symbol: 'BTC',
        direction: 'CALL',
        strategyId: 'RSI-BB',
        strategy: 'RSI+BB',
        regime: 'ranging',
        confidence: 0.8,
        expiry: 60,
        entryPrice: 50000,
        indicators: {},
        status: 'win',
      },
      {
        id: '2',
        timestamp: Date.now(),
        symbol: 'BTC',
        direction: 'PUT',
        strategyId: 'RSI-BB',
        strategy: 'RSI+BB',
        regime: 'ranging',
        confidence: 0.8,
        expiry: 60,
        entryPrice: 50000,
        indicators: {},
        status: 'loss',
      },
      {
        id: '3',
        timestamp: Date.now(),
        symbol: 'BTC',
        direction: 'CALL',
        strategyId: 'RSI-BB',
        strategy: 'RSI+BB',
        regime: 'ranging',
        confidence: 0.8,
        expiry: 60,
        entryPrice: 50000,
        indicators: {},
        status: 'tie',
      },
      {
        id: '4',
        timestamp: Date.now(),
        symbol: 'BTC',
        direction: 'CALL',
        strategyId: 'RSI-BB',
        strategy: 'RSI+BB',
        regime: 'ranging',
        confidence: 0.8,
        expiry: 60,
        entryPrice: 50000,
        indicators: {},
        status: 'pending',
      },
    ];

    const report = generateLLMReport(signals) as any;
    // Policy A: winRate = wins / (wins + losses) = 1/2 = 50.0%
    // NOT 1/3 (excluding pending) or 1/4 (including all)
    expect(report.summary.winRate).toBe('50.0%');
    expect(report.summary.wins).toBe(1);
    expect(report.summary.losses).toBe(1);
    expect(report.summary.ties).toBe(1);
    expect(report.summary.pending).toBe(1);
    expect(report.summary.completed).toBe(2); // only decided trades (win + loss)
  });

  it('tie만 있으면 winRate는 N/A이다', () => {
    const signals: Signal[] = [
      {
        id: '1',
        timestamp: Date.now(),
        symbol: 'BTC',
        direction: 'CALL',
        strategyId: 'RSI-BB',
        strategy: 'RSI+BB',
        regime: 'ranging',
        confidence: 0.8,
        expiry: 60,
        entryPrice: 50000,
        indicators: {},
        status: 'tie',
      },
    ];

    const report = generateLLMReport(signals) as any;
    expect(report.summary.winRate).toBe('N/A%');
    expect(report.summary.ties).toBe(1);
    expect(report.summary.completed).toBe(0);
  });

  it('승률 55% 이상이면 positive recommendation', () => {
    const signals: Signal[] = Array.from({ length: 10 }, (_, i) => ({
      id: `sig-${i}`,
      timestamp: Date.now() + i,
      symbol: 'BTC',
      direction: 'CALL' as const,
      strategyId: 'RSI-BB',
      strategy: 'RSI+BB',
      regime: 'ranging' as MarketRegime,
      confidence: 0.8,
      expiry: 60,
      entryPrice: 50000,
      indicators: {},
      status: i < 6 ? ('win' as const) : ('loss' as const), // 60% 승률
    }));

    const report = generateLLMReport(signals) as any;
    expect(report.recommendation).toContain('above target');
  });
});
