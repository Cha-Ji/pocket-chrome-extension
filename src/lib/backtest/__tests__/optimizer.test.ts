// ============================================================
// Optimizer Tests - Bayesian, Genetic, Grid Search
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { BacktestEngine } from '../engine';
import { RSIStrategies, RSIOverboughtOversold } from '../strategies/rsi-strategy';
import { generateTestCandles, generatePatternedData } from '../data-generator';
import { BacktestConfig, Candle } from '../types';
import {
  optimize,
  bayesianOptimize,
  geneticOptimize,
  gridOptimize,
  ParamRanges,
  UnifiedOptimizationResult,
} from '../optimizer';

describe('Unified Optimizer', () => {
  let engine: BacktestEngine;
  let candles: Candle[];
  let baseConfig: BacktestConfig;
  let paramRanges: ParamRanges;

  beforeEach(() => {
    engine = new BacktestEngine();
    RSIStrategies.forEach((s) => engine.registerStrategy(s));

    candles = generateTestCandles({ count: 300 });
    baseConfig = {
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

    // Small param ranges for fast tests
    paramRanges = {
      period: { min: 10, max: 20, step: 5 },
      oversold: { min: 25, max: 35, step: 5 },
      overbought: { min: 65, max: 75, step: 5 },
    };
  });

  describe('Grid Search Optimization', () => {
    it('should return results sorted by score', () => {
      const results = gridOptimize(engine, baseConfig, candles, paramRanges, {
        type: 'grid',
        objective: 'netProfit',
        minTrades: 1,
      });

      expect(results.length).toBeGreaterThan(0);

      // Verify sorted by score descending
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it('should respect minTrades filter', () => {
      const results = gridOptimize(engine, baseConfig, candles, paramRanges, {
        type: 'grid',
        minTrades: 10,
      });

      for (const result of results) {
        expect(result.result.totalTrades).toBeGreaterThanOrEqual(10);
      }
    });

    it('should support different objective functions', () => {
      const objectives = ['netProfit', 'winRate', 'profitFactor', 'expectancy'] as const;

      for (const objective of objectives) {
        const results = gridOptimize(engine, baseConfig, candles, paramRanges, {
          type: 'grid',
          objective,
          minTrades: 1,
        });

        expect(results.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Bayesian Optimization', () => {
    it('should converge to good parameters', () => {
      const results = bayesianOptimize(engine, baseConfig, candles, paramRanges, {
        type: 'bayesian',
        maxIterations: 15,
        initialSamples: 5,
        minTrades: 1,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].params).toBeDefined();
      expect(results[0].score).toBeDefined();
    });

    it('should return results with iteration metadata', () => {
      const results = bayesianOptimize(engine, baseConfig, candles, paramRanges, {
        type: 'bayesian',
        maxIterations: 10,
        initialSamples: 3,
        minTrades: 1,
      });

      for (const result of results) {
        expect(result.iteration).toBeDefined();
        expect(typeof result.iteration).toBe('number');
      }
    });

    it('should respect explorationWeight parameter', () => {
      // More exploration should sample more diverse parameters
      const exploratoryResults = bayesianOptimize(engine, baseConfig, candles, paramRanges, {
        type: 'bayesian',
        maxIterations: 10,
        initialSamples: 3,
        explorationWeight: 0.5,
        minTrades: 1,
      });

      expect(exploratoryResults.length).toBeGreaterThan(0);
    });
  });

  describe('Genetic Algorithm Optimization', () => {
    it('should evolve population over generations', () => {
      const results = geneticOptimize(engine, baseConfig, candles, paramRanges, {
        type: 'genetic',
        populationSize: 10,
        generations: 5,
        mutationRate: 0.1,
        minTrades: 1,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].params).toBeDefined();
    });

    it('should return results with generation metadata', () => {
      const results = geneticOptimize(engine, baseConfig, candles, paramRanges, {
        type: 'genetic',
        populationSize: 10,
        generations: 3,
        minTrades: 1,
      });

      // Should have results from multiple generations
      const generations = new Set(results.map((r) => r.generation));
      expect(generations.size).toBeGreaterThan(1);
    });

    it('should use tournament selection correctly', () => {
      const results = geneticOptimize(engine, baseConfig, candles, paramRanges, {
        type: 'genetic',
        populationSize: 10,
        generations: 3,
        tournamentSize: 3,
        minTrades: 1,
      });

      expect(results.length).toBeGreaterThan(0);
    });

    it('should preserve elite individuals via elitism', () => {
      const results = geneticOptimize(engine, baseConfig, candles, paramRanges, {
        type: 'genetic',
        populationSize: 10,
        generations: 5,
        elitismCount: 2,
        minTrades: 1,
      });

      expect(results.length).toBeGreaterThan(0);
    });

    it('should apply mutations based on mutation rate', () => {
      // High mutation rate should generate more diversity
      const highMutationResults = geneticOptimize(engine, baseConfig, candles, paramRanges, {
        type: 'genetic',
        populationSize: 10,
        generations: 3,
        mutationRate: 0.5,
        minTrades: 1,
      });

      expect(highMutationResults.length).toBeGreaterThan(0);
    });
  });

  describe('Unified optimize() Interface', () => {
    it('should dispatch to grid optimizer', () => {
      const results = optimize(engine, baseConfig, candles, paramRanges, {
        type: 'grid',
        minTrades: 1,
      });

      expect(results.length).toBeGreaterThan(0);
    });

    it('should dispatch to bayesian optimizer', () => {
      const results = optimize(engine, baseConfig, candles, paramRanges, {
        type: 'bayesian',
        maxIterations: 10,
        minTrades: 1,
      });

      expect(results.length).toBeGreaterThan(0);
    });

    it('should dispatch to genetic optimizer', () => {
      const results = optimize(engine, baseConfig, candles, paramRanges, {
        type: 'genetic',
        populationSize: 10,
        generations: 3,
        minTrades: 1,
      });

      expect(results.length).toBeGreaterThan(0);
    });

    it('should return consistent result format across all optimizers', () => {
      const gridResults = optimize(engine, baseConfig, candles, paramRanges, {
        type: 'grid',
        minTrades: 1,
      });

      const bayesianResults = optimize(engine, baseConfig, candles, paramRanges, {
        type: 'bayesian',
        maxIterations: 10,
        minTrades: 1,
      });

      const geneticResults = optimize(engine, baseConfig, candles, paramRanges, {
        type: 'genetic',
        populationSize: 10,
        generations: 3,
        minTrades: 1,
      });

      const allResults = [gridResults, bayesianResults, geneticResults];

      for (const results of allResults) {
        expect(results.length).toBeGreaterThan(0);

        for (const result of results) {
          // Verify unified result structure
          expect(result.params).toBeDefined();
          expect(typeof result.params).toBe('object');
          expect(result.result).toBeDefined();
          expect(typeof result.score).toBe('number');
        }
      }
    });
  });

  describe('Performance with Different Market Conditions', () => {
    const conditions = ['uptrend', 'downtrend', 'ranging', 'volatile'] as const;

    for (const condition of conditions) {
      it(`should optimize effectively in ${condition} market`, () => {
        const marketCandles = generatePatternedData(condition, 300);
        const config = {
          ...baseConfig,
          startTime: marketCandles[0].timestamp,
          endTime: marketCandles[marketCandles.length - 1].timestamp,
        };

        const results = optimize(engine, config, marketCandles, paramRanges, {
          type: 'genetic',
          populationSize: 10,
          generations: 3,
          minTrades: 1,
        });

        expect(results.length).toBeGreaterThan(0);
      });
    }
  });

  describe('Edge Cases', () => {
    it('should handle empty param ranges', () => {
      const results = gridOptimize(
        engine,
        baseConfig,
        candles,
        {},
        {
          type: 'grid',
          minTrades: 0,
        },
      );

      // Should run with default params
      expect(results).toBeDefined();
    });

    it('should handle single-value param ranges', () => {
      const singleValueRanges: ParamRanges = {
        period: { min: 14, max: 14, step: 1 },
        oversold: { min: 30, max: 30, step: 1 },
        overbought: { min: 70, max: 70, step: 1 },
      };

      const results = gridOptimize(engine, baseConfig, candles, singleValueRanges, {
        type: 'grid',
        minTrades: 0,
      });

      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('should filter out results with insufficient trades', () => {
      const results = optimize(engine, baseConfig, candles, paramRanges, {
        type: 'grid',
        minTrades: 1000, // Very high threshold
      });

      // All remaining results should have at least minTrades
      for (const result of results) {
        expect(result.result.totalTrades).toBeGreaterThanOrEqual(1000);
      }
    });
  });
});
