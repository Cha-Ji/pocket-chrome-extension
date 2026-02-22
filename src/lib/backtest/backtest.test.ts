// ============================================================
// Backtest Module Tests
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { BacktestEngine, getBacktestEngine } from './engine';
import { RSIStrategies, RSIOverboughtOversold } from './strategies/rsi-strategy';
import { generateTestCandles, generatePatternedData } from './data-generator';
import { BacktestConfig, Candle } from './types';
import { hasFixture, loadFixtureSlice, FIXTURES } from './__tests__/fixture-loader';

describe('BacktestEngine', () => {
  let engine: BacktestEngine;

  beforeEach(() => {
    engine = new BacktestEngine();
  });

  describe('Strategy Registration', () => {
    it('should register strategies', () => {
      engine.registerStrategy(RSIOverboughtOversold);
      expect(engine.getStrategies()).toHaveLength(1);
    });

    it('should register multiple strategies', () => {
      RSIStrategies.forEach((s) => engine.registerStrategy(s));
      expect(engine.getStrategies()).toHaveLength(RSIStrategies.length);
    });
  });

  describe('Backtest Execution', () => {
    beforeEach(() => {
      RSIStrategies.forEach((s) => engine.registerStrategy(s));
    });

    it('should run backtest with RSI strategy', () => {
      const candles = generateTestCandles({ count: 500 });
      const config: BacktestConfig = {
        symbol: 'TEST',
        startTime: candles[0].timestamp,
        endTime: candles[candles.length - 1].timestamp,
        initialBalance: 10000,
        betAmount: 100,
        betType: 'fixed',
        payout: 92,
        expirySeconds: 60,
        strategyId: 'rsi-ob-os',
        strategyParams: { period: 14, oversold: 30, overbought: 70 },
      };

      const result = engine.run(config, candles);

      expect(result).toBeDefined();
      expect(result.totalTrades).toBeGreaterThanOrEqual(0);
      expect(result.initialBalance).toBe(10000);
      expect(result.winRate).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeLessThanOrEqual(100);
    });

    it('should handle different market conditions', () => {
      const conditions = ['uptrend', 'downtrend', 'ranging', 'volatile'] as const;

      for (const condition of conditions) {
        const candles = generatePatternedData(condition, 500);
        const config: BacktestConfig = {
          symbol: 'TEST',
          startTime: candles[0].timestamp,
          endTime: candles[candles.length - 1].timestamp,
          initialBalance: 10000,
          betAmount: 100,
          betType: 'fixed',
          payout: 92,
          expirySeconds: 60,
          strategyId: 'rsi-ob-os',
          strategyParams: { period: 14, oversold: 30, overbought: 70 },
        };

        const result = engine.run(config, candles);
        expect(result).toBeDefined();
        console.log(
          `${condition}: ${result.totalTrades} trades, ${result.winRate.toFixed(1)}% win rate, $${result.netProfit.toFixed(2)} profit`,
        );
      }
    });

    it('should generate equity curve', () => {
      const candles = generateTestCandles({ count: 500 });
      const config: BacktestConfig = {
        symbol: 'TEST',
        startTime: candles[0].timestamp,
        endTime: candles[candles.length - 1].timestamp,
        initialBalance: 10000,
        betAmount: 100,
        betType: 'fixed',
        payout: 92,
        expirySeconds: 60,
        strategyId: 'rsi-ob-os',
        strategyParams: { period: 14, oversold: 30, overbought: 70 },
      };

      const result = engine.run(config, candles);

      expect(result.equityCurve).toBeDefined();
      expect(result.equityCurve.length).toBeGreaterThan(0);
      expect(result.equityCurve[0].balance).toBe(10000);
    });
  });

  describe('Risk Metrics', () => {
    beforeEach(() => {
      RSIStrategies.forEach((s) => engine.registerStrategy(s));
    });

    it('should calculate max drawdown', () => {
      const candles = generatePatternedData('volatile', 1000);
      const config: BacktestConfig = {
        symbol: 'TEST',
        startTime: candles[0].timestamp,
        endTime: candles[candles.length - 1].timestamp,
        initialBalance: 10000,
        betAmount: 100,
        betType: 'fixed',
        payout: 92,
        expirySeconds: 60,
        strategyId: 'rsi-ob-os',
        strategyParams: { period: 14, oversold: 30, overbought: 70 },
      };

      const result = engine.run(config, candles);

      expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(result.maxDrawdownPercent).toBeGreaterThanOrEqual(0);
    });

    it('should calculate profit factor', () => {
      const candles = generateTestCandles({ count: 500 });
      const config: BacktestConfig = {
        symbol: 'TEST',
        startTime: candles[0].timestamp,
        endTime: candles[candles.length - 1].timestamp,
        initialBalance: 10000,
        betAmount: 100,
        betType: 'fixed',
        payout: 92,
        expirySeconds: 60,
        strategyId: 'rsi-ob-os',
        strategyParams: { period: 14, oversold: 30, overbought: 70 },
      };

      const result = engine.run(config, candles);

      expect(result.profitFactor).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Parameter Optimization', () => {
    beforeEach(() => {
      RSIStrategies.forEach((s) => engine.registerStrategy(s));
    });

    it('should optimize strategy parameters', () => {
      const candles = generateTestCandles({ count: 500 });
      const baseConfig: BacktestConfig = {
        symbol: 'TEST',
        startTime: candles[0].timestamp,
        endTime: candles[candles.length - 1].timestamp,
        initialBalance: 10000,
        betAmount: 100,
        betType: 'fixed',
        payout: 92,
        expirySeconds: 60,
        strategyId: 'rsi-ob-os',
        strategyParams: {},
      };

      const results = engine.optimize(baseConfig, candles, {
        period: { min: 10, max: 20, step: 5 },
        oversold: { min: 25, max: 35, step: 5 },
        overbought: { min: 65, max: 75, step: 5 },
      });

      expect(results.length).toBeGreaterThan(0);
      // Results should be sorted by profit
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].netProfit).toBeGreaterThanOrEqual(results[i].netProfit);
      }
    });
  });
});

