// ============================================================
// Backtest Module Tests
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { BacktestEngine, getBacktestEngine } from './engine';
import { RSIStrategies, RSIOverboughtOversold } from './strategies/rsi-strategy';
import { generateTestCandles, generatePatternedData } from './data-generator';
import { BacktestConfig } from './types';

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
