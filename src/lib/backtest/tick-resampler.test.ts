// ============================================================
// Tick Resampler 테스트
// ============================================================

import { describe, it, expect } from 'vitest';
import { resampleTicks, normalizeSymbol, isPayoutData, TickRow } from './tick-resampler';

// ============================================================
// 테스트 데이터 헬퍼
// ============================================================

/** 기본 tick 데이터 생성 헬퍼 */
function makeTick(overrides: Partial<TickRow> = {}): TickRow {
  return {
    symbol: '#AAPL_OTC',
    timestamp: 1770566065.342,
    open: 150.25,
    high: 150.25,
    low: 150.25,
    close: 150.25,
    volume: 0,
    source: 'history',
    ...overrides,
  };
}

/** 연속 tick 시퀀스 생성 (0.5초 간격) */
function makeTickSequence(
  baseTimestamp: number,
  prices: number[],
  options: { symbol?: string; source?: string } = {},
): TickRow[] {
  return prices.map((price, i) =>
    makeTick({
      timestamp: baseTimestamp + i * 0.5,
      open: price,
      high: price,
      low: price,
      close: price,
      ...options,
    }),
  );
}

// ============================================================
// normalizeSymbol 테스트
// ============================================================

describe('normalizeSymbol', () => {
  it('#AAPL_OTC → AAPL-OTC', () => {
    expect(normalizeSymbol('#AAPL_OTC')).toBe('AAPL-OTC');
  });

  it('APPLE-OTC → APPLE-OTC (변경 없음)', () => {
    expect(normalizeSymbol('APPLE-OTC')).toBe('APPLE-OTC');
  });

  it('#FB_OTC → FB-OTC', () => {
    expect(normalizeSymbol('#FB_OTC')).toBe('FB-OTC');
  });

  it('#msft_otc → MSFT-OTC (소문자 → 대문자)', () => {
    expect(normalizeSymbol('#msft_otc')).toBe('MSFT-OTC');
  });

  it('여러 언더스코어 처리: #A_B_C → A-B-C', () => {
    expect(normalizeSymbol('#A_B_C')).toBe('A-B-C');
  });

  it('# 없는 경우: TSLA_OTC → TSLA-OTC', () => {
    expect(normalizeSymbol('TSLA_OTC')).toBe('TSLA-OTC');
  });

  it('빈 문자열 처리', () => {
    expect(normalizeSymbol('')).toBe('');
  });

  it('# 만 있는 경우', () => {
    expect(normalizeSymbol('#')).toBe('');
  });
});

// ============================================================
// isPayoutData 테스트
// ============================================================

describe('isPayoutData', () => {
  it('OHLC 동일 + 0~100 범위 + realtime → true', () => {
    const tick = makeTick({
      open: 85,
      high: 85,
      low: 85,
      close: 85,
      source: 'realtime',
    });
    expect(isPayoutData(tick)).toBe(true);
  });

  it('OHLC 동일 + 0~100 범위 + history → true (source 무관)', () => {
    const tick = makeTick({
      open: 92,
      high: 92,
      low: 92,
      close: 92,
      source: 'history',
    });
    expect(isPayoutData(tick)).toBe(true);
  });

  it('OHLC 동일 + 경계값 0 → true', () => {
    const tick = makeTick({
      open: 0,
      high: 0,
      low: 0,
      close: 0,
      source: 'realtime',
    });
    expect(isPayoutData(tick)).toBe(true);
  });

  it('OHLC 동일 + 경계값 100 → true', () => {
    const tick = makeTick({
      open: 100,
      high: 100,
      low: 100,
      close: 100,
      source: 'realtime',
    });
    expect(isPayoutData(tick)).toBe(true);
  });

  it('OHLC가 다른 정상 가격 데이터 → false', () => {
    const tick = makeTick({
      open: 150.25,
      high: 150.5,
      low: 150.1,
      close: 150.3,
      source: 'realtime',
    });
    expect(isPayoutData(tick)).toBe(false);
  });

  it('OHLC 동일하지만 100 초과 (실제 가격) → false', () => {
    const tick = makeTick({
      open: 150.25,
      high: 150.25,
      low: 150.25,
      close: 150.25,
      source: 'realtime',
    });
    expect(isPayoutData(tick)).toBe(false);
  });

  it('OHLC 동일하지만 음수 → false', () => {
    const tick = makeTick({
      open: -5,
      high: -5,
      low: -5,
      close: -5,
      source: 'realtime',
    });
    expect(isPayoutData(tick)).toBe(false);
  });

  it('일부만 동일한 경우 → false', () => {
    const tick = makeTick({
      open: 85,
      high: 85,
      low: 84,
      close: 85,
      source: 'realtime',
    });
    expect(isPayoutData(tick)).toBe(false);
  });
});