describe('RSI Strategies', () => {
  it('should generate signals for RSI Overbought/Oversold', () => {
    const candles = generateTestCandles({ count: 100 });
    const signal = RSIOverboughtOversold.generateSignal(candles, {
      period: 14,
      oversold: 30,
      overbought: 70,
    });

    expect(signal).toBeDefined();
    expect(signal!.indicators).toHaveProperty('rsi');
  });

  it('should have valid parameter definitions', () => {
    for (const strategy of RSIStrategies) {
      expect(strategy.id).toBeTruthy();
      expect(strategy.name).toBeTruthy();
      expect(strategy.params).toBeDefined();

      for (const [key, param] of Object.entries(strategy.params)) {
        expect(param.min).toBeLessThanOrEqual(param.default);
        expect(param.default).toBeLessThanOrEqual(param.max);
        expect(param.step).toBeGreaterThan(0);
      }
    }
  });
});

// ============================================================
// Gap Trade Handling (#169)
// ============================================================

describe('Gap Trade Handling (#169)', () => {
  let engine: BacktestEngine;

  beforeEach(() => {
    engine = new BacktestEngine();
    RSIStrategies.forEach((s) => engine.registerStrategy(s));
  });

  /**
   * Create candles with an intentional gap in the middle.
   * First 200 candles are contiguous (60s interval), then a 30-minute gap,
   * then another 200 contiguous candles.
   */
  function createGappedCandles(): Candle[] {
    const base = Date.now() - 1000 * 60 * 500;
    const candles: Candle[] = [];
    let price = 100;
    for (let i = 0; i < 200; i++) {
      const change = (Math.sin(i * 0.1) + Math.random() * 0.5 - 0.25) * 0.5;
      price = Math.max(50, price + change);
      candles.push({
        timestamp: base + i * 60_000,
        open: price,
        high: price + 0.5,
        low: price - 0.5,
        close: price + change * 0.1,
      });
    }
    // 30-minute gap (30 missing candles at 60s interval)
    const gapMs = 30 * 60_000;
    for (let i = 0; i < 200; i++) {
      const change = (Math.sin(i * 0.15) + Math.random() * 0.5 - 0.25) * 0.5;
      price = Math.max(50, price + change);
      candles.push({
        timestamp: base + 200 * 60_000 + gapMs + i * 60_000,
        open: price,
        high: price + 0.5,
        low: price - 0.5,
        close: price + change * 0.1,
      });
    }
    return candles;
  }

  function makeConfig(candles: Candle[], overrides?: Partial<BacktestConfig>): BacktestConfig {
    return {
      symbol: 'TEST',
      startTime: candles[0].timestamp,
      endTime: candles[candles.length - 1].timestamp,
      initialBalance: 10000,
      betAmount: 100,
      betType: 'fixed',
      payout: 92,
      expirySeconds: 60,
      strategyId: 'rsi-ob-os',
      strategyParams: { period: 14, oversold: 30, overbought: 70 },
      ...overrides,
    };
  }

  it('gapTradeHandling="loss" records gap trades as LOSS', () => {
    const candles = createGappedCandles();
    const result = engine.run(makeConfig(candles, { gapTradeHandling: 'loss' }), candles);
    const gapTrades = result.trades.filter((t) => t.isGapTrade);

    if (result.gapTradeStats && result.gapTradeStats.total > 0) {
      expect(gapTrades.length).toBe(result.gapTradeStats.forcedLoss);
      for (const t of gapTrades) {
        expect(t.result).toBe('LOSS');
        expect(t.isGapTrade).toBe(true);
      }
    }
    // stats consistency
    expect(result.gapTradeStats).toBeDefined();
    expect(result.gapTradeStats!.skipped).toBe(0);
  });

  it('gapTradeHandling="skip" skips gap trades (backward compat)', () => {
    const candles = createGappedCandles();
    const result = engine.run(makeConfig(candles, { gapTradeHandling: 'skip' }), candles);
    const gapTrades = result.trades.filter((t) => t.isGapTrade);

    // No gap trades in the trade list when skipping
    expect(gapTrades).toHaveLength(0);
    expect(result.gapTradeStats).toBeDefined();
    expect(result.gapTradeStats!.forcedLoss).toBe(0);
  });

  it('default gapTradeHandling is "loss"', () => {
    const candles = createGappedCandles();
    const resultDefault = engine.run(makeConfig(candles), candles);
    const resultExplicit = engine.run(makeConfig(candles, { gapTradeHandling: 'loss' }), candles);

    // Same number of gap forced losses
    expect(resultDefault.gapTradeStats!.forcedLoss).toBe(
      resultExplicit.gapTradeStats!.forcedLoss,
    );
  });

  it('gapTradeStats counts are consistent', () => {
    const candles = createGappedCandles();
    const result = engine.run(makeConfig(candles, { gapTradeHandling: 'loss' }), candles);
    const stats = result.gapTradeStats!;

    expect(stats.total).toBe(stats.skipped + stats.forcedLoss);
  });

  it('only gap trades have isGapTrade=true', () => {
    const candles = createGappedCandles();
    const result = engine.run(makeConfig(candles, { gapTradeHandling: 'loss' }), candles);
    for (const t of result.trades) {
      if (t.isGapTrade) {
        expect(t.result).toBe('LOSS');
      }
    }
    // Non-gap trades should not have isGapTrade set
    const nonGapTrades = result.trades.filter((t) => !t.isGapTrade);
    for (const t of nonGapTrades) {
      expect(t.isGapTrade).toBeUndefined();
    }
  });
});

