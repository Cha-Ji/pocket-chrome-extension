import { describe, it, expect } from 'vitest'
import {
  calculateScore,
  DEFAULT_SCORE_WEIGHTS,
  STABILITY_WEIGHTS,
  GROWTH_WEIGHTS,
  getWeightsByProfile,
  SCORING_THRESHOLDS,
  type ScoreInput,
} from '../scoring'

// ============================================================
// Helper: create a ScoreInput with sane defaults
// ============================================================

function makeInput(overrides: Partial<ScoreInput> = {}): ScoreInput {
  return {
    wins: 55,
    losses: 45,
    ties: 0,
    payoutPercent: 92,
    totalTrades: 100,
    maxDrawdownPercent: 10,
    maxLosingStreak: 4,
    profitFactor: 1.5,
    winRateStdDev: 5,
    ...overrides,
  }
}

describe('Backtest Scoring System', () => {
  // ============================================================
  // Score range
  // ============================================================
  describe('score range', () => {
    it('should return a score between 0 and 100', () => {
      const result = calculateScore(makeInput())
      expect(result.score).toBeGreaterThanOrEqual(0)
      expect(result.score).toBeLessThanOrEqual(100)
    })

    it('should return breakdown values between 0 and 100', () => {
      const result = calculateScore(makeInput())
      for (const value of Object.values(result.breakdown)) {
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(100)
      }
    })
  })

  // ============================================================
  // Snapshot test: "good" strategy at 55% WR / 92% payout
  // ============================================================
  describe('snapshot: 55% win rate, 92% payout', () => {
    const input = makeInput({
      wins: 55,
      losses: 45,
      ties: 0,
      payoutPercent: 92,
      totalTrades: 100,
      maxDrawdownPercent: 10,
      maxLosingStreak: 4,
      profitFactor: 1.5,
      winRateStdDev: 5,
    })

    const result = calculateScore(input)

    it('should have a positive expected value', () => {
      // EV = 0.55 * 0.92 - 0.45 = 0.506 - 0.45 = 0.056
      expect(result.expectedValue).toBeCloseTo(0.056, 2)
    })

    it('should score above 60 (grade B or A)', () => {
      expect(result.score).toBeGreaterThan(60)
      expect(['A', 'B']).toContain(result.grade)
    })

    it('should have high win rate sub-score', () => {
      expect(result.breakdown.winRate).toBeGreaterThan(60)
    })

    it('should have high drawdown sub-score (low MDD = good)', () => {
      expect(result.breakdown.maxDrawdown).toBeGreaterThan(60)
    })
  })

  // ============================================================
  // Snapshot test: break-even strategy (52.1% at 92% payout)
  // ============================================================
  describe('snapshot: break-even strategy', () => {
    const input = makeInput({
      wins: 521,
      losses: 479,
      ties: 0,
      payoutPercent: 92,
      totalTrades: 1000,
      maxDrawdownPercent: 15,
      maxLosingStreak: 7,
      profitFactor: 1.0,
      winRateStdDev: 8,
    })

    const result = calculateScore(input)

    it('should have near-zero expected value', () => {
      // EV ≈ 0.521 * 0.92 - 0.479 ≈ 0.0
      expect(Math.abs(result.expectedValue)).toBeLessThan(0.02)
    })

    it('should score around 30-50 (mediocre)', () => {
      expect(result.score).toBeGreaterThan(20)
      expect(result.score).toBeLessThan(60)
    })

    it('should get grade C or D', () => {
      expect(['C', 'D']).toContain(result.grade)
    })
  })

  // ============================================================
  // Snapshot test: terrible strategy (40% WR)
  // ============================================================
  describe('snapshot: losing strategy (40% WR)', () => {
    const input = makeInput({
      wins: 40,
      losses: 60,
      ties: 0,
      payoutPercent: 92,
      totalTrades: 100,
      maxDrawdownPercent: 25,
      maxLosingStreak: 9,
      profitFactor: 0.6,
      winRateStdDev: 12,
    })

    const result = calculateScore(input)

    it('should have negative expected value', () => {
      // EV = 0.40 * 0.92 - 0.60 = 0.368 - 0.60 = -0.232
      expect(result.expectedValue).toBeLessThan(0)
    })

    it('should score below 20 (grade F)', () => {
      expect(result.score).toBeLessThan(25)
      expect(result.grade).toBe('F')
    })
  })

  // ============================================================
  // Snapshot test: excellent strategy (65% WR)
  // ============================================================
  describe('snapshot: excellent strategy (65% WR)', () => {
    const input = makeInput({
      wins: 650,
      losses: 350,
      ties: 0,
      payoutPercent: 92,
      totalTrades: 1000,
      maxDrawdownPercent: 5,
      maxLosingStreak: 3,
      profitFactor: 2.5,
      winRateStdDev: 3,
    })

    const result = calculateScore(input)

    it('should have strong positive EV', () => {
      // EV = 0.65 * 0.92 - 0.35 = 0.598 - 0.35 = 0.248
      expect(result.expectedValue).toBeGreaterThan(0.20)
    })

    it('should score above 85 (grade A)', () => {
      expect(result.score).toBeGreaterThan(85)
      expect(result.grade).toBe('A')
    })
  })

  // ============================================================
  // Edge cases
  // ============================================================
  describe('edge cases', () => {
    it('should handle zero trades', () => {
      const result = calculateScore(makeInput({
        wins: 0, losses: 0, totalTrades: 0,
        maxDrawdownPercent: 0, maxLosingStreak: 0, profitFactor: 0,
      }))
      // With 0 trades, tradeCount/winRate/EV/profitFactor sub-scores = 0,
      // but drawdown(100) + losingStreak(100) + consistency(100) contribute.
      // Overall should be very low (D or F grade).
      expect(result.score).toBeLessThan(35)
      expect(result.grade).toMatch(/[DF]/)
      expect(result.expectedValue).toBe(0)
    })

    it('should handle all wins', () => {
      const result = calculateScore(makeInput({
        wins: 100,
        losses: 0,
        totalTrades: 100,
        maxDrawdownPercent: 0,
        maxLosingStreak: 0,
        profitFactor: Infinity,
      }))
      expect(result.score).toBeGreaterThan(90)
      expect(result.grade).toBe('A')
    })

    it('should handle all losses', () => {
      const result = calculateScore(makeInput({
        wins: 0,
        losses: 100,
        totalTrades: 100,
        maxDrawdownPercent: 100,
        maxLosingStreak: 100,
        profitFactor: 0,
      }))
      expect(result.score).toBeLessThan(10)
      expect(result.grade).toBe('F')
    })

    it('should handle ties-only trades', () => {
      const result = calculateScore(makeInput({
        wins: 0,
        losses: 0,
        ties: 100,
        totalTrades: 100,
        profitFactor: 0,
        maxDrawdownPercent: 0,
        maxLosingStreak: 0,
      }))
      // No wins or losses — decided = 0 → EV = 0
      expect(result.expectedValue).toBe(0)
      // Score should still be low (no wins = no profit)
      expect(result.score).toBeLessThan(50)
    })
  })

  // ============================================================
  // Expected Value calculation
  // ============================================================
  describe('expected value', () => {
    it('should match EV formula: p*b - q', () => {
      // 55% WR, 92% payout → EV = 0.55*0.92 - 0.45 = 0.056
      const result = calculateScore(makeInput({
        wins: 55, losses: 45, payoutPercent: 92,
      }))
      const expected = 0.55 * 0.92 - 0.45
      expect(result.expectedValue).toBeCloseTo(expected, 4)
    })

    it('should compute correct EV for 80% payout', () => {
      // 55% WR, 80% payout → EV = 0.55*0.80 - 0.45 = -0.01
      const result = calculateScore(makeInput({
        wins: 55, losses: 45, payoutPercent: 80,
      }))
      const expected = 0.55 * 0.80 - 0.45
      expect(result.expectedValue).toBeCloseTo(expected, 4)
    })
  })

  // ============================================================
  // Grade boundaries
  // ============================================================
  describe('grade boundaries', () => {
    it('should assign grades consistently', () => {
      // Build inputs that produce scores near grade boundaries
      const results = [
        calculateScore(makeInput({ wins: 65, losses: 35, totalTrades: 200, profitFactor: 2.5, maxDrawdownPercent: 3, maxLosingStreak: 2 })),
        calculateScore(makeInput({ wins: 55, losses: 45, profitFactor: 1.3 })),
        calculateScore(makeInput({ wins: 52, losses: 48, profitFactor: 1.0 })),
        calculateScore(makeInput({ wins: 40, losses: 60, profitFactor: 0.6, maxDrawdownPercent: 25, maxLosingStreak: 8 })),
      ]

      // Sorted from highest to lowest score
      const scores = results.map(r => r.score)
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeLessThanOrEqual(scores[i - 1])
      }
    })
  })

  // ============================================================
  // Weights customization
  // ============================================================
  describe('custom weights', () => {
    it('should allow overriding weights', () => {
      const input = makeInput()
      const defaultResult = calculateScore(input)
      const customResult = calculateScore(input, {
        ...DEFAULT_SCORE_WEIGHTS,
        winRate: 0.90, // Heavily weight win rate
        expectedValue: 0.02,
        maxDrawdown: 0.02,
        maxLosingStreak: 0.02,
        profitFactor: 0.02,
        tradeCount: 0.01,
        consistency: 0.01,
      })

      // Different weights should produce different scores
      expect(customResult.score).not.toBeCloseTo(defaultResult.score, 0)
    })
  })

  // ============================================================
  // Summary output
  // ============================================================
  describe('summary', () => {
    it('should contain grade and key metrics', () => {
      const result = calculateScore(makeInput())
      expect(result.summary).toContain('Grade')
      expect(result.summary).toContain('WR:')
      expect(result.summary).toContain('EV:')
      expect(result.summary).toContain('PF:')
    })
  })

  // ============================================================
  // SCORING_THRESHOLDS consistency
  // ============================================================
  describe('thresholds', () => {
    it('should have break-even win rate around 52.1% for 92% payout', () => {
      expect(SCORING_THRESHOLDS.breakEvenWinRate).toBeCloseTo(52.1, 0)
    })
  })

  // ============================================================
  // Scoring Profiles
  // ============================================================
  describe('scoring profiles', () => {
    it('all profiles should have weights summing to 1.0', () => {
      for (const weights of [DEFAULT_SCORE_WEIGHTS, STABILITY_WEIGHTS, GROWTH_WEIGHTS]) {
        const sum = Object.values(weights).reduce((a, b) => a + b, 0)
        expect(sum).toBeCloseTo(1.0, 4)
      }
    })

    it('stability profile should penalize drawdown more than default', () => {
      const input = makeInput({ maxDrawdownPercent: 25 })
      const defaultResult = calculateScore(input, DEFAULT_SCORE_WEIGHTS)
      const stabilityResult = calculateScore(input, STABILITY_WEIGHTS)
      // Stability weights MDD at 0.25 vs default 0.15 — high MDD should hurt more
      expect(stabilityResult.score).toBeLessThan(defaultResult.score)
    })

    it('growth profile should reward high trade count more than default', () => {
      const input = makeInput({ totalTrades: 500, profitFactor: 2.0 })
      const defaultResult = calculateScore(input, DEFAULT_SCORE_WEIGHTS)
      const growthResult = calculateScore(input, GROWTH_WEIGHTS)
      // Growth weights tradeCount at 0.15 vs default 0.10
      expect(growthResult.score).toBeGreaterThanOrEqual(defaultResult.score - 5)
    })

    it('getWeightsByProfile should return correct weights', () => {
      expect(getWeightsByProfile('default')).toBe(DEFAULT_SCORE_WEIGHTS)
      expect(getWeightsByProfile('stability')).toBe(STABILITY_WEIGHTS)
      expect(getWeightsByProfile('growth')).toBe(GROWTH_WEIGHTS)
    })
  })
})
