// ============================================================
// Indicator Pre-computation Tests
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  precomputeIndicators,
  getMAsAtIndex,
  generateSmallTestData,
  SHORT_MA_PERIODS,
  LONG_MA_PERIODS,
} from './test-helpers';

describe('Indicator Precomputation', () => {
  const candles = generateSmallTestData('ranging', 100);
  const indicators = precomputeIndicators(candles);

  it('should compute all short MAs', () => {
    expect(indicators.shortMAs.size).toBe(SHORT_MA_PERIODS.length);

    for (const period of SHORT_MA_PERIODS) {
      const ma = indicators.shortMAs.get(period);
      expect(ma).toBeDefined();
      expect(ma!.length).toBeGreaterThan(0);
    }
  });

  it('should compute all long MAs', () => {
    expect(indicators.longMAs.size).toBe(LONG_MA_PERIODS.length);

    for (const period of LONG_MA_PERIODS) {
      const ma = indicators.longMAs.get(period);
      expect(ma).toBeDefined();
      expect(ma!.length).toBeGreaterThan(0);
    }
  });

  it('should compute stochastic values', () => {
    expect(indicators.stoch.length).toBeGreaterThan(0);

    const sample = indicators.stoch[0];
    expect(sample).toHaveProperty('k');
    expect(sample).toHaveProperty('d');
    expect(sample.k).toBeGreaterThanOrEqual(0);
    expect(sample.k).toBeLessThanOrEqual(100);
  });

  it('should get MAs at specific index', () => {
    const mas = getMAsAtIndex(indicators, 60);

    expect(mas).not.toBeNull();
    expect(mas!.short.length).toBe(SHORT_MA_PERIODS.length);
    expect(mas!.long.length).toBe(LONG_MA_PERIODS.length);
  });

  it('should return null for invalid index', () => {
    const mas = getMAsAtIndex(indicators, 5); // Too early
    expect(mas).toBeNull();
  });
});