// ============================================================
// Real Data Backtest (#129)
// ============================================================

describe.skipIf(!hasFixture(FIXTURES.BTCUSDT_1M))('Real Data Backtest (#129)', () => {
  let engine: BacktestEngine;

  beforeEach(() => {
    engine = new BacktestEngine();
    RSIStrategies.forEach((s) => engine.registerStrategy(s));
  });

  it('runs backtest on BTCUSDT 1m real data', () => {
    const candles = loadFixtureSlice(FIXTURES.BTCUSDT_1M, 2000);
    const config: BacktestConfig = {
      symbol: 'BTCUSDT',
      startTime: candles[0].timestamp,
      endTime: candles[candles.length - 1].timestamp,
      initialBalance: 10000,
      betAmount: 100,
      betType: 'fixed',
      payout: 92,
      expirySeconds: 60,
      strategyId: 'rsi-ob-os',
      strategyParams: { period: 14, oversold: 30, overbought: 70 },
    };

    const result = engine.run(config, candles);

    expect(result.totalTrades).toBeGreaterThan(0);
    expect(result.winRate).toBeGreaterThanOrEqual(0);
    expect(result.winRate).toBeLessThanOrEqual(100);
    expect(result.finalBalance).toBeGreaterThan(0);
  });

  it('gapTradeHandling="loss" produces equal or more trades than "skip" on real data', () => {
    const candles = loadFixtureSlice(FIXTURES.BTCUSDT_1M, 2000);
    const baseConfig: BacktestConfig = {
      symbol: 'BTCUSDT',
      startTime: candles[0].timestamp,
      endTime: candles[candles.length - 1].timestamp,
      initialBalance: 10000,
      betAmount: 100,
      betType: 'fixed',
      payout: 92,
      expirySeconds: 60,
      strategyId: 'rsi-ob-os',
      strategyParams: { period: 14, oversold: 30, overbought: 70 },
    };

    const skipResult = engine.run(
      { ...baseConfig, gapTradeHandling: 'skip' },
      candles,
    );
    const lossResult = engine.run(
      { ...baseConfig, gapTradeHandling: 'loss' },
      candles,
    );

    // 'loss' mode includes gap trades that 'skip' mode omits
    expect(lossResult.totalTrades).toBeGreaterThanOrEqual(skipResult.totalTrades);
    expect(lossResult.gapTradeStats!.forcedLoss).toBeGreaterThanOrEqual(0);
    expect(skipResult.gapTradeStats!.skipped).toBeGreaterThanOrEqual(0);

    console.log(
      `Skip: ${skipResult.totalTrades} trades, ${skipResult.winRate.toFixed(1)}% WR | ` +
        `Loss: ${lossResult.totalTrades} trades, ${lossResult.winRate.toFixed(1)}% WR | ` +
        `Gaps: ${lossResult.gapTradeStats!.total}`,
    );
  });
});
