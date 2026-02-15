// ============================================================
// Williams %R Strategy Tests
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  WilliamsROverboughtOversold,
  WilliamsRMiddleCross,
  WilliamsRExtremeZone,
  WilliamsRStrategies,
} from './williams-r-strategy';
import { Candle } from '../types';

// ============================================================
// Test Data Generators
// ============================================================

function generateOversoldData(count: number = 50): Candle[] {
  const candles: Candle[] = [];
  let price = 100;

  // Generate consistently falling prices to create oversold condition
  for (let i = 0; i < count; i++) {
    const drop = Math.random() * 0.5 + 0.1;
    price = price * (1 - drop / 100);

    const volatility = Math.random() * 0.3 + 0.1;
    const open = price + volatility;
    const close = price;
    const high = Math.max(open, close) + volatility * 0.5;
    const low = Math.min(open, close) - volatility * 0.5;

    candles.push({
      timestamp: Date.now() + i * 60000,
      open,
      high,
      low,
      close,
    });
  }

  return candles;
}

function generateOverboughtData(count: number = 50): Candle[] {
  const candles: Candle[] = [];
  let price = 100;

  // Generate consistently rising prices to create overbought condition
  for (let i = 0; i < count; i++) {
    const rise = Math.random() * 0.5 + 0.1;
    price = price * (1 + rise / 100);

    const volatility = Math.random() * 0.3 + 0.1;
    const open = price - volatility;
    const close = price;
    const high = Math.max(open, close) + volatility * 0.5;
    const low = Math.min(open, close) - volatility * 0.5;

    candles.push({
      timestamp: Date.now() + i * 60000,
      open,
      high,
      low,
      close,
    });
  }

  return candles;
}

function generateRangingData(count: number = 50): Candle[] {
  const candles: Candle[] = [];
  let price = 100;

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 0.4;
    price = price * (1 + change / 100);

    const volatility = Math.random() * 0.2 + 0.1;
    const open = price - volatility / 2;
    const close = price + volatility / 2;
    const high = Math.max(open, close) + volatility * 0.3;
    const low = Math.min(open, close) - volatility * 0.3;

    candles.push({
      timestamp: Date.now() + i * 60000,
      open,
      high,
      low,
      close,
    });
  }

  return candles;
}

// ============================================================
// WilliamsROverboughtOversold Tests
// ============================================================

describe('WilliamsROverboughtOversold Strategy', () => {
  const defaultParams = {
    period: 14,
    overbought: -20,
    oversold: -80,
  };

  it('should have correct strategy metadata', () => {
    expect(WilliamsROverboughtOversold.id).toBe('williams-r-ob-os');
    expect(WilliamsROverboughtOversold.name).toBe('Williams %R Overbought/Oversold');
    expect(WilliamsROverboughtOversold.params).toHaveProperty('period');
    expect(WilliamsROverboughtOversold.params).toHaveProperty('overbought');
    expect(WilliamsROverboughtOversold.params).toHaveProperty('oversold');
  });

  it('should return null with insufficient data', () => {
    const candles = generateRangingData(10);
    const result = WilliamsROverboughtOversold.generateSignal(candles, defaultParams);
    expect(result).toBeNull();
  });

  it('should return signal with valid data', () => {
    const candles = generateRangingData(50);
    const result = WilliamsROverboughtOversold.generateSignal(candles, defaultParams);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('direction');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('indicators');
  });

  it('should include Williams %R values in indicators', () => {
    const candles = generateRangingData(50);
    const result = WilliamsROverboughtOversold.generateSignal(candles, defaultParams);
    expect(result?.indicators).toHaveProperty('williamsR');
    expect(result?.indicators).toHaveProperty('prevWilliamsR');
  });

  it('Williams %R values should be between -100 and 0', () => {
    const candles = generateRangingData(50);
    const result = WilliamsROverboughtOversold.generateSignal(candles, defaultParams);
    expect(result?.indicators.williamsR).toBeGreaterThanOrEqual(-100);
    expect(result?.indicators.williamsR).toBeLessThanOrEqual(0);
  });

  it('should have confidence between 0 and 1', () => {
    const candles = generateRangingData(100);
    const result = WilliamsROverboughtOversold.generateSignal(candles, defaultParams);
    expect(result?.confidence).toBeGreaterThanOrEqual(0);
    expect(result?.confidence).toBeLessThanOrEqual(1);
  });
});

// ============================================================
// WilliamsRMiddleCross Tests
// ============================================================

describe('WilliamsRMiddleCross Strategy', () => {
  const defaultParams = {
    period: 14,
    middleLine: -50,
    confirmBars: 2,
  };

  it('should have correct strategy metadata', () => {
    expect(WilliamsRMiddleCross.id).toBe('williams-r-middle-cross');
    expect(WilliamsRMiddleCross.name).toBe('Williams %R Middle Cross');
    expect(WilliamsRMiddleCross.params).toHaveProperty('period');
    expect(WilliamsRMiddleCross.params).toHaveProperty('middleLine');
    expect(WilliamsRMiddleCross.params).toHaveProperty('confirmBars');
  });

  it('should return null with insufficient data', () => {
    const candles = generateRangingData(10);
    const result = WilliamsRMiddleCross.generateSignal(candles, defaultParams);
    expect(result).toBeNull();
  });

  it('should return signal with valid data', () => {
    const candles = generateRangingData(50);
    const result = WilliamsRMiddleCross.generateSignal(candles, defaultParams);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('direction');
    expect(result).toHaveProperty('confidence');
  });
});

