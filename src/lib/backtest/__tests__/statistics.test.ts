// ============================================================
// Statistics Calculation Tests
// ============================================================

import { describe, it, expect } from 'vitest';
import { calculateStats, Trade } from './test-helpers';
import { BacktestTrade } from '../types';
import {
  calculateSortinoRatio,
  calculateCalmarRatio,
  calculateUlcerIndex,
  analyzeByMonth,
  analyzeByDayOfWeek,
  analyzeByHour,
  analyzeStreaks,
  calculateTradeDistribution,
} from '../statistics';

// Helper to create BacktestTrade from simple data
function createBacktestTrade(
  entryTime: number,
  exitTime: number,
  direction: 'CALL' | 'PUT',
  result: 'WIN' | 'LOSS' | 'TIE',
  profit: number,
): BacktestTrade {
  return {
    entryTime,
    exitTime,
    entryPrice: 100,
    exitPrice: result === 'WIN' ? (direction === 'CALL' ? 101 : 99) : 100,
    direction,
    result,
    payout: 92,
    profit,
  };
}

describe('Statistics Calculation', () => {
  it('should calculate win rate correctly', () => {
    const trades: Trade[] = [
      {
        entryIdx: 0,
        exitIdx: 1,
        entryPrice: 100,
        exitPrice: 101,
        direction: 'CALL',
        result: 'WIN',
        profit: 92,
      },
      {
        entryIdx: 2,
        exitIdx: 3,
        entryPrice: 100,
        exitPrice: 99,
        direction: 'CALL',
        result: 'LOSS',
        profit: -100,
      },
      {
        entryIdx: 4,
        exitIdx: 5,
        entryPrice: 100,
        exitPrice: 101,
        direction: 'CALL',
        result: 'WIN',
        profit: 92,
      },
    ];

    const stats = calculateStats(trades);

    expect(stats.totalTrades).toBe(3);
    expect(stats.wins).toBe(2);
    expect(stats.losses).toBe(1);
    expect(stats.winRate).toBeCloseTo(66.67, 1);
  });

  it('should calculate profit factor correctly', () => {
    const trades: Trade[] = [
      {
        entryIdx: 0,
        exitIdx: 1,
        entryPrice: 100,
        exitPrice: 101,
        direction: 'CALL',
        result: 'WIN',
        profit: 92,
      },
      {
        entryIdx: 2,
        exitIdx: 3,
        entryPrice: 100,
        exitPrice: 99,
        direction: 'CALL',
        result: 'LOSS',
        profit: -100,
      },
    ];

    const stats = calculateStats(trades);

    // Profit factor = gross profit / gross loss = 92 / 100 = 0.92
    expect(stats.profitFactor).toBeCloseTo(0.92, 2);
  });

  it('should handle empty trades', () => {
    const stats = calculateStats([]);

    expect(stats.totalTrades).toBe(0);
    expect(stats.winRate).toBe(0);
    expect(stats.netProfit).toBe(0);
  });

  it('should calculate CALL/PUT stats separately', () => {
    const trades: Trade[] = [
      {
        entryIdx: 0,
        exitIdx: 1,
        entryPrice: 100,
        exitPrice: 101,
        direction: 'CALL',
        result: 'WIN',
        profit: 92,
      },
      {
        entryIdx: 2,
        exitIdx: 3,
        entryPrice: 100,
        exitPrice: 99,
        direction: 'PUT',
        result: 'WIN',
        profit: 92,
      },
      {
        entryIdx: 4,
        exitIdx: 5,
        entryPrice: 100,
        exitPrice: 101,
        direction: 'CALL',
        result: 'WIN',
        profit: 92,
      },
      {
        entryIdx: 6,
        exitIdx: 7,
        entryPrice: 100,
        exitPrice: 101,
        direction: 'PUT',
        result: 'LOSS',
        profit: -100,
      },
    ];

    const stats = calculateStats(trades);

    expect(stats.callTrades).toBe(2);
    expect(stats.putTrades).toBe(2);
    expect(stats.callWinRate).toBe(100); // 2/2
    expect(stats.putWinRate).toBe(50); // 1/2
  });

  it('should handle all wins (infinite profit factor)', () => {
    const trades: Trade[] = [
      {
        entryIdx: 0,
        exitIdx: 1,
        entryPrice: 100,
        exitPrice: 101,
        direction: 'CALL',
        result: 'WIN',
        profit: 92,
      },
      {
        entryIdx: 2,
        exitIdx: 3,
        entryPrice: 100,
        exitPrice: 99,
        direction: 'PUT',
        result: 'WIN',
        profit: 92,
      },
    ];

    const stats = calculateStats(trades);

    expect(stats.profitFactor).toBe(Infinity);
    expect(stats.winRate).toBe(100);
  });
});

