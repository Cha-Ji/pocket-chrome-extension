// ============================================================
// MACD Strategy Tests
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  MACDCrossover,
  MACDHistogramReversal,
  MACDZeroCross,
  MACDDivergence,
  MACDStrategies,
} from './macd-strategy';
import { Candle } from '../types';

// ============================================================
// Test Data Generators
// ============================================================

function generateTrendingData(count: number = 60, direction: 'up' | 'down' = 'up'): Candle[] {
  const candles: Candle[] = [];
  let price = 100;

  for (let i = 0; i < count; i++) {
    const trend = direction === 'up' ? 0.3 : -0.3;
    const noise = (Math.random() - 0.5) * 0.2;
    price = price * (1 + (trend + noise) / 100);

    const volatility = Math.random() * 0.2 + 0.1;
    const open = direction === 'up' ? price - volatility : price + volatility;
    const close = price;
    candles.push({
      timestamp: Date.now() + i * 60000,
      open,
      high: Math.max(open, close) + volatility * 0.5,
      low: Math.min(open, close) - volatility * 0.5,
      close,
    });
  }

  return candles;
}

function generateCrossoverData(count: number = 80): Candle[] {
  const candles: Candle[] = [];
  let price = 100;

  // Down trend then up trend to create crossover
  for (let i = 0; i < count / 2; i++) {
    price = price * (1 - 0.3 / 100 + ((Math.random() - 0.5) * 0.2) / 100);
    const volatility = Math.random() * 0.2 + 0.1;
    candles.push({
      timestamp: Date.now() + i * 60000,
      open: price + volatility,
      high: price + volatility * 1.5,
      low: price - volatility * 0.5,
      close: price,
    });
  }

  for (let i = count / 2; i < count; i++) {
    price = price * (1 + 0.4 / 100 + ((Math.random() - 0.5) * 0.2) / 100);
    const volatility = Math.random() * 0.2 + 0.1;
    candles.push({
      timestamp: Date.now() + i * 60000,
      open: price - volatility,
      high: price + volatility * 0.5,
      low: price - volatility * 1.5,
      close: price,
    });
  }

  return candles;
}

function generateRangingData(count: number = 60): Candle[] {
  const candles: Candle[] = [];
  let price = 100;

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 0.4;
    price = price * (1 + change / 100);

    const volatility = Math.random() * 0.2 + 0.1;
    candles.push({
      timestamp: Date.now() + i * 60000,
      open: price - volatility / 2,
      high: price + volatility,
      low: price - volatility,
      close: price + volatility / 2,
    });
  }

  return candles;
}

// ============================================================
// MACDCrossover Tests
// ============================================================

describe('MACDCrossover Strategy', () => {
  const defaultParams = {
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
  };

  it('should have correct strategy metadata', () => {
    expect(MACDCrossover.id).toBe('macd-crossover');
    expect(MACDCrossover.name).toBe('MACD Crossover');
    expect(MACDCrossover.params).toHaveProperty('fastPeriod');
    expect(MACDCrossover.params).toHaveProperty('slowPeriod');
    expect(MACDCrossover.params).toHaveProperty('signalPeriod');
  });

  it('should return null with insufficient data', () => {
    const candles = generateRangingData(20);
    const result = MACDCrossover.generateSignal(candles, defaultParams);
    expect(result).toBeNull();
  });

  it('should return signal with valid data', () => {
    const candles = generateCrossoverData(80);
    const result = MACDCrossover.generateSignal(candles, defaultParams);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('direction');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('indicators');
  });

  it('should include MACD values in indicators', () => {
    const candles = generateCrossoverData(80);
    const result = MACDCrossover.generateSignal(candles, defaultParams);
    expect(result?.indicators).toHaveProperty('macd');
    expect(result?.indicators).toHaveProperty('signal');
    expect(result?.indicators).toHaveProperty('histogram');
  });

  it('should have confidence between 0 and 1', () => {
    const candles = generateCrossoverData(100);
    const result = MACDCrossover.generateSignal(candles, defaultParams);
    expect(result?.confidence).toBeGreaterThanOrEqual(0);
    expect(result?.confidence).toBeLessThanOrEqual(1);
  });
});

