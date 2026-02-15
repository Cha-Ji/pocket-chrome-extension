// ============================================================
// Bollinger Bands Strategy Tests
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  BollingerBounce,
  BollingerBreakout,
  BollingerSqueeze,
  BollingerRSI,
  BollingerStrategies,
} from './bollinger-strategy';
import { Candle } from '../types';

// ============================================================
// Test Data Generators
// ============================================================

function generateRangingData(count: number = 50): Candle[] {
  const candles: Candle[] = [];
  let price = 100;

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 0.4;
    price = price * (1 + change / 100);

    const volatility = Math.random() * 0.3 + 0.1;
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

function generateBandTouchData(count: number = 50, touchLower: boolean = true): Candle[] {
  const candles: Candle[] = [];
  let price = 100;

  // Normal ranging
  for (let i = 0; i < count * 0.7; i++) {
    const change = (Math.random() - 0.5) * 0.3;
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

  // Move to band touch
  const direction = touchLower ? -1 : 1;
  for (let i = Math.floor(count * 0.7); i < count - 3; i++) {
    price = price * (1 + (direction * 0.5) / 100);
    const volatility = Math.random() * 0.2 + 0.1;
    candles.push({
      timestamp: Date.now() + i * 60000,
      open: price,
      high: price + volatility,
      low: price - volatility,
      close: price + (direction * volatility) / 2,
    });
  }

  // Bounce back
  for (let i = count - 3; i < count; i++) {
    price = price * (1 - (direction * 0.3) / 100);
    const volatility = Math.random() * 0.2 + 0.1;
    candles.push({
      timestamp: Date.now() + i * 60000,
      open: price,
      high: price + volatility,
      low: price - volatility,
      close: price - (direction * volatility) / 2,
    });
  }

  return candles;
}

function generateSqueezeData(count: number = 60): Candle[] {
  const candles: Candle[] = [];
  let price = 100;

  // High volatility phase
  for (let i = 0; i < count * 0.4; i++) {
    const change = (Math.random() - 0.5) * 0.8;
    price = price * (1 + change / 100);

    const volatility = Math.random() * 0.5 + 0.3;
    candles.push({
      timestamp: Date.now() + i * 60000,
      open: price - volatility / 2,
      high: price + volatility,
      low: price - volatility,
      close: price + volatility / 2,
    });
  }

  // Low volatility (squeeze) phase
  for (let i = Math.floor(count * 0.4); i < count * 0.8; i++) {
    const change = (Math.random() - 0.5) * 0.1;
    price = price * (1 + change / 100);

    const volatility = Math.random() * 0.05 + 0.02;
    candles.push({
      timestamp: Date.now() + i * 60000,
      open: price - volatility / 2,
      high: price + volatility,
      low: price - volatility,
      close: price + volatility / 2,
    });
  }

  // Expansion phase
  for (let i = Math.floor(count * 0.8); i < count; i++) {
    const change = Math.random() * 0.6 + 0.2;
    price = price * (1 + change / 100);

    const volatility = Math.random() * 0.4 + 0.2;
    candles.push({
      timestamp: Date.now() + i * 60000,
      open: price - volatility,
      high: price + volatility,
      low: price - volatility * 0.5,
      close: price,
    });
  }

  return candles;
}

// ============================================================
// BollingerBounce Tests
// ============================================================

describe('BollingerBounce Strategy', () => {
  const defaultParams = {
    period: 20,
    stdDev: 2,
    touchThreshold: 0.001,
  };

  it('should have correct strategy metadata', () => {
    expect(BollingerBounce.id).toBe('bollinger-bounce');
    expect(BollingerBounce.name).toBe('Bollinger Band Bounce');
    expect(BollingerBounce.params).toHaveProperty('period');
    expect(BollingerBounce.params).toHaveProperty('stdDev');
    expect(BollingerBounce.params).toHaveProperty('touchThreshold');
  });

  it('should return null with insufficient data', () => {
    const candles = generateRangingData(10);
    const result = BollingerBounce.generateSignal(candles, defaultParams);
    expect(result).toBeNull();
  });

  it('should return signal with valid data', () => {
    const candles = generateBandTouchData(50, true);
    const result = BollingerBounce.generateSignal(candles, defaultParams);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('direction');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('indicators');
  });

  it('should include Bollinger Band values in indicators', () => {
    const candles = generateRangingData(50);
    const result = BollingerBounce.generateSignal(candles, defaultParams);
    expect(result?.indicators).toHaveProperty('bbUpper');
    expect(result?.indicators).toHaveProperty('bbMiddle');
    expect(result?.indicators).toHaveProperty('bbLower');
    expect(result?.indicators).toHaveProperty('bandwidth');
  });

  it('should have confidence between 0 and 1', () => {
    const candles = generateBandTouchData(100, true);
    const result = BollingerBounce.generateSignal(candles, defaultParams);
    expect(result?.confidence).toBeGreaterThanOrEqual(0);
    expect(result?.confidence).toBeLessThanOrEqual(1);
  });
});

// ============================================================
// BollingerBreakout Tests
// ============================================================

describe('BollingerBreakout Strategy', () => {
  const defaultParams = {
    period: 20,
    stdDev: 2,
    confirmBars: 2,
  };

  it('should have correct strategy metadata', () => {
    expect(BollingerBreakout.id).toBe('bollinger-breakout');
    expect(BollingerBreakout.name).toBe('Bollinger Band Breakout');
    expect(BollingerBreakout.params).toHaveProperty('confirmBars');
  });

  it('should return null with insufficient data', () => {
    const candles = generateRangingData(10);
    const result = BollingerBreakout.generateSignal(candles, defaultParams);
    expect(result).toBeNull();
  });

  it('should return signal with valid data', () => {
    const candles = generateRangingData(50);
    const result = BollingerBreakout.generateSignal(candles, defaultParams);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('direction');
    expect(result).toHaveProperty('indicators');
  });
});

// ============================================================
// BollingerSqueeze Tests
// ============================================================

describe('BollingerSqueeze Strategy', () => {
  const defaultParams = {
    period: 20,
    stdDev: 2,
    squeezeLookback: 20,
    squeezeThreshold: 0.5,
  };

  it('should have correct strategy metadata', () => {
    expect(BollingerSqueeze.id).toBe('bollinger-squeeze');
    expect(BollingerSqueeze.name).toBe('Bollinger Band Squeeze');
    expect(BollingerSqueeze.params).toHaveProperty('squeezeLookback');
    expect(BollingerSqueeze.params).toHaveProperty('squeezeThreshold');
  });

  it('should return null with insufficient data', () => {
    const candles = generateRangingData(10);
    const result = BollingerSqueeze.generateSignal(candles, defaultParams);
    expect(result).toBeNull();
  });

  it('should return signal with squeeze data', () => {
    const candles = generateSqueezeData(80);
    const result = BollingerSqueeze.generateSignal(candles, defaultParams);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('direction');
    expect(result).toHaveProperty('indicators');
  });

  it('should include bandwidth metrics in indicators', () => {
    const candles = generateSqueezeData(80);
    const result = BollingerSqueeze.generateSignal(candles, defaultParams);
    expect(result?.indicators).toHaveProperty('bandwidth');
    expect(result?.indicators).toHaveProperty('avgBandwidth');
  });
});

// ============================================================
// BollingerRSI Tests
// ============================================================

describe('BollingerRSI Strategy', () => {
  const defaultParams = {
    bbPeriod: 20,
    bbStdDev: 2,
    rsiPeriod: 14,
    rsiOversold: 30,
    rsiOverbought: 70,
  };

  it('should have correct strategy metadata', () => {
    expect(BollingerRSI.id).toBe('bollinger-rsi');
    expect(BollingerRSI.name).toBe('Bollinger + RSI');
    expect(BollingerRSI.params).toHaveProperty('bbPeriod');
    expect(BollingerRSI.params).toHaveProperty('rsiPeriod');
    expect(BollingerRSI.params).toHaveProperty('rsiOversold');
    expect(BollingerRSI.params).toHaveProperty('rsiOverbought');
  });

  it('should return null with insufficient data', () => {
    const candles = generateRangingData(10);
    const result = BollingerRSI.generateSignal(candles, defaultParams);
    expect(result).toBeNull();
  });

  it('should return signal with valid data', () => {
    const candles = generateBandTouchData(50, true);
    const result = BollingerRSI.generateSignal(candles, defaultParams);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('direction');
    expect(result).toHaveProperty('indicators');
  });

  it('should include both BB and RSI in indicators', () => {
    const candles = generateRangingData(50);
    const result = BollingerRSI.generateSignal(candles, defaultParams);
    expect(result?.indicators).toHaveProperty('bbUpper');
    expect(result?.indicators).toHaveProperty('bbLower');
    expect(result?.indicators).toHaveProperty('rsi');
    expect(result?.indicators).toHaveProperty('bandPosition');
  });
});

// ============================================================
// BollingerStrategies Array Tests
// ============================================================

describe('BollingerStrategies Collection', () => {
  it('should export 4 strategies', () => {
    expect(BollingerStrategies).toHaveLength(4);
  });

  it('should include all Bollinger strategies', () => {
    const ids = BollingerStrategies.map((s) => s.id);
    expect(ids).toContain('bollinger-bounce');
    expect(ids).toContain('bollinger-breakout');
    expect(ids).toContain('bollinger-squeeze');
    expect(ids).toContain('bollinger-rsi');
  });

  it('all strategies should implement the Strategy interface', () => {
    BollingerStrategies.forEach((strategy) => {
      expect(strategy).toHaveProperty('id');
      expect(strategy).toHaveProperty('name');
      expect(strategy).toHaveProperty('description');
      expect(strategy).toHaveProperty('params');
      expect(strategy).toHaveProperty('generateSignal');
      expect(typeof strategy.generateSignal).toBe('function');
    });
  });
});
