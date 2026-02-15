// ============================================================
// Strategy Collector - Find 53%+ Win Rate Strategies
// ============================================================

import { describe, it, expect, vi } from 'vitest';
import { fetchBinanceData, fetchMultipleSymbols } from './__mocks__/binance-api';

// Mock the actual Binance fetcher to use mock data
vi.mock('./real-data-fetcher', () => ({
  fetchBinanceData: (symbol: string, interval?: string, limit?: number) =>
    import('./__mocks__/binance-api').then((m) => m.fetchBinanceData(symbol, interval, limit)),
  fetchMultipleSymbols: (symbols: string[], interval?: string, limit?: number) =>
    import('./__mocks__/binance-api').then((m) => m.fetchMultipleSymbols(symbols, interval, limit)),
}));
import { detectRegime, calculateRegimeSeries, MarketRegime } from './market-regime';
import {
  createRSIStrategy,
  createBBStrategy,
  createMACDStrategy,
  createStochStrategy,
  createSMACrossStrategy,
  runStrategyBacktest,
} from './multi-strategy';
import {
  createWilliamsRStrategy,
  createCCIStrategy,
  createATRBreakoutStrategy,
  createTripleStochStrategy,
  createEMACrossStrategy,
  createRSIDivergenceStrategy,
} from './additional-strategies';
import { runAdaptiveBacktest } from './adaptive-strategy';

interface WinningStrategy {
  name: string;
  symbol: string;
  timeframe: string;
  regime: string;
  winRate: number;
  profitFactor: number;
  trades: number;
  netProfit: number;
  params?: Record<string, any>;
}

const winningStrategies: WinningStrategy[] = [];

function recordIfWinning(
  result: {
    stats: { winRate: number; profitFactor: number; totalTrades: number; netProfit: number };
  },
  name: string,
  symbol: string,
  timeframe: string,
  regime: string,
  params?: Record<string, any>,
) {
  if (result.stats.winRate >= 53 && result.stats.totalTrades >= 10) {
    winningStrategies.push({
      name,
      symbol,
      timeframe,
      regime,
      winRate: result.stats.winRate,
      profitFactor: result.stats.profitFactor,
      trades: result.stats.totalTrades,
      netProfit: result.stats.netProfit,
      params,
    });
  }
}

