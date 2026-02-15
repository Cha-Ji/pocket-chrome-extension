// ============================================================
// Timestamp Normalization 테스트
// ============================================================

import { describe, it, expect } from 'vitest';
import { toEpochMs, toEpochSec, isMilliseconds, diagnoseTimestamps } from './time';

// ============================================================
// toEpochMs 테스트
// ============================================================

describe('toEpochMs', () => {
  describe('sec 정수 입력', () => {
    it('10자리 sec → 13자리 ms 변환', () => {
      expect(toEpochMs(1770566065)).toBe(1770566065000);
    });

    it('sec 정수 0 → 0', () => {
      expect(toEpochMs(0)).toBe(0);
    });

    it('작은 sec 값도 ms로 변환', () => {
      expect(toEpochMs(1000000000)).toBe(1000000000000);
    });
  });

  describe('sec 소수 입력', () => {
    it('소수점 sec → ms (Math.floor)', () => {
      expect(toEpochMs(1770566065.342)).toBe(1770566065342);
    });

    it('소수점 sec 반올림 없이 버림', () => {
      expect(toEpochMs(1770566065.999)).toBe(1770566065999);
    });

    it('0.5초 → 500ms', () => {
      expect(toEpochMs(0.5)).toBe(500);
    });

    it('작은 소수 sec (부동소수점 주의)', () => {
      // 1.001 * 1000 = 1000.999... in IEEE 754 → Math.floor = 1000
      // 실제 사용 케이스(10자리 timestamp)에서는 정밀도 문제 없음
      expect(toEpochMs(1.001)).toBe(1000);
    });

    it('실제 크기 소수 sec', () => {
      // 실제 사용되는 10자리 소수 timestamp
      expect(toEpochMs(1770566065.342)).toBe(1770566065342);
    });
  });

  describe('ms 정수 입력', () => {
    it('13자리 ms → 그대로 반환', () => {
      expect(toEpochMs(1770566065342)).toBe(1770566065342);
    });

    it('경계값: 1e12 정확히 → ms 판단', () => {
      expect(toEpochMs(1000000000000)).toBe(1000000000000);
    });

    it('14자리 ms → 그대로 반환', () => {
      expect(toEpochMs(17705660653420)).toBe(17705660653420);
    });
  });

  describe('문자열 입력', () => {
    it('문자열 sec → ms 변환', () => {
      expect(toEpochMs('1770566065')).toBe(1770566065000);
    });

    it('문자열 ms → 그대로 반환', () => {
      expect(toEpochMs('1770566065342')).toBe(1770566065342);
    });

    it('문자열 소수 sec → ms 변환', () => {
      expect(toEpochMs('1770566065.342')).toBe(1770566065342);
    });
  });

  describe('에러 케이스', () => {
    it('NaN 입력 시 에러', () => {
      expect(() => toEpochMs(NaN)).toThrow('invalid timestamp');
    });

    it('Infinity 입력 시 에러', () => {
      expect(() => toEpochMs(Infinity)).toThrow('invalid timestamp');
    });

    it('-Infinity 입력 시 에러', () => {
      expect(() => toEpochMs(-Infinity)).toThrow('invalid timestamp');
    });

    it('유효하지 않은 문자열 시 에러', () => {
      expect(() => toEpochMs('not-a-number')).toThrow('invalid timestamp');
    });

    it('빈 문자열 시 에러', () => {
      expect(() => toEpochMs('')).toThrow('invalid timestamp');
    });
  });
});

// ============================================================
// toEpochSec 테스트
// ============================================================

describe('toEpochSec', () => {
  it('ms → sec 변환', () => {
    expect(toEpochSec(1770566065000)).toBe(1770566065);
  });

  it('ms → sec 소수점 유지', () => {
    expect(toEpochSec(1770566065342)).toBeCloseTo(1770566065.342, 3);
  });

  it('0 → 0', () => {
    expect(toEpochSec(0)).toBe(0);
  });
});

// ============================================================
// isMilliseconds 테스트
// ============================================================

describe('isMilliseconds', () => {
  it('13자리 → true', () => {
    expect(isMilliseconds(1770566065342)).toBe(true);
  });

  it('10자리 → false', () => {
    expect(isMilliseconds(1770566065)).toBe(false);
  });

  it('경계값 1e12 → true', () => {
    expect(isMilliseconds(1e12)).toBe(true);
  });

  it('경계값 미만 → false', () => {
    expect(isMilliseconds(999999999999)).toBe(false);
  });
});

// ============================================================
// diagnoseTimestamps 테스트
// ============================================================

describe('diagnoseTimestamps', () => {
  it('모두 ms인 경우 → 혼재 없음', () => {
    const result = diagnoseTimestamps([1770566065000, 1770566065500, 1770566066000]);
    expect(result.isMixed).toBe(false);
    expect(result.msCount).toBe(3);
    expect(result.secCount).toBe(0);
    expect(result.secFloatCount).toBe(0);
  });

  it('모두 sec 정수인 경우 → 혼재 없음', () => {
    const result = diagnoseTimestamps([1770566065, 1770566066, 1770566067]);
    expect(result.isMixed).toBe(false);
    expect(result.secCount).toBe(3);
  });

  it('ms + sec 혼재 → isMixed=true', () => {
    const result = diagnoseTimestamps([1770566065000, 1770566066]);
    expect(result.isMixed).toBe(true);
    expect(result.msCount).toBe(1);
    expect(result.secCount).toBe(1);
  });

  it('sec 정수 + sec 소수 혼재 → isMixed=true', () => {
    const result = diagnoseTimestamps([1770566065, 1770566066.5]);
    expect(result.isMixed).toBe(true);
    expect(result.secCount).toBe(1);
    expect(result.secFloatCount).toBe(1);
  });

  it('모두 소수 sec → 혼재 없음', () => {
    const result = diagnoseTimestamps([1770566065.1, 1770566065.5, 1770566066.3]);
    expect(result.isMixed).toBe(false);
    expect(result.secFloatCount).toBe(3);
  });

  it('빈 배열', () => {
    const result = diagnoseTimestamps([]);
    expect(result.isMixed).toBe(false);
    expect(result.totalCount).toBe(0);
  });
});