// ============================================================
// resampleTicks 테스트
// ============================================================

describe('resampleTicks', () => {
  describe('기본 동작', () => {
    it('빈 배열 입력 시 빈 배열 반환', () => {
      const result = resampleTicks([]);
      expect(result).toEqual([]);
    });

    it('단일 tick 리샘플링', () => {
      const tick = makeTick({
        timestamp: 1770566100.0, // 정확히 interval 경계
        open: 150.25,
        high: 150.25,
        low: 150.25,
        close: 150.25,
      });

      const result = resampleTicks([tick]);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        timestamp: 1770566100 * 1000, // ms 변환
        open: 150.25,
        high: 150.25,
        low: 150.25,
        close: 150.25,
        volume: 1,
      });
    });

    it('같은 interval 내 여러 tick 리샘플링', () => {
      // 60초 interval 내에 여러 tick
      const ticks: TickRow[] = [
        makeTick({ timestamp: 1770566100.0, open: 150.1, high: 150.1, low: 150.1, close: 150.1 }),
        makeTick({ timestamp: 1770566100.5, open: 150.5, high: 150.5, low: 150.5, close: 150.5 }),
        makeTick({ timestamp: 1770566101.0, open: 149.9, high: 149.9, low: 149.9, close: 149.9 }),
        makeTick({ timestamp: 1770566101.5, open: 150.3, high: 150.3, low: 150.3, close: 150.3 }),
      ];

      const result = resampleTicks(ticks);
      expect(result).toHaveLength(1);
      expect(result[0].open).toBe(150.1); // 첫 tick의 open
      expect(result[0].high).toBe(150.5); // max(high)
      expect(result[0].low).toBe(149.9); // min(low)
      expect(result[0].close).toBe(150.3); // 마지막 tick의 close
      expect(result[0].volume).toBe(4); // tick 수
    });
  });

  describe('여러 interval 걸친 데이터', () => {
    it('2개 interval에 걸친 tick 데이터', () => {
      // interval 1: 1770566100 ~ 1770566159
      // interval 2: 1770566160 ~ 1770566219
      const ticks: TickRow[] = [
        // 1번째 interval
        makeTick({ timestamp: 1770566100.0, open: 150.1, high: 150.1, low: 150.1, close: 150.1 }),
        makeTick({ timestamp: 1770566130.0, open: 150.5, high: 150.5, low: 150.5, close: 150.5 }),
        // 2번째 interval
        makeTick({ timestamp: 1770566160.0, open: 151.0, high: 151.0, low: 151.0, close: 151.0 }),
        makeTick({ timestamp: 1770566190.0, open: 150.8, high: 150.8, low: 150.8, close: 150.8 }),
      ];

      const result = resampleTicks(ticks);
      expect(result).toHaveLength(2);

      // 1번째 캔들
      expect(result[0].timestamp).toBe(1770566100 * 1000);
      expect(result[0].open).toBe(150.1);
      expect(result[0].close).toBe(150.5);
      expect(result[0].volume).toBe(2);

      // 2번째 캔들
      expect(result[1].timestamp).toBe(1770566160 * 1000);
      expect(result[1].open).toBe(151.0);
      expect(result[1].close).toBe(150.8);
      expect(result[1].volume).toBe(2);
    });

    it('3개 interval, 중간 interval 비어있는 경우', () => {
      const ticks: TickRow[] = [
        makeTick({ timestamp: 1770566100.0, open: 150.0, high: 150.0, low: 150.0, close: 150.0 }),
        // 1770566160 interval은 tick 없음
        makeTick({ timestamp: 1770566220.0, open: 151.0, high: 151.0, low: 151.0, close: 151.0 }),
      ];

      const result = resampleTicks(ticks);
      expect(result).toHaveLength(2);
      // 비어있는 interval은 캔들이 생성되지 않음
      expect(result[0].timestamp).toBe(1770566100 * 1000);
      expect(result[1].timestamp).toBe(1770566220 * 1000);
    });

    it('timestamp 오름차순 정렬 보장 (입력이 뒤섞인 경우)', () => {
      const ticks: TickRow[] = [
        makeTick({ timestamp: 1770566220.0, open: 151.0, high: 151.0, low: 151.0, close: 151.0 }),
        makeTick({ timestamp: 1770566100.0, open: 150.0, high: 150.0, low: 150.0, close: 150.0 }),
        makeTick({ timestamp: 1770566160.0, open: 150.5, high: 150.5, low: 150.5, close: 150.5 }),
      ];

      const result = resampleTicks(ticks);
      expect(result).toHaveLength(3);
      // 오름차순 확인
      expect(result[0].timestamp).toBeLessThan(result[1].timestamp);
      expect(result[1].timestamp).toBeLessThan(result[2].timestamp);
    });
  });

  describe('옵션 테스트', () => {
    it('intervalSeconds 변경 (30초봉)', () => {
      const ticks: TickRow[] = [
        makeTick({ timestamp: 1770566100.0, open: 150.0, high: 150.0, low: 150.0, close: 150.0 }),
        makeTick({ timestamp: 1770566115.0, open: 150.1, high: 150.1, low: 150.1, close: 150.1 }),
        makeTick({ timestamp: 1770566130.0, open: 150.2, high: 150.2, low: 150.2, close: 150.2 }),
        makeTick({ timestamp: 1770566145.0, open: 150.3, high: 150.3, low: 150.3, close: 150.3 }),
      ];

      const result = resampleTicks(ticks, { intervalSeconds: 30 });
      // 1770566100~1770566129 → 1번째 캔들, 1770566130~1770566159 → 2번째 캔들
      expect(result).toHaveLength(2);
      expect(result[0].volume).toBe(2);
      expect(result[1].volume).toBe(2);
    });

    it('minTicksPerCandle 필터링', () => {
      const ticks: TickRow[] = [
        // interval 1: tick 1개
        makeTick({ timestamp: 1770566100.0, open: 150.0, high: 150.0, low: 150.0, close: 150.0 }),
        // interval 2: tick 3개
        makeTick({ timestamp: 1770566160.0, open: 150.1, high: 150.1, low: 150.1, close: 150.1 }),
        makeTick({ timestamp: 1770566160.5, open: 150.2, high: 150.2, low: 150.2, close: 150.2 }),
        makeTick({ timestamp: 1770566161.0, open: 150.3, high: 150.3, low: 150.3, close: 150.3 }),
      ];

      const result = resampleTicks(ticks, { minTicksPerCandle: 2 });
      expect(result).toHaveLength(1); // interval 1은 제외됨
      expect(result[0].volume).toBe(3);
    });

    it('filterPayout=false이면 페이아웃 데이터도 포함', () => {
      const ticks: TickRow[] = [
        makeTick({
          timestamp: 1770566100.0,
          open: 85,
          high: 85,
          low: 85,
          close: 85,
          source: 'realtime',
        }),
        makeTick({
          timestamp: 1770566100.5,
          open: 150.0,
          high: 150.0,
          low: 150.0,
          close: 150.0,
          source: 'history',
        }),
      ];

      const result = resampleTicks(ticks, { filterPayout: false });
      expect(result).toHaveLength(1);
      expect(result[0].volume).toBe(2); // 페이아웃도 포함
    });
  });

  describe('페이아웃 필터링', () => {
    it('기본적으로 페이아웃 데이터가 필터링됨', () => {
      const ticks: TickRow[] = [
        // 페이아웃 데이터 (OHLC 동일, 0~100 범위)
        makeTick({
          timestamp: 1770566100.0,
          open: 85,
          high: 85,
          low: 85,
          close: 85,
          source: 'realtime',
        }),
        // 정상 가격 데이터
        makeTick({
          timestamp: 1770566100.5,
          open: 150.0,
          high: 150.0,
          low: 150.0,
          close: 150.0,
          source: 'history',
        }),
        // 또 다른 페이아웃
        makeTick({
          timestamp: 1770566101.0,
          open: 92,
          high: 92,
          low: 92,
          close: 92,
          source: 'realtime',
        }),
      ];

      const result = resampleTicks(ticks);
      expect(result).toHaveLength(1);
      expect(result[0].volume).toBe(1); // 정상 데이터 1개만
      expect(result[0].open).toBe(150.0);
    });

    it('모든 데이터가 페이아웃이면 빈 배열 반환', () => {
      const ticks: TickRow[] = [
        makeTick({
          timestamp: 1770566100.0,
          open: 85,
          high: 85,
          low: 85,
          close: 85,
          source: 'realtime',
        }),
        makeTick({
          timestamp: 1770566100.5,
          open: 90,
          high: 90,
          low: 90,
          close: 90,
          source: 'realtime',
        }),
      ];

      const result = resampleTicks(ticks);
      expect(result).toEqual([]);
    });

    it('100 초과 가격(실제 자산)은 필터링되지 않음', () => {
      const ticks: TickRow[] = [
        makeTick({
          timestamp: 1770566100.0,
          open: 1850.5,
          high: 1850.5,
          low: 1850.5,
          close: 1850.5,
          source: 'realtime',
        }),
      ];

      const result = resampleTicks(ticks);
      expect(result).toHaveLength(1);
      expect(result[0].open).toBe(1850.5);
    });
  });

  describe('timestamp 정규화', () => {
    it('초 단위 timestamp가 ms 단위로 변환됨', () => {
      const tick = makeTick({ timestamp: 1770566100.5 });
      const result = resampleTicks([tick]);
      expect(result[0].timestamp).toBe(1770566100 * 1000);
    });

    it('소수점 timestamp가 올바르게 bucket에 할당됨', () => {
      // 같은 60초 bucket에 속하는 소수점 timestamp들
      const ticks: TickRow[] = [
        makeTick({ timestamp: 1770566100.123, open: 150.0, high: 150.0, low: 150.0, close: 150.0 }),
        makeTick({ timestamp: 1770566100.789, open: 150.1, high: 150.1, low: 150.1, close: 150.1 }),
        makeTick({ timestamp: 1770566159.999, open: 150.2, high: 150.2, low: 150.2, close: 150.2 }),
      ];

      const result = resampleTicks(ticks);
      expect(result).toHaveLength(1);
      expect(result[0].volume).toBe(3);
    });
  });

  describe('실제 시나리오', () => {
    it('0.5초 간격 tick 120개 → 1분봉 1개', () => {
      // 60초에 0.5초 간격이면 120개 tick
      const baseTime = 1770566100.0; // interval 경계
      const ticks = makeTickSequence(
        baseTime,
        Array.from({ length: 120 }, (_, i) => 150 + Math.sin(i / 10) * 2),
      );

      const result = resampleTicks(ticks);
      expect(result).toHaveLength(1);
      expect(result[0].volume).toBe(120);
      expect(result[0].open).toBeCloseTo(150, 0); // 첫 tick
    });

    it('0.5초 간격 tick 240개 → 1분봉 2개', () => {
      // 120초에 0.5초 간격이면 240개 tick → 2개 interval
      const baseTime = 1770566100.0;
      const prices = Array.from({ length: 240 }, (_, i) => 150 + i * 0.01);
      const ticks = makeTickSequence(baseTime, prices);

      const result = resampleTicks(ticks);
      expect(result).toHaveLength(2);
      expect(result[0].volume).toBe(120); // 첫 60초
      expect(result[1].volume).toBe(120); // 다음 60초
      // 첫 캔들의 open < 마지막 캔들의 close (상승 추세)
      expect(result[0].open).toBeLessThan(result[1].close);
    });

    it('여러 심볼이 섞여도 필터링하지 않음 (호출자가 미리 필터)', () => {
      // resampleTicks는 심볼을 구분하지 않음
      // 호출 측에서 심볼별로 분리하여 호출해야 함
      const ticks: TickRow[] = [
        makeTick({
          symbol: '#AAPL_OTC',
          timestamp: 1770566100.0,
          open: 150.0,
          high: 150.0,
          low: 150.0,
          close: 150.0,
        }),
        makeTick({
          symbol: '#MSFT_OTC',
          timestamp: 1770566100.5,
          open: 300.0,
          high: 300.0,
          low: 300.0,
          close: 300.0,
        }),
      ];

      const result = resampleTicks(ticks);
      expect(result).toHaveLength(1);
      expect(result[0].volume).toBe(2); // 심볼 구분 없이 합산
    });
  });
});