// ============================================================
// Advanced Risk Metrics Tests
// ============================================================

describe('Sortino Ratio', () => {
  it('should return 0 for insufficient trades', () => {
    const trades: BacktestTrade[] = [createBacktestTrade(1000, 2000, 'CALL', 'WIN', 92)];
    expect(calculateSortinoRatio(trades)).toBe(0);
  });

  it('should return Infinity for all wins (no downside risk)', () => {
    const trades: BacktestTrade[] = [
      createBacktestTrade(1000, 2000, 'CALL', 'WIN', 92),
      createBacktestTrade(3000, 4000, 'CALL', 'WIN', 92),
      createBacktestTrade(5000, 6000, 'CALL', 'WIN', 92),
    ];
    expect(calculateSortinoRatio(trades)).toBe(Infinity);
  });

  it('should calculate positive Sortino for mixed trades with positive expectancy', () => {
    const trades: BacktestTrade[] = [
      createBacktestTrade(1000, 2000, 'CALL', 'WIN', 92),
      createBacktestTrade(3000, 4000, 'CALL', 'WIN', 92),
      createBacktestTrade(5000, 6000, 'CALL', 'LOSS', -100),
      createBacktestTrade(7000, 8000, 'CALL', 'WIN', 92),
      createBacktestTrade(9000, 10000, 'CALL', 'LOSS', -100),
    ];
    const ratio = calculateSortinoRatio(trades, 0.02, 10000);
    expect(ratio).toBeGreaterThan(0);
  });

  it('should calculate negative Sortino for losing strategy', () => {
    // Use varying losses to have non-zero downside deviation
    const trades: BacktestTrade[] = [
      createBacktestTrade(1000, 2000, 'CALL', 'WIN', 92),
      createBacktestTrade(3000, 4000, 'CALL', 'LOSS', -80),
      createBacktestTrade(5000, 6000, 'CALL', 'LOSS', -100),
      createBacktestTrade(7000, 8000, 'CALL', 'LOSS', -120),
      createBacktestTrade(9000, 10000, 'CALL', 'LOSS', -90),
    ];
    const ratio = calculateSortinoRatio(trades, 0.02, 10000);
    expect(ratio).toBeLessThan(0);
  });
});

describe('Calmar Ratio', () => {
  it('should return Infinity when no drawdown', () => {
    const trades: BacktestTrade[] = [];
    expect(calculateCalmarRatio(trades, 20, 0)).toBe(Infinity);
  });

  it('should return 0 when no return and no drawdown', () => {
    const trades: BacktestTrade[] = [];
    expect(calculateCalmarRatio(trades, 0, 0)).toBe(0);
  });

  it('should calculate correct ratio', () => {
    const trades: BacktestTrade[] = [];
    // 20% annualized return / 10% max drawdown = 2.0
    expect(calculateCalmarRatio(trades, 20, 10)).toBe(2);
  });

  it('should handle negative return with positive drawdown', () => {
    const trades: BacktestTrade[] = [];
    expect(calculateCalmarRatio(trades, -10, 15)).toBeCloseTo(-0.667, 2);
  });
});

describe('Ulcer Index', () => {
  it('should return 0 for insufficient data', () => {
    expect(calculateUlcerIndex([{ timestamp: 1000, balance: 10000 }])).toBe(0);
  });

  it('should return 0 for continuously increasing equity', () => {
    const equityCurve = [
      { timestamp: 1000, balance: 10000 },
      { timestamp: 2000, balance: 10100 },
      { timestamp: 3000, balance: 10200 },
      { timestamp: 4000, balance: 10300 },
    ];
    expect(calculateUlcerIndex(equityCurve)).toBe(0);
  });

  it('should calculate positive Ulcer Index for drawdowns', () => {
    const equityCurve = [
      { timestamp: 1000, balance: 10000 },
      { timestamp: 2000, balance: 10200 }, // new peak
      { timestamp: 3000, balance: 9800 }, // drawdown
      { timestamp: 4000, balance: 10000 }, // recovery
      { timestamp: 5000, balance: 10300 }, // new peak
    ];
    const ulcerIndex = calculateUlcerIndex(equityCurve);
    expect(ulcerIndex).toBeGreaterThan(0);
  });

  it('should have higher Ulcer Index for deeper/longer drawdowns', () => {
    const mildDrawdown = [
      { timestamp: 1000, balance: 10000 },
      { timestamp: 2000, balance: 9900 },
      { timestamp: 3000, balance: 10000 },
    ];
    const severeDrawdown = [
      { timestamp: 1000, balance: 10000 },
      { timestamp: 2000, balance: 8000 },
      { timestamp: 3000, balance: 10000 },
    ];
    expect(calculateUlcerIndex(severeDrawdown)).toBeGreaterThan(calculateUlcerIndex(mildDrawdown));
  });
});