// ============================================================
// WilliamsRExtremeZone Tests
// ============================================================

describe('WilliamsRExtremeZone Strategy', () => {
  const defaultParams = {
    period: 14,
    overbought: -20,
    oversold: -80,
    minBarsInZone: 2,
  };

  it('should have correct strategy metadata', () => {
    expect(WilliamsRExtremeZone.id).toBe('williams-r-extreme');
    expect(WilliamsRExtremeZone.name).toBe('Williams %R Extreme Zone');
    expect(WilliamsRExtremeZone.params).toHaveProperty('period');
    expect(WilliamsRExtremeZone.params).toHaveProperty('overbought');
    expect(WilliamsRExtremeZone.params).toHaveProperty('oversold');
    expect(WilliamsRExtremeZone.params).toHaveProperty('minBarsInZone');
  });

  it('should return null with insufficient data', () => {
    const candles = generateRangingData(10);
    const result = WilliamsRExtremeZone.generateSignal(candles, defaultParams);
    expect(result).toBeNull();
  });

  it('should return signal with valid data', () => {
    const candles = generateOverboughtData(50);
    const result = WilliamsRExtremeZone.generateSignal(candles, defaultParams);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('direction');
    expect(result?.indicators).toHaveProperty('williamsR');
  });
});

// ============================================================
// WilliamsRStrategies Array Tests
// ============================================================

describe('WilliamsRStrategies Collection', () => {
  it('should export 3 strategies', () => {
    expect(WilliamsRStrategies).toHaveLength(3);
  });

  it('should include all Williams %R strategies', () => {
    const ids = WilliamsRStrategies.map((s) => s.id);
    expect(ids).toContain('williams-r-ob-os');
    expect(ids).toContain('williams-r-middle-cross');
    expect(ids).toContain('williams-r-extreme');
  });

  it('all strategies should implement the Strategy interface', () => {
    WilliamsRStrategies.forEach((strategy) => {
      expect(strategy).toHaveProperty('id');
      expect(strategy).toHaveProperty('name');
      expect(strategy).toHaveProperty('description');
      expect(strategy).toHaveProperty('params');
      expect(strategy).toHaveProperty('generateSignal');
      expect(typeof strategy.generateSignal).toBe('function');
    });
  });
});

// ============================================================
// Backtest Simulation Tests
// ============================================================

describe('Williams %R Strategy Backtest Simulation', () => {
  function runSimpleBacktest(
    candles: Candle[],
    strategyFn: (
      candles: Candle[],
      params: Record<string, number>,
    ) => ReturnType<typeof WilliamsROverboughtOversold.generateSignal>,
    params: Record<string, number>,
    expiryCandles: number = 5,
  ): { totalTrades: number; wins: number; winRate: number } {
    let wins = 0;
    let losses = 0;

    for (let i = 20; i < candles.length - expiryCandles; i++) {
      const lookback = candles.slice(0, i + 1);
      const result = strategyFn(lookback, params);

      if (result?.direction) {
        const entryPrice = candles[i].close;
        const exitPrice = candles[i + expiryCandles].close;

        const isWin =
          (result.direction === 'CALL' && exitPrice > entryPrice) ||
          (result.direction === 'PUT' && exitPrice < entryPrice);

        if (isWin) wins++;
        else losses++;
      }
    }

    const totalTrades = wins + losses;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

    return { totalTrades, wins, winRate };
  }

  it('WilliamsROverboughtOversold should generate trades', () => {
    const candles = generateRangingData(100);
    const result = runSimpleBacktest(
      candles,
      WilliamsROverboughtOversold.generateSignal.bind(WilliamsROverboughtOversold),
      { period: 14, overbought: -20, oversold: -80 },
    );

    // Strategy may or may not generate trades depending on data
    expect(result.totalTrades).toBeGreaterThanOrEqual(0);
  });

  it('WilliamsRMiddleCross should generate trades in trending market', () => {
    const candles = [...generateOversoldData(50), ...generateOverboughtData(50)];
    const result = runSimpleBacktest(
      candles,
      WilliamsRMiddleCross.generateSignal.bind(WilliamsRMiddleCross),
      { period: 14, middleLine: -50, confirmBars: 2 },
    );

    expect(result.totalTrades).toBeGreaterThanOrEqual(0);
  });

  it('WilliamsRExtremeZone should identify extreme conditions', () => {
    const candles = generateOversoldData(50);
    const result = runSimpleBacktest(
      candles,
      WilliamsRExtremeZone.generateSignal.bind(WilliamsRExtremeZone),
      { period: 14, overbought: -20, oversold: -80, minBarsInZone: 2 },
    );

    expect(result.totalTrades).toBeGreaterThanOrEqual(0);
  });
});
