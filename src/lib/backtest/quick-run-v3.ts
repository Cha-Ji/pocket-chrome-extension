// ============================================================
// Quick Backtest Runner for Strategy V3
// ============================================================

import { getBacktestEngine } from './engine';
import { StrategyV3 } from '../signals/strategies-v3';
import { Candle, BacktestConfig } from './types';
import * as fs from 'fs';

async function run() {
  const engine = getBacktestEngine();
  const v3 = new StrategyV3();
  engine.registerStrategy(v3);

  // Load Real Data
  const dataPath = '/Users/kong-bee/Documents/pocket-chrome-extension/data/BTCUSDT_1m.json';
  const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const candles: Candle[] = rawData.candles;

  console.log(`Loaded ${candles.length} candles from ${rawData.symbol} (${rawData.interval})`);

  const config: BacktestConfig = {
    symbol: rawData.symbol,
    startTime: candles[0].timestamp,
    endTime: candles[candles.length - 1].timestamp,
    initialBalance: 1000,
    betAmount: 10,
    betType: 'fixed',
    payout: 92,
    expirySeconds: 60,
    strategyId: 'strategy-v3',
    strategyParams: {
      smmaFast: 5,
      smmaMid: 12,
      smmaSlow: 25,
      stochK: 5,
      stochD: 3,
      rsiPeriod: 14,
    },
    slippage: 0,
    latencyMs: 50,
  };

  console.log('--- Running Backtest: Strategy V3 ---');
  const result = engine.run(config, candles);

  console.log(`Total Trades: ${result.totalTrades}`);
  console.log(`Win Rate: ${result.winRate.toFixed(2)}%`);
  console.log(
    `Net Profit: $${result.netProfit.toFixed(2)} (${result.netProfitPercent.toFixed(2)}%)`,
  );
  console.log(`Max Drawdown: $${result.maxDrawdown.toFixed(2)}`);
  console.log(`Profit Factor: ${result.profitFactor.toFixed(2)}`);

  // Optimization Test (Focused Range for Stability)
  console.log('\n--- Searching for Secret 52.1%+ WinRate (Focused) ---');
  const optResults = engine.optimize(config, candles, {
    smmaFast: { min: 3, max: 7, step: 2 },
    smmaMid: { min: 10, max: 14, step: 2 },
    stochK: { min: 5, max: 14, step: 9 }, // Reduced steps
    rsiPeriod: { min: 7, max: 14, step: 7 }, // Reduced steps
  });

  console.log(`Top 15 Param Combinations (out of ${optResults.length}):`);
  const topResults = optResults.slice(0, 15);
  topResults.forEach((res, i) => {
    const status = res.winRate >= 52.1 ? '✅ TARGET' : '❌ FAIL';
    console.log(
      `${i + 1}. [${status}] WR: ${res.winRate.toFixed(2)}% | Profit: $${res.netProfit.toFixed(2)} | Trades: ${res.totalTrades} | Params: ${JSON.stringify(res.config.strategyParams)}`,
    );
  });
}

run().catch(console.error);