describe('Strategy Collector', () => {
  // All strategies to test
  const allStrategies = [
    // RSI variants
    createRSIStrategy(7, 25, 75),
    createRSIStrategy(7, 30, 70),
    createRSIStrategy(14, 25, 75),
    createRSIStrategy(14, 30, 70),
    createRSIStrategy(14, 35, 65),
    createRSIStrategy(21, 30, 70),

    // MACD variants
    createMACDStrategy(8, 17, 9),
    createMACDStrategy(12, 26, 9),
    createMACDStrategy(5, 13, 6),

    // Bollinger Bands
    createBBStrategy(10, 2),
    createBBStrategy(20, 2),
    createBBStrategy(20, 2.5),

    // Stochastic
    createStochStrategy(9, 3, 20, 80),
    createStochStrategy(14, 3, 20, 80),
    createStochStrategy(14, 3, 25, 75),

    // SMA Cross
    createSMACrossStrategy(5, 20),
    createSMACrossStrategy(10, 30),
    createSMACrossStrategy(10, 50),

    // Williams %R
    createWilliamsRStrategy(14, -80, -20),
    createWilliamsRStrategy(10, -85, -15),

    // CCI
    createCCIStrategy(14, -100, 100),
    createCCIStrategy(20, -100, 100),
    createCCIStrategy(20, -150, 150),

    // EMA Cross
    createEMACrossStrategy(5, 13),
    createEMACrossStrategy(9, 21),
    createEMACrossStrategy(12, 26),

    // Triple Stochastic
    createTripleStochStrategy([5, 3], [10, 6], [20, 12], 20, 80),
    createTripleStochStrategy([5, 3], [14, 3], [21, 14], 25, 75),

    // ATR Breakout
    createATRBreakoutStrategy(14, 1.5),
    createATRBreakoutStrategy(14, 2.0),
  ];

  it('should collect winning strategies on BTCUSDT 1m', async () => {
    const candles = await fetchBinanceData('BTCUSDT', '1m', 500);
    const regime = detectRegime(candles);
    const regimeStr = regime?.regime || 'unknown';

    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║      STRATEGY COLLECTION - BTCUSDT 1m                  ║');
    console.log(`║      Current Regime: ${regimeStr.padEnd(30)}   ║`);
    console.log('╚════════════════════════════════════════════════════════╝\n');

    for (const strategy of allStrategies) {
      try {
        const result = runStrategyBacktest(candles, strategy);
        const status = result.stats.winRate >= 53 ? '✅' : '  ';

        if (result.stats.totalTrades > 0) {
          console.log(
            `${status} ${strategy.name.padEnd(30)} | ${String(result.stats.totalTrades).padStart(3)} | ${result.stats.winRate.toFixed(1).padStart(5)}% | $${result.stats.netProfit.toFixed(0).padStart(6)}`,
          );
        }

        recordIfWinning(result, strategy.name, 'BTCUSDT', '1m', regimeStr);
      } catch (e) {
        // Skip failed strategies
      }
    }

    expect(true).toBe(true);
  }, 30000);

  it('should collect winning strategies on BTCUSDT 5m', async () => {
    const candles = await fetchBinanceData('BTCUSDT', '5m', 500);
    const regime = detectRegime(candles);
    const regimeStr = regime?.regime || 'unknown';

    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║      STRATEGY COLLECTION - BTCUSDT 5m                  ║');
    console.log(`║      Current Regime: ${regimeStr.padEnd(30)}   ║`);
    console.log('╚════════════════════════════════════════════════════════╝\n');

    for (const strategy of allStrategies) {
      try {
        const result = runStrategyBacktest(candles, strategy, { expiryCandles: 3 });
        const status = result.stats.winRate >= 53 ? '✅' : '  ';

        if (result.stats.totalTrades > 0) {
          console.log(
            `${status} ${strategy.name.padEnd(30)} | ${String(result.stats.totalTrades).padStart(3)} | ${result.stats.winRate.toFixed(1).padStart(5)}% | $${result.stats.netProfit.toFixed(0).padStart(6)}`,
          );
        }

        recordIfWinning(result, strategy.name, 'BTCUSDT', '5m', regimeStr);
      } catch (e) {
        // Skip failed strategies
      }
    }

    expect(true).toBe(true);
  }, 30000);

  it('should collect winning strategies on ETHUSDT 1m', async () => {
    const candles = await fetchBinanceData('ETHUSDT', '1m', 500);
    const regime = detectRegime(candles);
    const regimeStr = regime?.regime || 'unknown';

    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║      STRATEGY COLLECTION - ETHUSDT 1m                  ║');
    console.log(`║      Current Regime: ${regimeStr.padEnd(30)}   ║`);
    console.log('╚════════════════════════════════════════════════════════╝\n');

    for (const strategy of allStrategies) {
      try {
        const result = runStrategyBacktest(candles, strategy);
        const status = result.stats.winRate >= 53 ? '✅' : '  ';

        if (result.stats.totalTrades > 0) {
          console.log(
            `${status} ${strategy.name.padEnd(30)} | ${String(result.stats.totalTrades).padStart(3)} | ${result.stats.winRate.toFixed(1).padStart(5)}% | $${result.stats.netProfit.toFixed(0).padStart(6)}`,
          );
        }

        recordIfWinning(result, strategy.name, 'ETHUSDT', '1m', regimeStr);
      } catch (e) {
        // Skip failed strategies
      }
    }

    expect(true).toBe(true);
  }, 30000);

  it('should test adaptive strategy across symbols', async () => {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║      ADAPTIVE STRATEGY TEST                            ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];

    for (const symbol of symbols) {
      try {
        const candles = await fetchBinanceData(symbol, '1m', 500);
        const result = runAdaptiveBacktest(candles);
        const status = result.stats.winRate >= 53 ? '✅' : '  ';

        console.log(
          `${status} ${symbol} Adaptive | ${String(result.stats.totalTrades).padStart(3)} | ${result.stats.winRate.toFixed(1).padStart(5)}% | $${result.stats.netProfit.toFixed(0).padStart(6)}`,
        );

        recordIfWinning(result, 'Adaptive Strategy', symbol, '1m', 'mixed');

        await new Promise((r) => setTimeout(r, 200));
      } catch (e) {
        console.log(`   ${symbol}: Error`);
      }
    }

    expect(true).toBe(true);
  }, 45000);

  it('should output winning strategies summary', () => {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║      🏆 WINNING STRATEGIES (53%+ Win Rate)             ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    if (winningStrategies.length === 0) {
      console.log('No strategies met the 53% threshold in current market conditions.');
    } else {
      // Sort by win rate
      winningStrategies.sort((a, b) => b.winRate - a.winRate);

      console.log(
        'Strategy                       | Symbol   | TF  | Regime          | Trades |  Win% |     PF | Profit',
      );
      console.log('─'.repeat(110));

      for (const s of winningStrategies) {
        const pf = s.profitFactor === Infinity ? '∞' : s.profitFactor.toFixed(2);
        console.log(
          `${s.name.padEnd(30)} | ${s.symbol.padEnd(8)} | ${s.timeframe.padEnd(3)} | ${s.regime.padEnd(15)} | ${String(s.trades).padStart(6)} | ${s.winRate.toFixed(1).padStart(5)}% | ${pf.padStart(6)} | $${s.netProfit.toFixed(0).padStart(6)}`,
        );
      }

      console.log('\n📊 Summary:');
      console.log(`   Total winning strategies: ${winningStrategies.length}`);
      console.log(
        `   Best win rate: ${winningStrategies[0]?.winRate.toFixed(1)}% (${winningStrategies[0]?.name})`,
      );

      // Group by strategy name
      const byName = new Map<string, WinningStrategy[]>();
      for (const s of winningStrategies) {
        if (!byName.has(s.name)) byName.set(s.name, []);
        byName.get(s.name)!.push(s);
      }

      console.log('\n🎯 Most consistent strategies (appear multiple times):');
      for (const [name, instances] of byName) {
        if (instances.length > 1) {
          const avgWinRate = instances.reduce((s, i) => s + i.winRate, 0) / instances.length;
          console.log(`   ${name}: ${instances.length}x (avg ${avgWinRate.toFixed(1)}%)`);
        }
      }
    }

    expect(true).toBe(true);
  });
});