// ============================================================
// Time-Based Analysis Tests
// ============================================================

describe('analyzeByMonth', () => {
  it('should return empty array for no trades', () => {
    expect(analyzeByMonth([])).toEqual([]);
  });

  it('should group trades by month correctly', () => {
    const trades: BacktestTrade[] = [
      createBacktestTrade(
        new Date('2024-01-15').getTime(),
        new Date('2024-01-15').getTime() + 60000,
        'CALL',
        'WIN',
        92,
      ),
      createBacktestTrade(
        new Date('2024-01-20').getTime(),
        new Date('2024-01-20').getTime() + 60000,
        'CALL',
        'LOSS',
        -100,
      ),
      createBacktestTrade(
        new Date('2024-02-10').getTime(),
        new Date('2024-02-10').getTime() + 60000,
        'CALL',
        'WIN',
        92,
      ),
    ];

    const result = analyzeByMonth(trades);

    expect(result).toHaveLength(2);
    expect(result[0].year).toBe(2024);
    expect(result[0].month).toBe(1);
    expect(result[0].trades).toBe(2);
    expect(result[0].wins).toBe(1);
    expect(result[0].losses).toBe(1);
    expect(result[0].winRate).toBe(50);

    expect(result[1].month).toBe(2);
    expect(result[1].trades).toBe(1);
    expect(result[1].winRate).toBe(100);
  });

  it('should calculate average profit correctly', () => {
    const trades: BacktestTrade[] = [
      createBacktestTrade(
        new Date('2024-03-01').getTime(),
        new Date('2024-03-01').getTime() + 60000,
        'CALL',
        'WIN',
        100,
      ),
      createBacktestTrade(
        new Date('2024-03-15').getTime(),
        new Date('2024-03-15').getTime() + 60000,
        'CALL',
        'LOSS',
        -50,
      ),
    ];

    const result = analyzeByMonth(trades);
    expect(result[0].avgProfit).toBe(25); // (100 - 50) / 2
  });
});

describe('analyzeByDayOfWeek', () => {
  it('should return stats for all 7 days', () => {
    const result = analyzeByDayOfWeek([]);
    expect(result).toHaveLength(7);
    expect(result[0].dayName).toBe('Sunday');
    expect(result[6].dayName).toBe('Saturday');
  });

  it('should calculate day-specific statistics', () => {
    // Monday = 1, 2024-01-15 is a Monday
    const monday = new Date('2024-01-15T10:00:00').getTime();
    const trades: BacktestTrade[] = [
      createBacktestTrade(monday, monday + 60000, 'CALL', 'WIN', 92),
      createBacktestTrade(monday + 86400000, monday + 86400000 + 60000, 'CALL', 'LOSS', -100), // Tuesday
    ];

    const result = analyzeByDayOfWeek(trades);

    const mondayStats = result[1]; // Monday is index 1
    expect(mondayStats.trades).toBe(1);
    expect(mondayStats.wins).toBe(1);
    expect(mondayStats.winRate).toBe(100);

    const tuesdayStats = result[2];
    expect(tuesdayStats.trades).toBe(1);
    expect(tuesdayStats.losses).toBe(1);
    expect(tuesdayStats.winRate).toBe(0);
  });
});

