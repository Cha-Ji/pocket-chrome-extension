// ============================================================
// SMMA Strategy Parameter Optimization
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  runFastBacktest,
  generateMediumTestData,
  formatStats,
  BacktestStats,
} from './test-helpers';

interface OptimizationResult {
  params: Record<string, number>;
  stats: BacktestStats;
}

describe('SMMA Strategy Optimization', () => {
  // Use consistent seed-like data for reproducibility
  const rangingCandles = generateMediumTestData('ranging', 500);
  const uptrendCandles = generateMediumTestData('uptrend', 500);
  const downtrendCandles = generateMediumTestData('downtrend', 500);

  it('should find optimal trend strength', () => {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('         TREND STRENGTH OPTIMIZATION');
    console.log('═══════════════════════════════════════════════════════');

    const results: OptimizationResult[] = [];

    for (const strength of [3, 4, 5, 6]) {
      const { stats } = runFastBacktest(rangingCandles, { trendStrength: strength });
      results.push({ params: { trendStrength: strength }, stats });
      console.log(formatStats(stats, `trendStrength=${strength}`));
    }

    const best = results.reduce((a, b) => (a.stats.winRate > b.stats.winRate ? a : b));
    console.log(
      `\n🏆 Best: trendStrength=${best.params.trendStrength} (${best.stats.winRate.toFixed(1)}%)`,
    );

    expect(results.length).toBe(4);
  });

  it('should find optimal stochastic levels', () => {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('         STOCHASTIC LEVELS OPTIMIZATION');
    console.log('═══════════════════════════════════════════════════════');

    const results: OptimizationResult[] = [];
    const levels = [
      { oversold: 20, overbought: 80 },
      { oversold: 25, overbought: 75 },
      { oversold: 30, overbought: 70 },
      { oversold: 35, overbought: 65 },
    ];

    for (const level of levels) {
      const { stats } = runFastBacktest(rangingCandles, {
        trendStrength: 4,
        ...level,
      });
      results.push({ params: level, stats });
      console.log(formatStats(stats, `OS=${level.oversold} OB=${level.overbought}`));
    }

    const best = results.reduce((a, b) => (a.stats.winRate > b.stats.winRate ? a : b));
    console.log(
      `\n🏆 Best: OS=${best.params.oversold} OB=${best.params.overbought} (${best.stats.winRate.toFixed(1)}%)`,
    );

    expect(results.length).toBe(4);
  });

  it('should find optimal expiry', () => {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('         EXPIRY CANDLES OPTIMIZATION');
    console.log('═══════════════════════════════════════════════════════');

    const results: OptimizationResult[] = [];

    for (const expiry of [2, 3, 4, 5, 6, 8]) {
      const { stats } = runFastBacktest(rangingCandles, {
        trendStrength: 4,
        expiryCandles: expiry,
      });
      results.push({ params: { expiryCandles: expiry }, stats });
      console.log(formatStats(stats, `expiry=${expiry} candles`));
    }

    const best = results.reduce((a, b) => (a.stats.winRate > b.stats.winRate ? a : b));
    console.log(
      `\n🏆 Best: expiry=${best.params.expiryCandles} candles (${best.stats.winRate.toFixed(1)}%)`,
    );

    expect(results.length).toBe(6);
  });

  it('should run full grid search', () => {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('         FULL GRID SEARCH (TOP 10)');
    console.log('═══════════════════════════════════════════════════════');

    const results: OptimizationResult[] = [];

    // Grid search over key parameters
    for (const trendStrength of [3, 4, 5]) {
      for (const oversold of [20, 30]) {
        for (const expiryCandles of [3, 4, 5]) {
          const { stats } = runFastBacktest(rangingCandles, {
            trendStrength,
            oversold,
            overbought: 100 - oversold,
            expiryCandles,
          });
          results.push({
            params: { trendStrength, oversold, overbought: 100 - oversold, expiryCandles },
            stats,
          });
        }
      }
    }

    // Sort by profit factor (more stable than win rate)
    results.sort((a, b) => b.stats.profitFactor - a.stats.profitFactor);

    console.log('\nTop 10 configurations by Profit Factor:');
    results.slice(0, 10).forEach((r, i) => {
      const p = r.params;
      console.log(
        `${i + 1}. TS=${p.trendStrength} OS=${p.oversold} EXP=${p.expiryCandles} | WR=${r.stats.winRate.toFixed(1)}% PF=${r.stats.profitFactor.toFixed(2)} $${r.stats.netProfit.toFixed(0)}`,
      );
    });

    expect(results.length).toBeGreaterThan(0);
  });
});
