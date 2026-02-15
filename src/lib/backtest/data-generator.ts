// ============================================================
// Test Data Generator for Backtesting
// ============================================================
// Generates realistic-looking price data for testing
// ============================================================

import { Candle } from './types';

export interface DataGeneratorConfig {
  symbol: string;
  startPrice: number;
  volatility: number; // daily volatility percentage
  trend: number; // daily trend percentage (-1 to 1)
  candleIntervalMs: number; // e.g., 60000 for 1 minute
  count: number; // number of candles
}

const DEFAULT_CONFIG: DataGeneratorConfig = {
  symbol: 'TEST/USD',
  startPrice: 100,
  volatility: 0.02, // 2% daily volatility
  trend: 0, // no trend
  candleIntervalMs: 60000, // 1 minute
  count: 1000,
};

/**
 * Generate synthetic OHLCV data using geometric brownian motion
 */
export function generateTestCandles(config: Partial<DataGeneratorConfig> = {}): Candle[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const candles: Candle[] = [];

  // Scale volatility to candle interval
  const candlesPerDay = (24 * 60 * 60 * 1000) / cfg.candleIntervalMs;
  const candleVolatility = cfg.volatility / Math.sqrt(candlesPerDay);
  const candleTrend = cfg.trend / candlesPerDay;

  let price = cfg.startPrice;
  let timestamp = Date.now() - cfg.count * cfg.candleIntervalMs;

  for (let i = 0; i < cfg.count; i++) {
    // Generate random walk with drift
    const randomReturn = (Math.random() - 0.5) * 2 * candleVolatility + candleTrend;
    const newPrice = price * (1 + randomReturn);

    // Generate OHLC within the candle
    const open = price;
    const close = newPrice;
    const high = Math.max(open, close) * (1 + Math.random() * candleVolatility * 0.5);
    const low = Math.min(open, close) * (1 - Math.random() * candleVolatility * 0.5);
    const volume = Math.random() * 1000000;

    candles.push({
      timestamp,
      open,
      high,
      low,
      close,
      volume,
    });

    price = newPrice;
    timestamp += cfg.candleIntervalMs;
  }

  return candles;
}

/**
 * Generate data with specific pattern for testing
 */
export function generatePatternedData(
  pattern: 'uptrend' | 'downtrend' | 'ranging' | 'volatile',
  count: number = 500,
): Candle[] {
  const patterns: Record<string, Partial<DataGeneratorConfig>> = {
    uptrend: { trend: 0.003, volatility: 0.015 },
    downtrend: { trend: -0.003, volatility: 0.015 },
    ranging: { trend: 0, volatility: 0.01 },
    volatile: { trend: 0, volatility: 0.04 },
  };

  return generateTestCandles({ ...patterns[pattern], count });
}

/**
 * Add noise/spikes to existing data for realistic testing
 */
export function addNoise(candles: Candle[], spikeChance: number = 0.01): Candle[] {
  return candles.map((c) => {
    if (Math.random() < spikeChance) {
      // Add a spike
      const direction = Math.random() > 0.5 ? 1 : -1;
      const magnitude = 1 + Math.random() * 0.02 * direction;
      return {
        ...c,
        high: c.high * (direction > 0 ? magnitude : 1),
        low: c.low * (direction < 0 ? magnitude : 1),
        close: c.close * magnitude,
      };
    }
    return c;
  });
}

/**
 * Convert real tick data to candles
 */
export function ticksToCandles(
  ticks: { timestamp: number; price: number }[],
  intervalMs: number = 60000,
): Candle[] {
  if (ticks.length === 0) return [];

  const candles: Candle[] = [];
  let currentCandle: Candle | null = null;

  for (const tick of ticks) {
    const candleStart = Math.floor(tick.timestamp / intervalMs) * intervalMs;

    if (!currentCandle || currentCandle.timestamp !== candleStart) {
      if (currentCandle) {
        candles.push(currentCandle);
      }
      currentCandle = {
        timestamp: candleStart,
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price,
      };
    } else {
      currentCandle.high = Math.max(currentCandle.high, tick.price);
      currentCandle.low = Math.min(currentCandle.low, tick.price);
      currentCandle.close = tick.price;
    }
  }

  if (currentCandle) {
    candles.push(currentCandle);
  }

  return candles;
}
