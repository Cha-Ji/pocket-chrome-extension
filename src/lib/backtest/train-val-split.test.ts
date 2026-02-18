import { describe, it, expect } from 'vitest';
import {
  splitTrainVal,
  extractPerformanceSummary,
  calculateOverfitScore,
  type OptimizationOutput,
  type PerformanceSummary,
  type TrainValSplit,
  type OptimizationEntry,
} from './train-val-split';
import type { Candle, BacktestResult } from './types';

// ============================================================
// 테스트 데이터 생성 헬퍼
// ============================================================

function makeCandles(count: number, startTs = 1000000): Candle[] {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: startTs + i * 60000, // 1분 간격
    open: 100 + i * 0.1,
    high: 101 + i * 0.1,
    low: 99 + i * 0.1,
    close: 100.5 + i * 0.1,
    volume: 1000,
  }));
}

function makeBacktestResult(overrides: Partial<BacktestResult> = {}): BacktestResult {
  return {
    config: {
      symbol: 'TEST',
      strategyId: 'test',
      strategyParams: {},
      initialBalance: 10000,
      betAmount: 100,
      betType: 'fixed',
      payout: 92,
      expirySeconds: 60,
      startTime: 0,
      endTime: 1000,
    },
    totalTrades: 100,
    wins: 55,
    losses: 43,
    ties: 2,
    winRate: 56.12,
    initialBalance: 10000,
    finalBalance: 10600,
    netProfit: 600,
    netProfitPercent: 6,
    maxDrawdown: 300,
    maxDrawdownPercent: 3,
    profitFactor: 1.35,
    expectancy: 6,
    startTime: 0,
    endTime: 1000,
    durationMs: 1000,
    trades: Array.from({ length: 100 }, (_, i) => ({
      entryTime: i * 10,
      entryPrice: 100,
      exitTime: i * 10 + 60,
      exitPrice: i < 55 ? 101 : 99,
      direction: 'CALL' as const,
      result: i < 55 ? ('WIN' as const) : i < 98 ? ('LOSS' as const) : ('TIE' as const),
      payout: 92,
      profit: i < 55 ? 92 : i < 98 ? -100 : 0,
    })),
    equityCurve: [],
    ...overrides,
  };
}

// ============================================================
// splitTrainVal 테스트
// ============================================================

describe('splitTrainVal', () => {
  it('기본 70/30 분할이 올바르게 동작한다', () => {
    const candles = makeCandles(200);
    const result = splitTrainVal(candles, 0.7);

    expect(result.train.length).toBe(140);
    expect(result.validation.length).toBe(60);
    expect(result.train.length + result.validation.length).toBe(200);
    expect(result.trainRatio).toBe(0.7);
  });

  it('시간 순서가 유지된다 (train이 val보다 앞)', () => {
    const candles = makeCandles(200);
    const result = splitTrainVal(candles, 0.7);

    const trainMax = Math.max(...result.train.map((c) => c.timestamp));
    const valMin = Math.min(...result.validation.map((c) => c.timestamp));

    expect(trainMax).toBeLessThan(valMin);
  });

  it('역순 입력도 정렬 후 올바르게 분할된다', () => {
    const candles = makeCandles(200).reverse();
    const result = splitTrainVal(candles, 0.7);

    // train의 마지막 timestamp < validation의 첫 timestamp
    const trainLast = result.train[result.train.length - 1].timestamp;
    const valFirst = result.validation[0].timestamp;
    expect(trainLast).toBeLessThan(valFirst);
  });

  it('다른 비율(80/20)도 동작한다', () => {
    const candles = makeCandles(200);
    const result = splitTrainVal(candles, 0.8);

    // 200 * 0.8 = 160이지만, validation 최소 50개 보장으로 150/50
    expect(result.train.length).toBe(150);
    expect(result.validation.length).toBe(50);
  });

  it('trainRatio가 0 이하이면 에러', () => {
    const candles = makeCandles(200);
    expect(() => splitTrainVal(candles, 0)).toThrow('trainRatio must be between 0 and 1');
    expect(() => splitTrainVal(candles, -0.1)).toThrow('trainRatio must be between 0 and 1');
  });

  it('trainRatio가 1 이상이면 에러', () => {
    const candles = makeCandles(200);
    expect(() => splitTrainVal(candles, 1)).toThrow('trainRatio must be between 0 and 1');
    expect(() => splitTrainVal(candles, 1.5)).toThrow('trainRatio must be between 0 and 1');
  });

  it('캔들 부족시 에러 (100개 미만)', () => {
    const candles = makeCandles(50);
    expect(() => splitTrainVal(candles, 0.7)).toThrow('Not enough candles');
  });

  it('극단적인 비율에서도 최소 50개씩 보장된다', () => {
    const candles = makeCandles(120);
    // 0.95 비율이면 114/6으로 나뉘지만, 최소 50개 보장으로 70/50이 되어야 함
    const result = splitTrainVal(candles, 0.95);

    expect(result.train.length).toBeGreaterThanOrEqual(50);
    expect(result.validation.length).toBeGreaterThanOrEqual(50);
  });

  it('splitTimestamp과 period 정보가 올바르다', () => {
    const candles = makeCandles(200, 1000000);
    const result = splitTrainVal(candles, 0.7);

    expect(result.splitTimestamp).toBe(result.trainPeriod.end);
    expect(result.trainPeriod.start).toBe(result.train[0].timestamp);
    expect(result.trainPeriod.end).toBe(result.train[result.train.length - 1].timestamp);
    expect(result.valPeriod.start).toBe(result.validation[0].timestamp);
    expect(result.valPeriod.end).toBe(result.validation[result.validation.length - 1].timestamp);
  });

  it('train과 validation 사이에 데이터 누락이 없다', () => {
    const candles = makeCandles(200);
    const result = splitTrainVal(candles, 0.7);

    // 모든 원본 캔들이 train 또는 val에 포함
    const allTimestamps = new Set([
      ...result.train.map((c) => c.timestamp),
      ...result.validation.map((c) => c.timestamp),
    ]);
    expect(allTimestamps.size).toBe(200);
  });
});

