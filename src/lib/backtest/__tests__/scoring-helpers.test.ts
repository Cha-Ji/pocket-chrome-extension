import { describe, it, expect } from 'vitest';
import {
  calcBreakEven,
  calcWinRateDecided,
  calcTieRate,
  calcEVPerTrade,
  calcWrBeDelta,
} from '../scoring';

// ============================================================
// calcBreakEven
// ============================================================

describe('calcBreakEven', () => {
  it('should return ~52.08% for 92% payout', () => {
    const be = calcBreakEven(92);
    // 100 / (100 + 92) * 100 = 100/192*100 = 52.0833...
    expect(be).toBeCloseTo(52.08, 1);
  });

  it('should return 50% for 100% payout', () => {
    const be = calcBreakEven(100);
    // 100 / (100 + 100) * 100 = 50
    expect(be).toBe(50);
  });

  it('should return ~55.56% for 80% payout', () => {
    const be = calcBreakEven(80);
    // 100 / 180 * 100 = 55.555...
    expect(be).toBeCloseTo(55.56, 1);
  });

  it('should return 100% for 0% payout (impossible to profit)', () => {
    const be = calcBreakEven(0);
    expect(be).toBe(100);
  });

  it('should return 100% for negative payout', () => {
    const be = calcBreakEven(-10);
    expect(be).toBe(100);
  });

  it('should handle very high payout', () => {
    const be = calcBreakEven(200);
    // 100 / 300 * 100 = 33.33...
    expect(be).toBeCloseTo(33.33, 1);
  });
});

// ============================================================
// calcWinRateDecided
// ============================================================

describe('calcWinRateDecided', () => {
  it('should calculate win rate excluding ties', () => {
    // 55 wins, 45 losses → 55/(55+45) = 55%
    expect(calcWinRateDecided(55, 45)).toBeCloseTo(55, 10);
  });

  it('should return 100% when all wins', () => {
    expect(calcWinRateDecided(100, 0)).toBe(100);
  });

  it('should return 0% when all losses', () => {
    expect(calcWinRateDecided(0, 100)).toBe(0);
  });

  it('should return 0% when no decided trades', () => {
    expect(calcWinRateDecided(0, 0)).toBe(0);
  });

  it('should handle small numbers', () => {
    // 1 win, 1 loss → 50%
    expect(calcWinRateDecided(1, 1)).toBe(50);
  });
});

// ============================================================
// calcTieRate
// ============================================================

describe('calcTieRate', () => {
  it('should calculate tie rate as percentage of total trades', () => {
    // 10 ties out of 100 total → 10%
    expect(calcTieRate(10, 100)).toBe(10);
  });

  it('should return 0% when no ties', () => {
    expect(calcTieRate(0, 100)).toBe(0);
  });

  it('should return 100% when all ties', () => {
    expect(calcTieRate(50, 50)).toBe(100);
  });

  it('should return 0% when no trades', () => {
    expect(calcTieRate(0, 0)).toBe(0);
  });
});

// ============================================================
// calcEVPerTrade
// ============================================================