describe('analyzeByHour', () => {
  it('should return stats for all 24 hours', () => {
    const result = analyzeByHour([]);
    expect(result).toHaveLength(24);
    expect(result[0].hour).toBe(0);
    expect(result[23].hour).toBe(23);
  });

  it('should group trades by hour correctly', () => {
    // Use UTC timestamps directly to avoid timezone issues
    // Create trades at hour 9 and hour 10 UTC
    const hour9 = Date.UTC(2024, 0, 15, 9, 30, 0); // Jan 15, 2024, 9:30 AM UTC
    const hour10 = Date.UTC(2024, 0, 15, 10, 30, 0); // Jan 15, 2024, 10:30 AM UTC
    const trades: BacktestTrade[] = [
      createBacktestTrade(hour9, hour9 + 60000, 'CALL', 'WIN', 92),
      createBacktestTrade(hour9 + 1000, hour9 + 61000, 'CALL', 'WIN', 92), // Still hour 9
      createBacktestTrade(hour10, hour10 + 60000, 'CALL', 'LOSS', -100), // Hour 10
    ];

    const result = analyzeByHour(trades);

    // Find the hours where trades were placed (using UTC hours)
    const trade1Hour = new Date(hour9).getUTCHours();
    const trade3Hour = new Date(hour10).getUTCHours();

    // Since analyzeByHour uses local time via getHours(), we check against local time
    const trade1LocalHour = new Date(hour9).getHours();
    const trade3LocalHour = new Date(hour10).getHours();

    expect(result[trade1LocalHour].trades).toBe(2);
    expect(result[trade1LocalHour].wins).toBe(2);
    expect(result[trade1LocalHour].profit).toBe(184);

    expect(result[trade3LocalHour].trades).toBe(1);
    expect(result[trade3LocalHour].losses).toBe(1);
    expect(result[trade3LocalHour].profit).toBe(-100);
  });
});

// ============================================================
// Trade Pattern Analysis Tests
// ============================================================

describe('analyzeStreaks', () => {
  it('should return zeros for empty trades', () => {
    const result = analyzeStreaks([]);
    expect(result.maxWinStreak).toBe(0);
    expect(result.maxLoseStreak).toBe(0);
    expect(result.avgWinStreak).toBe(0);
    expect(result.avgLoseStreak).toBe(0);
    expect(result.currentStreak.type).toBe('none');
  });

  it('should calculate max win streak correctly', () => {
    const trades: BacktestTrade[] = [
      createBacktestTrade(1000, 2000, 'CALL', 'WIN', 92),
      createBacktestTrade(3000, 4000, 'CALL', 'WIN', 92),
      createBacktestTrade(5000, 6000, 'CALL', 'WIN', 92),
      createBacktestTrade(7000, 8000, 'CALL', 'LOSS', -100),
      createBacktestTrade(9000, 10000, 'CALL', 'WIN', 92),
    ];

    const result = analyzeStreaks(trades);
    expect(result.maxWinStreak).toBe(3);
    expect(result.maxLoseStreak).toBe(1);
  });

  it('should calculate max lose streak correctly', () => {
    const trades: BacktestTrade[] = [
      createBacktestTrade(1000, 2000, 'CALL', 'WIN', 92),
      createBacktestTrade(3000, 4000, 'CALL', 'LOSS', -100),
      createBacktestTrade(5000, 6000, 'CALL', 'LOSS', -100),
      createBacktestTrade(7000, 8000, 'CALL', 'LOSS', -100),
      createBacktestTrade(9000, 10000, 'CALL', 'LOSS', -100),
      createBacktestTrade(11000, 12000, 'CALL', 'WIN', 92),
    ];

    const result = analyzeStreaks(trades);
    expect(result.maxLoseStreak).toBe(4);
    expect(result.maxWinStreak).toBe(1);
  });

  it('should calculate average streaks correctly', () => {
    const trades: BacktestTrade[] = [
      createBacktestTrade(1000, 2000, 'CALL', 'WIN', 92),
      createBacktestTrade(3000, 4000, 'CALL', 'WIN', 92),
      createBacktestTrade(5000, 6000, 'CALL', 'LOSS', -100),
      createBacktestTrade(7000, 8000, 'CALL', 'WIN', 92),
      createBacktestTrade(9000, 10000, 'CALL', 'WIN', 92),
      createBacktestTrade(11000, 12000, 'CALL', 'WIN', 92),
      createBacktestTrade(13000, 14000, 'CALL', 'WIN', 92),
    ];

    const result = analyzeStreaks(trades);
    // Win streaks: 2, 4 => avg = 3
    // Loss streaks: 1 => avg = 1
    expect(result.avgWinStreak).toBe(3);
    expect(result.avgLoseStreak).toBe(1);
  });

  it('should track current streak correctly', () => {
    const winningTrades: BacktestTrade[] = [
      createBacktestTrade(1000, 2000, 'CALL', 'LOSS', -100),
      createBacktestTrade(3000, 4000, 'CALL', 'WIN', 92),
      createBacktestTrade(5000, 6000, 'CALL', 'WIN', 92),
    ];
    expect(analyzeStreaks(winningTrades).currentStreak).toEqual({ type: 'win', count: 2 });

    const losingTrades: BacktestTrade[] = [
      createBacktestTrade(1000, 2000, 'CALL', 'WIN', 92),
      createBacktestTrade(3000, 4000, 'CALL', 'LOSS', -100),
      createBacktestTrade(5000, 6000, 'CALL', 'LOSS', -100),
      createBacktestTrade(7000, 8000, 'CALL', 'LOSS', -100),
    ];
    expect(analyzeStreaks(losingTrades).currentStreak).toEqual({ type: 'loss', count: 3 });
  });

  it('should ignore TIE trades in streak calculation', () => {
    const trades: BacktestTrade[] = [
      createBacktestTrade(1000, 2000, 'CALL', 'WIN', 92),
      createBacktestTrade(3000, 4000, 'CALL', 'TIE', 0),
      createBacktestTrade(5000, 6000, 'CALL', 'WIN', 92),
    ];

    const result = analyzeStreaks(trades);
    expect(result.maxWinStreak).toBe(2); // TIE doesn't break the streak
  });
});