// ============================================================
// extractPerformanceSummary 테스트
// ============================================================

describe('extractPerformanceSummary', () => {
  it('BacktestResult에서 올바른 요약을 추출한다', () => {
    const result = makeBacktestResult();
    const summary = extractPerformanceSummary(result, 92);

    expect(summary.totalTrades).toBe(100);
    expect(summary.wins).toBe(55);
    expect(summary.losses).toBe(43);
    expect(summary.ties).toBe(2);
    expect(summary.winRate).toBe(56.12);
    expect(summary.netProfit).toBe(600);
    expect(summary.profitFactor).toBe(1.35);
    expect(summary.compositeScore).toBeGreaterThanOrEqual(0);
    expect(summary.compositeScore).toBeLessThanOrEqual(100);
    expect(['A', 'B', 'C', 'D', 'F']).toContain(summary.grade);
  });

  it('연속 손실을 정확히 계산한다', () => {
    const trades = [
      ...Array(3).fill({ result: 'WIN' }),
      ...Array(5).fill({ result: 'LOSS' }),
      ...Array(2).fill({ result: 'WIN' }),
      ...Array(3).fill({ result: 'LOSS' }),
    ].map((t, i) => ({
      entryTime: i * 10,
      entryPrice: 100,
      exitTime: i * 10 + 60,
      exitPrice: 100,
      direction: 'CALL' as const,
      result: t.result as 'WIN' | 'LOSS',
      payout: 92,
      profit: t.result === 'WIN' ? 92 : -100,
    }));

    const result = makeBacktestResult({
      totalTrades: 13,
      wins: 5,
      losses: 8,
      ties: 0,
      trades,
    });

    const summary = extractPerformanceSummary(result, 92);
    expect(summary.maxConsecutiveLosses).toBe(5);
  });
});

// ============================================================
// calculateOverfitScore 테스트
// ============================================================