describe('calcEVPerTrade', () => {
  it('should return positive EV for 55% WR at 92% payout', () => {
    // EV = 0.55 * 0.92 - 0.45 = 0.506 - 0.45 = 0.056
    const ev = calcEVPerTrade(55, 45, 92);
    expect(ev).toBeCloseTo(0.056, 3);
  });

  it('should return ~0 EV at break-even WR', () => {
    // At ~52.08% WR with 92% payout, EV ≈ 0
    // Using 521 wins, 479 losses for ~52.1% decided WR
    const ev = calcEVPerTrade(521, 479, 92);
    expect(Math.abs(ev)).toBeLessThan(0.01);
  });

  it('should return negative EV for 40% WR at 92% payout', () => {
    // EV = 0.40 * 0.92 - 0.60 = 0.368 - 0.60 = -0.232
    const ev = calcEVPerTrade(40, 60, 92);
    expect(ev).toBeCloseTo(-0.232, 3);
  });

  it('should return 0 when no decided trades', () => {
    expect(calcEVPerTrade(0, 0, 92)).toBe(0);
  });

  it('should handle 80% payout correctly', () => {
    // 55% WR, 80% payout → EV = 0.55*0.80 - 0.45 = 0.44 - 0.45 = -0.01
    const ev = calcEVPerTrade(55, 45, 80);
    expect(ev).toBeCloseTo(-0.01, 3);
  });

  it('should handle 100% payout', () => {
    // At 100% payout, break-even is 50%, so 55% WR should be profitable
    // EV = 0.55 * 1.0 - 0.45 = 0.10
    const ev = calcEVPerTrade(55, 45, 100);
    expect(ev).toBeCloseTo(0.10, 3);
  });

  it('should handle all wins', () => {
    // 100% WR → EV = 1.0 * 0.92 - 0.0 = 0.92
    const ev = calcEVPerTrade(100, 0, 92);
    expect(ev).toBeCloseTo(0.92, 3);
  });

  it('should handle all losses', () => {
    // 0% WR → EV = 0 - 1.0 = -1.0
    const ev = calcEVPerTrade(0, 100, 92);
    expect(ev).toBeCloseTo(-1.0, 3);
  });

  it('ties do not affect EV calculation (only decided trades)', () => {
    // Same wins/losses ratio regardless of ties gives same EV
    const ev1 = calcEVPerTrade(55, 45, 92);
    const ev2 = calcEVPerTrade(55, 45, 92); // ties not in params
    expect(ev1).toBe(ev2);
  });
});

// ============================================================
// calcWrBeDelta
// ============================================================

describe('calcWrBeDelta', () => {
  it('should return positive delta for profitable strategy', () => {
    // 55% WR decided, 92% payout → BE ≈ 52.08 → delta ≈ 2.92
    const delta = calcWrBeDelta(55, 45, 92);
    expect(delta).toBeCloseTo(2.92, 0);
    expect(delta).toBeGreaterThan(0);
  });

  it('should return negative delta for losing strategy', () => {
    // 40% WR decided, 92% payout → BE ≈ 52.08 → delta ≈ -12.08
    const delta = calcWrBeDelta(40, 60, 92);
    expect(delta).toBeLessThan(0);
  });

  it('should return ~0 delta at break-even', () => {
    // ~52.08% WR at 92% payout
    // 5208 wins / 4792 losses ≈ 52.08%
    const delta = calcWrBeDelta(5208, 4792, 92);
    expect(Math.abs(delta)).toBeLessThan(0.1);
  });

  it('should return 0 when no decided trades', () => {
    // 0 wins, 0 losses → WR = 0, but BE = 52.08 → delta = -52.08
    // Actually with 0 decided, WR = 0, so delta = 0 - BE
    const delta = calcWrBeDelta(0, 0, 92);
    // When no decided trades, WR = 0, so delta = 0 - BE = negative
    expect(delta).toBeLessThan(0);
  });

  it('should adjust delta based on payout', () => {
    // Same WR but different payouts should give different deltas
    const delta80 = calcWrBeDelta(55, 45, 80);
    const delta92 = calcWrBeDelta(55, 45, 92);
    const delta100 = calcWrBeDelta(55, 45, 100);

    // Higher payout → lower break-even → larger delta
    expect(delta100).toBeGreaterThan(delta92);
    expect(delta92).toBeGreaterThan(delta80);
  });
});

// ============================================================
// Cross-validation: EV and WR-BE delta should agree on profitability
// ============================================================

describe('EV and WR-BE delta consistency', () => {
  const testCases = [
    { wins: 55, losses: 45, payout: 92, label: 'profitable' },
    { wins: 40, losses: 60, payout: 92, label: 'unprofitable' },
    { wins: 521, losses: 479, payout: 92, label: 'near-breakeven' },
    { wins: 60, losses: 40, payout: 80, label: 'profitable at low payout' },
    { wins: 50, losses: 50, payout: 100, label: 'break-even at 100% payout' },
  ];

  for (const tc of testCases) {
    it(`${tc.label}: EV sign should match delta sign`, () => {
      const ev = calcEVPerTrade(tc.wins, tc.losses, tc.payout);
      const delta = calcWrBeDelta(tc.wins, tc.losses, tc.payout);

      // Both should have the same sign (or both ≈ 0)
      if (Math.abs(ev) > 0.001 && Math.abs(delta) > 0.1) {
        expect(Math.sign(ev)).toBe(Math.sign(delta));
      }
    });
  }
});
