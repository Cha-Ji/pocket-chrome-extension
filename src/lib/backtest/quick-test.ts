// Quick SMMA stats runner - no vitest overhead
import { BacktestEngine } from './engine';
import { SMMAStrategies } from './strategies/smma-stochastic';
import { generatePatternedData } from './data-generator';
import { calculateDetailedStatistics } from './statistics';
import { BacktestConfig } from './types';

const engine = new BacktestEngine();
SMMAStrategies.forEach((s) => engine.registerStrategy(s));

// Test different market conditions
const markets = [
  { type: 'uptrend', name: '📈 Uptrend' },
  { type: 'downtrend', name: '📉 Downtrend' },
  { type: 'ranging', name: '↔️ Ranging' },
] as const;

const strategies = [
  { id: 'smma-stoch-bitshin', name: 'Conservative', trendStrength: 4 },
  { id: 'smma-stoch-aggressive', name: 'Aggressive', trendStrength: 3 },
];

console.log('\n╔═══════════════════════════════════════════════════════╗');
console.log('║    SMMA + STOCHASTIC BACKTEST STATISTICS             ║');
console.log('╚═══════════════════════════════════════════════════════╝');

for (const market of markets) {
  console.log(`\n${market.name} (500 candles)`);
  console.log('─'.repeat(55));

  const candles = generatePatternedData(market.type, 500);

  for (const strat of strategies) {
    const config: BacktestConfig = {
      symbol: 'TEST',
      startTime: candles[0].timestamp,
      endTime: candles[candles.length - 1].timestamp,
      initialBalance: 10000,
      betAmount: 100,
      betType: 'fixed',
      payout: 92,
      expirySeconds: 60,
      strategyId: strat.id,
      strategyParams: {
        trendStrength: strat.trendStrength,
        overlapTolerance: 1,
      },
    };

    const result = engine.run(config, candles);
    const stats = calculateDetailedStatistics(result.trades, config.initialBalance);

    const status = stats.winRate >= 53 ? '✅' : '❌';
    console.log(
      `  ${strat.name}: ${stats.totalTrades} trades | Win ${stats.winRate.toFixed(1)}% | PF ${stats.profitFactor.toFixed(2)} | $${stats.netProfit.toFixed(0)} ${status}`,
    );
  }
}

console.log('\n═══════════════════════════════════════════════════════');
console.log('Target: Win Rate >= 53% (for 92% payout)');
console.log('═══════════════════════════════════════════════════════\n');