describe('calculateTradeDistribution', () => {
  it('should return empty data for no trades', () => {
    const result = calculateTradeDistribution([]);
    expect(result.profitRanges).toEqual([]);
    expect(result.lossRanges).toEqual([]);
    expect(result.profitPercentile).toEqual({ p10: 0, p25: 0, p50: 0, p75: 0, p90: 0 });
    expect(result.holdingTimeDistribution).toEqual([]);
  });

  it('should calculate profit percentiles correctly', () => {
    const trades: BacktestTrade[] = [
      createBacktestTrade(1000, 2000, 'CALL', 'LOSS', -100),
      createBacktestTrade(3000, 4000, 'CALL', 'LOSS', -50),
      createBacktestTrade(5000, 6000, 'CALL', 'WIN', 50),
      createBacktestTrade(7000, 8000, 'CALL', 'WIN', 92),
      createBacktestTrade(9000, 10000, 'CALL', 'WIN', 100),
    ];

    const result = calculateTradeDistribution(trades);

    expect(result.profitPercentile.p50).toBe(50); // median
    expect(result.profitPercentile.p10).toBe(-100); // lowest
    expect(result.profitPercentile.p90).toBe(100); // highest
  });

  it('should calculate profit ranges', () => {
    const trades: BacktestTrade[] = [
      createBacktestTrade(1000, 2000, 'CALL', 'WIN', 50),
      createBacktestTrade(3000, 4000, 'CALL', 'WIN', 100),
      createBacktestTrade(5000, 6000, 'CALL', 'WIN', 150),
    ];

    const result = calculateTradeDistribution(trades);

    expect(result.profitRanges.length).toBeGreaterThan(0);
    const totalCount = result.profitRanges.reduce((sum, r) => sum + r.count, 0);
    expect(totalCount).toBe(3);
  });

  it('should calculate holding time distribution', () => {
    const trades: BacktestTrade[] = [
      createBacktestTrade(1000, 1000 + 30000, 'CALL', 'WIN', 92), // 30s = < 1 min
      createBacktestTrade(2000, 2000 + 120000, 'CALL', 'WIN', 92), // 2min = 1-5 min
      createBacktestTrade(3000, 3000 + 600000, 'CALL', 'WIN', 92), // 10min = 5-15 min
    ];

    const result = calculateTradeDistribution(trades);

    expect(result.holdingTimeDistribution.length).toBe(6);
    expect(result.holdingTimeDistribution[0].range).toBe('< 1 min');
    expect(result.holdingTimeDistribution[0].count).toBe(1);
    expect(result.holdingTimeDistribution[1].range).toBe('1-5 min');
    expect(result.holdingTimeDistribution[1].count).toBe(1);
    expect(result.holdingTimeDistribution[2].range).toBe('5-15 min');
    expect(result.holdingTimeDistribution[2].count).toBe(1);
  });
});
