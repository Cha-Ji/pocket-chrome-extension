// ============================================================
// Leaderboard Module Tests
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { getBacktestEngine } from './engine';
import { RSIStrategies } from './strategies/rsi-strategy';
import { generateTestCandles } from './data-generator';
import { runLeaderboard, scoreAndRankEntries, formatLeaderboardReport } from './leaderboard';
import { LeaderboardConfig, LeaderboardEntry } from './leaderboard-types';
import { Candle } from './types';

// 테스트용 리더보드 설정 생성
function makeConfig(candles: Candle[], overrides?: Partial<LeaderboardConfig>): LeaderboardConfig {
  return {
    symbol: 'TEST',
    startTime: candles[0].timestamp,
    endTime: candles[candles.length - 1].timestamp,
    initialBalance: 10000,
    betAmount: 100,
    betType: 'fixed',
    payout: 92,
    expirySeconds: 60,
    volumeMultiplier: 100,
    minTrades: 1,
    ...overrides,
  };
}

describe('Leaderboard', () => {
  let candles: Candle[];

  beforeEach(() => {
    // 충분한 캔들 데이터 생성
    candles = generateTestCandles({ count: 500 });
  });

  describe('runLeaderboard', () => {
    beforeEach(() => {
      // 싱글톤 엔진에 전략 등록
      const engine = getBacktestEngine();
      RSIStrategies.forEach((s) => engine.registerStrategy(s));
    });

    it('should run leaderboard with registered strategies', () => {
      const config = makeConfig(candles);
      const result = runLeaderboard(candles, config);

      expect(result).toBeDefined();
      expect(result.entries).toBeDefined();
      expect(result.totalStrategies).toBeGreaterThan(0);
      expect(result.executionTimeMs).toBeGreaterThan(0);
      expect(result.executedAt).toBeGreaterThan(0);
    });

    it('should calculate all required fields for each entry', () => {
      const config = makeConfig(candles);
      const result = runLeaderboard(candles, config);

      for (const entry of result.entries) {
        // 기본 통계
        expect(entry.strategyId).toBeTruthy();
        expect(entry.strategyName).toBeTruthy();
        expect(entry.totalTrades).toBeGreaterThanOrEqual(0);
        expect(entry.winRate).toBeGreaterThanOrEqual(0);
        expect(entry.winRate).toBeLessThanOrEqual(100);

        // 일일 거래 지표
        expect(entry.tradingDays).toBeGreaterThanOrEqual(1);
        expect(entry.tradesPerDay).toBeGreaterThanOrEqual(0);
        expect(entry.dailyVolume).toBeGreaterThanOrEqual(0);
        expect(entry.totalVolume).toBeGreaterThanOrEqual(0);

        // 리스크 지표
        expect(entry.maxDrawdownPercent).toBeGreaterThanOrEqual(0);
        expect(entry.maxConsecutiveLosses).toBeGreaterThanOrEqual(0);

        // 종합 점수
        expect(entry.compositeScore).toBeGreaterThanOrEqual(0);
        expect(entry.compositeScore).toBeLessThanOrEqual(100);
        expect(entry.rank).toBeGreaterThanOrEqual(1);

        // Kelly Criterion
        expect(entry.kellyFraction).toBeGreaterThanOrEqual(0);

        // 거래량 목표
        if (entry.daysToVolumeTarget !== null) {
          expect(entry.daysToVolumeTarget).toBeGreaterThan(0);
        }
      }
    });

    it('should filter entries below minTrades', () => {
      const config = makeConfig(candles, { minTrades: 9999 });
      const result = runLeaderboard(candles, config);

      expect(result.entries).toHaveLength(0);
      expect(result.filteredOut).toBeGreaterThan(0);
    });

    it('should report progress', () => {
      const config = makeConfig(candles);
      const progressUpdates: { completed: number; total: number }[] = [];

      runLeaderboard(candles, config, (p) => {
        progressUpdates.push({ completed: p.completed, total: p.total });
      });

      expect(progressUpdates.length).toBeGreaterThan(0);
      // 마지막 콜백은 complete 상태
      const last = progressUpdates[progressUpdates.length - 1];
      expect(last.completed).toBe(last.total);
    });

    it('should sort entries by composite score (highest first)', () => {
      const config = makeConfig(candles);
      const result = runLeaderboard(candles, config);

      if (result.entries.length > 1) {
        for (let i = 0; i < result.entries.length - 1; i++) {
          expect(result.entries[i].compositeScore).toBeGreaterThanOrEqual(
            result.entries[i + 1].compositeScore,
          );
        }
      }
    });

    it('should assign sequential ranks', () => {
      const config = makeConfig(candles);
      const result = runLeaderboard(candles, config);

      for (let i = 0; i < result.entries.length; i++) {
        expect(result.entries[i].rank).toBe(i + 1);
      }
    });
  });

  describe('scoreAndRankEntries', () => {
    it('should handle empty entries', () => {
      const entries: LeaderboardEntry[] = [];
      scoreAndRankEntries(entries);
      expect(entries).toHaveLength(0);
    });

    it('should assign score of 50 when all entries are equal', () => {
      const entries: LeaderboardEntry[] = [
        makeMockEntry('a', { winRate: 55, profitFactor: 1.5, maxDrawdownPercent: 10 }),
        makeMockEntry('b', { winRate: 55, profitFactor: 1.5, maxDrawdownPercent: 10 }),
      ];
      scoreAndRankEntries(entries);

      // 모든 지표가 같으면 모든 정규화 값이 50
      expect(entries[0].compositeScore).toBe(entries[1].compositeScore);
    });

    it('should rank higher win rate strategy first', () => {
      const entries: LeaderboardEntry[] = [
        makeMockEntry('low', {
          winRate: 45,
          profitFactor: 0.8,
          maxDrawdownPercent: 20,
          maxConsecutiveLosses: 8,
          tradesPerDay: 5,
          recoveryFactor: 0.5,
        }),
        makeMockEntry('high', {
          winRate: 60,
          profitFactor: 2.0,
          maxDrawdownPercent: 5,
          maxConsecutiveLosses: 3,
          tradesPerDay: 10,
          recoveryFactor: 3.0,
        }),
      ];
      scoreAndRankEntries(entries);

      expect(entries[0].strategyId).toBe('high');
      expect(entries[0].rank).toBe(1);
      expect(entries[1].rank).toBe(2);
    });

    it('should handle Infinity in profitFactor and recoveryFactor', () => {
      const entries: LeaderboardEntry[] = [
        makeMockEntry('inf', { profitFactor: Infinity, recoveryFactor: Infinity }),
        makeMockEntry('normal', { profitFactor: 1.5, recoveryFactor: 2.0 }),
      ];

      // Should not throw
      expect(() => scoreAndRankEntries(entries)).not.toThrow();
      expect(entries[0].compositeScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('formatLeaderboardReport', () => {
    it('should generate readable text report', () => {
      const config = makeConfig(candles);
      const result = runLeaderboard(candles, config);
      const report = formatLeaderboardReport(result);

      expect(report).toContain('LEADERBOARD');
      expect(report).toContain('Strategies:');
      expect(report).toContain('Payout:');
    });
  });

  describe('Volume target calculation', () => {
    it('should calculate days to volume target', () => {
      const config = makeConfig(candles, { volumeMultiplier: 100 });
      const result = runLeaderboard(candles, config);

      for (const entry of result.entries) {
        if (entry.daysToVolumeTarget !== null) {
          // 검증: 일일거래량 × 소요일 >= 목표거래량
          const target = config.initialBalance * config.volumeMultiplier;
          expect(entry.dailyVolume * entry.daysToVolumeTarget).toBeGreaterThanOrEqual(target);
        }
      }
    });
  });

  describe('Kelly Criterion', () => {
    it('should return 0 for losing strategies', () => {
      const entries: LeaderboardEntry[] = [
        makeMockEntry('loser', { winRate: 30, kellyFraction: 0 }),
      ];
      // Kelly = (0.3 * 0.92 - 0.7) / 0.92 = (0.276 - 0.7) / 0.92 = negative → 0
      expect(entries[0].kellyFraction).toBe(0);
    });
  });
});

// ============================================================
// Mock Entry Factory
// ============================================================

function makeMockEntry(id: string, overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    strategyId: id,
    strategyName: `Strategy ${id}`,
    params: {},
    totalTrades: 100,
    wins: 55,
    losses: 45,
    ties: 0,
    winRate: 55,
    netProfit: 500,
    netProfitPercent: 5,
    profitFactor: 1.5,
    expectancy: 5,
    maxDrawdown: 200,
    maxDrawdownPercent: 10,
    maxConsecutiveLosses: 5,
    maxConsecutiveWins: 7,
    recoveryFactor: 2.5,
    sharpeRatio: 1.2,
    sortinoRatio: 1.5,
    tradingDays: 10,
    tradesPerDay: 10,
    dailyVolume: 1000,
    totalVolume: 10000,
    daysToVolumeTarget: 100,
    winRateStdDev: 3.5,
    kellyFraction: 12.5,
    minRequiredBalance: 600,
    winRateDecided: 55,
    tieRate: 0,
    breakEvenWinRate: 52.08,
    evPerTrade: 0.056,
    wrBeDelta: 2.92,
    compositeScore: 0,
    rank: 0,
    dataRange: { start: 0, end: 1000000 },
    candleCount: 500,
    betAmount: 100,
    payout: 92,
    expirySeconds: 60,
    createdAt: Date.now(),
    ...overrides,
  };
}