describe('calculateOverfitScore', () => {
  it('동일한 성과이면 overfit 점수가 0에 가깝다', () => {
    const perf: PerformanceSummary = {
      totalTrades: 100,
      wins: 55,
      losses: 45,
      ties: 0,
      winRate: 55,
      netProfit: 500,
      netProfitPercent: 5,
      profitFactor: 1.5,
      expectancy: 5,
      maxDrawdown: 200,
      maxDrawdownPercent: 2,
      maxConsecutiveLosses: 3,
      sharpeRatio: 1.2,
      compositeScore: 65,
      grade: 'B',
    };

    const score = calculateOverfitScore(perf, perf);
    expect(score).toBe(0);
  });

  it('train 대비 val 승률이 크게 떨어지면 overfit 점수가 높다', () => {
    const train: PerformanceSummary = {
      totalTrades: 100,
      wins: 65,
      losses: 35,
      ties: 0,
      winRate: 65,
      netProfit: 1000,
      netProfitPercent: 10,
      profitFactor: 2.5,
      expectancy: 10,
      maxDrawdown: 200,
      maxDrawdownPercent: 2,
      maxConsecutiveLosses: 3,
      sharpeRatio: 2.0,
      compositeScore: 80,
      grade: 'A',
    };

    const val: PerformanceSummary = {
      ...train,
      winRate: 48, // -17%p 하락
      profitFactor: 0.9,
      maxDrawdownPercent: 15,
    };

    const score = calculateOverfitScore(train, val);
    expect(score).toBeGreaterThan(0.5);
  });

  it('overfit 점수는 0~1 범위로 클램핑된다', () => {
    const train: PerformanceSummary = {
      totalTrades: 100,
      wins: 90,
      losses: 10,
      ties: 0,
      winRate: 90,
      netProfit: 5000,
      netProfitPercent: 50,
      profitFactor: 10,
      expectancy: 50,
      maxDrawdown: 100,
      maxDrawdownPercent: 1,
      maxConsecutiveLosses: 1,
      sharpeRatio: 5,
      compositeScore: 95,
      grade: 'A',
    };

    const val: PerformanceSummary = {
      ...train,
      winRate: 30,
      profitFactor: 0.3,
      maxDrawdownPercent: 50,
    };

    const score = calculateOverfitScore(train, val);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

// ============================================================
// OptimizationOutput JSON 스키마 테스트
// ============================================================

describe('OptimizationOutput JSON Schema', () => {
  function makeValidOutput(): OptimizationOutput {
    return {
      generatedAt: new Date().toISOString(),
      symbol: 'BTCUSDT',
      dataSource: 'json',
      totalCandles: 500,
      trainRatio: 0.7,
      splitTimestamp: 1700000000000,
      trainPeriod: { start: 1699000000000, end: 1700000000000, candles: 350 },
      valPeriod: { start: 1700000060000, end: 1700500000000, candles: 150 },
      config: {
        initialBalance: 10000,
        betAmount: 100,
        payout: 92,
        expirySeconds: 60,
      },
      results: [
        {
          strategyId: 'rsi-ob-os',
          strategyName: 'RSI Overbought/Oversold',
          bestParams: { period: 14, oversold: 30, overbought: 70 },
          train: {
            totalTrades: 50,
            wins: 30,
            losses: 18,
            ties: 2,
            winRate: 62.5,
            netProfit: 800,
            netProfitPercent: 8,
            profitFactor: 1.8,
            expectancy: 16,
            maxDrawdown: 300,
            maxDrawdownPercent: 3,
            maxConsecutiveLosses: 3,
            sharpeRatio: 1.5,
            compositeScore: 72,
            grade: 'B',
          },
          validation: {
            totalTrades: 20,
            wins: 11,
            losses: 8,
            ties: 1,
            winRate: 57.9,
            netProfit: 200,
            netProfitPercent: 2,
            profitFactor: 1.3,
            expectancy: 10,
            maxDrawdown: 400,
            maxDrawdownPercent: 4,
            maxConsecutiveLosses: 4,
            sharpeRatio: 0.8,
            compositeScore: 55,
            grade: 'C',
          },
          overfitScore: 0.2,
        },
      ],
    };
  }

  it('필수 최상위 필드가 모두 존재한다', () => {
    const output = makeValidOutput();

    expect(output).toHaveProperty('generatedAt');
    expect(output).toHaveProperty('symbol');
    expect(output).toHaveProperty('dataSource');
    expect(output).toHaveProperty('totalCandles');
    expect(output).toHaveProperty('trainRatio');
    expect(output).toHaveProperty('splitTimestamp');
    expect(output).toHaveProperty('trainPeriod');
    expect(output).toHaveProperty('valPeriod');
    expect(output).toHaveProperty('config');
    expect(output).toHaveProperty('results');
  });

  it('trainPeriod/valPeriod에 start, end, candles가 있다', () => {
    const output = makeValidOutput();

    expect(output.trainPeriod).toHaveProperty('start');
    expect(output.trainPeriod).toHaveProperty('end');
    expect(output.trainPeriod).toHaveProperty('candles');
    expect(output.valPeriod).toHaveProperty('start');
    expect(output.valPeriod).toHaveProperty('end');
    expect(output.valPeriod).toHaveProperty('candles');
  });

  it('config에 필수 필드가 있다', () => {
    const output = makeValidOutput();

    expect(output.config).toHaveProperty('initialBalance');
    expect(output.config).toHaveProperty('betAmount');
    expect(output.config).toHaveProperty('payout');
    expect(output.config).toHaveProperty('expirySeconds');
  });

  it('각 result entry에 필수 필드가 있다', () => {
    const output = makeValidOutput();
    const entry = output.results[0];

    expect(entry).toHaveProperty('strategyId');
    expect(entry).toHaveProperty('strategyName');
    expect(entry).toHaveProperty('bestParams');
    expect(entry).toHaveProperty('train');
    expect(entry).toHaveProperty('validation');
    expect(entry).toHaveProperty('overfitScore');
  });

  it('PerformanceSummary에 필수 지표가 모두 있다', () => {
    const output = makeValidOutput();
    const perf = output.results[0].train;

    const requiredFields: (keyof PerformanceSummary)[] = [
      'totalTrades',
      'wins',
      'losses',
      'ties',
      'winRate',
      'netProfit',
      'netProfitPercent',
      'profitFactor',
      'expectancy',
      'maxDrawdown',
      'maxDrawdownPercent',
      'maxConsecutiveLosses',
      'compositeScore',
      'grade',
    ];

    for (const field of requiredFields) {
      expect(perf).toHaveProperty(field);
    }
  });

  it('generatedAt이 유효한 ISO 날짜 문자열이다', () => {
    const output = makeValidOutput();
    const parsed = new Date(output.generatedAt);
    expect(parsed.toISOString()).toBe(output.generatedAt);
  });

  it('overfitScore가 0~1 범위이다', () => {
    const output = makeValidOutput();
    for (const entry of output.results) {
      expect(entry.overfitScore).toBeGreaterThanOrEqual(0);
      expect(entry.overfitScore).toBeLessThanOrEqual(1);
    }
  });

  it('빈 results 배열도 유효하다', () => {
    const output = makeValidOutput();
    output.results = [];
    expect(output.results).toEqual([]);
    expect(output).toHaveProperty('results');
  });
});
