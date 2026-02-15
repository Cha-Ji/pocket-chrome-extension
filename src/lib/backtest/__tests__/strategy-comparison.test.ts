// ============================================================
// Multi-Strategy Comparison Tests
// ============================================================

import { describe, it, expect } from 'vitest';
import { generateMediumTestData } from './test-helpers';
import {
  createRSIStrategy,
  createBBStrategy,
  createMACDStrategy,
  createStochStrategy,
  createSMACrossStrategy,
  compareStrategies,
  formatComparison,
} from './multi-strategy';

describe('Strategy Comparison', () => {
  const rangingCandles = generateMediumTestData('ranging', 500);
  const uptrendCandles = generateMediumTestData('uptrend', 500);
  const downtrendCandles = generateMediumTestData('downtrend', 500);

  const strategies = [
    createRSIStrategy(14, 30, 70),
    createRSIStrategy(7, 25, 75),
    createBBStrategy(20, 2),
    createBBStrategy(20, 2.5),
    createMACDStrategy(12, 26, 9),
    createMACDStrategy(8, 17, 9),
    createStochStrategy(14, 3, 20, 80),
    createStochStrategy(9, 3, 25, 75),
    createSMACrossStrategy(5, 20),
    createSMACrossStrategy(10, 30),
  ];

  it('should compare strategies in ranging market', () => {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║        STRATEGY COMPARISON - RANGING MARKET            ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log('    Strategy                  | Trades | Win % |   PF   | Profit');
    console.log('─'.repeat(70));

    const results = compareStrategies(rangingCandles, strategies);
    console.log(formatComparison(results));

    expect(results.length).toBe(strategies.length);
  });

  it('should compare strategies in uptrend market', () => {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║        STRATEGY COMPARISON - UPTREND MARKET            ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log('    Strategy                  | Trades | Win % |   PF   | Profit');
    console.log('─'.repeat(70));

    const results = compareStrategies(uptrendCandles, strategies);
    console.log(formatComparison(results));

    expect(results.length).toBe(strategies.length);
  });

  it('should compare strategies in downtrend market', () => {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║        STRATEGY COMPARISON - DOWNTREND MARKET          ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log('    Strategy                  | Trades | Win % |   PF   | Profit');
    console.log('─'.repeat(70));

    const results = compareStrategies(downtrendCandles, strategies);
    console.log(formatComparison(results));

    expect(results.length).toBe(strategies.length);
  });

  it('should find best strategy per market', () => {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║              BEST STRATEGY PER MARKET                  ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    const markets = [
      { name: '↔️ Ranging', candles: rangingCandles },
      { name: '📈 Uptrend', candles: uptrendCandles },
      { name: '📉 Downtrend', candles: downtrendCandles },
    ];

    for (const market of markets) {
      const results = compareStrategies(market.candles, strategies);
      const best = results.reduce((a, b) => (a.stats.profitFactor > b.stats.profitFactor ? a : b));

      const status = best.stats.winRate >= 53 ? '✅' : '❌';
      console.log(`${market.name}: ${best.name}`);
      console.log(
        `   → ${best.stats.totalTrades} trades | ${best.stats.winRate.toFixed(1)}% | PF ${best.stats.profitFactor.toFixed(2)} | $${best.stats.netProfit.toFixed(0)} ${status}\n`,
      );
    }

    expect(true).toBe(true);
  });
});

describe('RSI Strategy Tuning', () => {
  const candles = generateMediumTestData('ranging', 500);

  it('should optimize RSI parameters', () => {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('              RSI PARAMETER OPTIMIZATION');
    console.log('═══════════════════════════════════════════════════════');

    const configs = [
      { period: 7, oversold: 25, overbought: 75 },
      { period: 7, oversold: 30, overbought: 70 },
      { period: 14, oversold: 25, overbought: 75 },
      { period: 14, oversold: 30, overbought: 70 },
      { period: 14, oversold: 35, overbought: 65 },
      { period: 21, oversold: 30, overbought: 70 },
    ];

    const strategies = configs.map((c) => createRSIStrategy(c.period, c.oversold, c.overbought));
    const results = compareStrategies(candles, strategies);

    console.log('    Strategy                  | Trades | Win % |   PF   | Profit');
    console.log('─'.repeat(70));
    console.log(formatComparison(results));

    expect(results.length).toBe(configs.length);
  });
});

describe('Bollinger Bands Strategy Tuning', () => {
  const candles = generateMediumTestData('ranging', 500);

  it('should optimize BB parameters', () => {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('           BOLLINGER BANDS OPTIMIZATION');
    console.log('═══════════════════════════════════════════════════════');

    const configs = [
      { period: 10, stdDev: 2 },
      { period: 15, stdDev: 2 },
      { period: 20, stdDev: 2 },
      { period: 20, stdDev: 2.5 },
      { period: 20, stdDev: 3 },
    ];

    const strategies = configs.map((c) => createBBStrategy(c.period, c.stdDev));
    const results = compareStrategies(candles, strategies);

    console.log('    Strategy                  | Trades | Win % |   PF   | Profit');
    console.log('─'.repeat(70));
    console.log(formatComparison(results));

    expect(results.length).toBe(configs.length);
  });
});

describe('Combined Strategy Analysis', () => {
  it('should test across multiple market conditions', () => {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║           AGGREGATE PERFORMANCE (3 MARKETS)            ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    const markets = [
      generateMediumTestData('ranging', 400),
      generateMediumTestData('uptrend', 400),
      generateMediumTestData('downtrend', 400),
    ];

    const strategies = [
      createRSIStrategy(14, 30, 70),
      createBBStrategy(20, 2),
      createMACDStrategy(12, 26, 9),
      createStochStrategy(14, 3, 20, 80),
      createSMACrossStrategy(10, 30),
    ];

    // Aggregate stats across all markets
    const aggregated = strategies.map((s) => {
      let totalTrades = 0;
      let totalWins = 0;
      let totalProfit = 0;

      for (const candles of markets) {
        const results = compareStrategies(candles, [s]);
        totalTrades += results[0].stats.totalTrades;
        totalWins += results[0].stats.wins;
        totalProfit += results[0].stats.netProfit;
      }

      return {
        name: s.name,
        totalTrades,
        winRate: totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0,
        totalProfit,
      };
    });

    aggregated.sort((a, b) => b.winRate - a.winRate);

    console.log('Strategy                     | Total Trades | Avg Win % | Total Profit');
    console.log('─'.repeat(70));
    aggregated.forEach((a, i) => {
      const status = a.winRate >= 53 ? '✅' : '❌';
      console.log(
        `${(i + 1).toString().padStart(2)}. ${a.name.padEnd(23)} | ${String(a.totalTrades).padStart(12)} | ${a.winRate.toFixed(1).padStart(9)}% | $${a.totalProfit.toFixed(0).padStart(10)} ${status}`,
      );
    });

    expect(aggregated.length).toBe(strategies.length);
  });
});