// ============================================================
// MACDHistogramReversal Tests
// ============================================================

describe('MACDHistogramReversal Strategy', () => {
  const defaultParams = {
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    minHistogram: 0.1,
  };

  it('should have correct strategy metadata', () => {
    expect(MACDHistogramReversal.id).toBe('macd-histogram-reversal');
    expect(MACDHistogramReversal.name).toBe('MACD Histogram Reversal');
    expect(MACDHistogramReversal.params).toHaveProperty('minHistogram');
  });

  it('should return null with insufficient data', () => {
    const candles = generateRangingData(20);
    const result = MACDHistogramReversal.generateSignal(candles, defaultParams);
    expect(result).toBeNull();
  });

  it('should return signal with valid data', () => {
    const candles = generateCrossoverData(80);
    const result = MACDHistogramReversal.generateSignal(candles, defaultParams);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('direction');
    expect(result).toHaveProperty('indicators');
  });

  it('should include histogram in indicators', () => {
    const candles = generateCrossoverData(80);
    const result = MACDHistogramReversal.generateSignal(candles, defaultParams);
    expect(result?.indicators).toHaveProperty('histogram');
    expect(result?.indicators).toHaveProperty('prevHistogram');
  });
});

// ============================================================
// MACDZeroCross Tests
// ============================================================

describe('MACDZeroCross Strategy', () => {
  const defaultParams = {
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
  };

  it('should have correct strategy metadata', () => {
    expect(MACDZeroCross.id).toBe('macd-zero-cross');
    expect(MACDZeroCross.name).toBe('MACD Zero Line Cross');
  });

  it('should return null with insufficient data', () => {
    const candles = generateRangingData(20);
    const result = MACDZeroCross.generateSignal(candles, defaultParams);
    expect(result).toBeNull();
  });

  it('should return signal with valid data', () => {
    const candles = generateCrossoverData(80);
    const result = MACDZeroCross.generateSignal(candles, defaultParams);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('direction');
    expect(result).toHaveProperty('indicators');
  });
});

// ============================================================
// MACDDivergence Tests
// ============================================================

describe('MACDDivergence Strategy', () => {
  const defaultParams = {
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    lookback: 10,
  };

  it('should have correct strategy metadata', () => {
    expect(MACDDivergence.id).toBe('macd-divergence');
    expect(MACDDivergence.name).toBe('MACD Divergence');
    expect(MACDDivergence.params).toHaveProperty('lookback');
  });

  it('should return null with insufficient data', () => {
    const candles = generateRangingData(20);
    const result = MACDDivergence.generateSignal(candles, defaultParams);
    expect(result).toBeNull();
  });

  it('should return signal with valid data', () => {
    const candles = generateTrendingData(80);
    const result = MACDDivergence.generateSignal(candles, defaultParams);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('direction');
    expect(result).toHaveProperty('indicators');
  });

  it('should include divergence data in indicators', () => {
    const candles = generateTrendingData(80);
    const result = MACDDivergence.generateSignal(candles, defaultParams);
    expect(result?.indicators).toHaveProperty('priceLL');
    expect(result?.indicators).toHaveProperty('priceHH');
    expect(result?.indicators).toHaveProperty('macdLL');
    expect(result?.indicators).toHaveProperty('macdHH');
  });
});

// ============================================================
// MACDStrategies Array Tests
// ============================================================

describe('MACDStrategies Collection', () => {
  it('should export 4 strategies', () => {
    expect(MACDStrategies).toHaveLength(4);
  });

  it('should include all MACD strategies', () => {
    const ids = MACDStrategies.map((s) => s.id);
    expect(ids).toContain('macd-crossover');
    expect(ids).toContain('macd-histogram-reversal');
    expect(ids).toContain('macd-zero-cross');
    expect(ids).toContain('macd-divergence');
  });

  it('all strategies should implement the Strategy interface', () => {
    MACDStrategies.forEach((strategy) => {
      expect(strategy).toHaveProperty('id');
      expect(strategy).toHaveProperty('name');
      expect(strategy).toHaveProperty('description');
      expect(strategy).toHaveProperty('params');
      expect(strategy).toHaveProperty('generateSignal');
      expect(typeof strategy.generateSignal).toBe('function');
    });
  });
});
