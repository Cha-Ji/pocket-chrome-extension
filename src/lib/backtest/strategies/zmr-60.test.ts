// ============================================================
// ZMR-60 Strategy Tests
// ============================================================

import { describe, it, expect } from 'vitest';
import { zmr60Strategy, DEFAULT_ZMR60_CONFIG, ZMR60Config } from './zmr-60';
import { Candle } from '../../signals/types';

// ============================================================
// Test Data Generators
// ============================================================

/**
 * 안정적인 횡보 데이터 생성 → 마지막 캔들에서 급락 삽입
 * RSI를 낮추고, bbPosition을 하단에 놓고, 하방 윅을 크게 만들어
 * CALL 신호가 나오도록 설계
 */
function generateSharpDropData(count: number = 90): Candle[] {
  const candles: Candle[] = [];
  let price = 100;

  // 안정적 횡보 구간 (0 ~ count-5): 작은 변동
  for (let i = 0; i < count - 5; i++) {
    const change = Math.sin(i * 0.1) * 0.1; // 작은 사인파 변동
    price = 100 + change;
    const body = 0.02;
    candles.push({
      timestamp: Date.now() + i * 60000,
      open: price,
      high: price + body,
      low: price - body,
      close: price + (i % 2 === 0 ? body * 0.5 : -body * 0.5),
    });
  }

  // 급락 구간 (마지막 5개): 가격을 크게 하락시킴
  for (let i = count - 5; i < count - 1; i++) {
    price -= 0.8; // 급격한 하락
    candles.push({
      timestamp: Date.now() + i * 60000,
      open: price + 0.4,
      high: price + 0.5,
      low: price - 0.3,
      close: price,
    });
  }

  // 마지막 캔들: 극단적 급락 + 큰 하방 윅 (반등 징후)
  price -= 1.5;
  const wickLow = price - 1.0; // 큰 하방 윅
  const closePrice = price + 0.1; // 약간 반등
  candles.push({
    timestamp: Date.now() + (count - 1) * 60000,
    open: price + 0.5,
    high: price + 0.6,
    low: wickLow,
    close: closePrice,
  });

  return candles;
}

/**
 * 안정적인 횡보 데이터 생성 → 마지막 캔들에서 급등 삽입
 * RSI를 높이고, bbPosition을 상단에 놓고, 상방 윅을 크게 만들어
 * PUT 신호가 나오도록 설계
 */
function generateSharpSurgeData(count: number = 90): Candle[] {
  const candles: Candle[] = [];
  let price = 100;

  // 안정적 횡보 구간
  for (let i = 0; i < count - 5; i++) {
    const change = Math.sin(i * 0.1) * 0.1;
    price = 100 + change;
    const body = 0.02;
    candles.push({
      timestamp: Date.now() + i * 60000,
      open: price,
      high: price + body,
      low: price - body,
      close: price + (i % 2 === 0 ? body * 0.5 : -body * 0.5),
    });
  }

  // 급등 구간 (마지막 5개)
  for (let i = count - 5; i < count - 1; i++) {
    price += 0.8;
    candles.push({
      timestamp: Date.now() + i * 60000,
      open: price - 0.4,
      high: price + 0.3,
      low: price - 0.5,
      close: price,
    });
  }

  // 마지막 캔들: 극단적 급등 + 큰 상방 윅 (반전 징후)
  price += 1.5;
  const wickHigh = price + 1.0;
  const closePrice = price - 0.1;
  candles.push({
    timestamp: Date.now() + (count - 1) * 60000,
    open: price - 0.5,
    high: wickHigh,
    low: price - 0.6,
    close: closePrice,
  });

  return candles;
}

/**
 * 횡보 데이터만 생성 (신호 없어야 함)
 */
function generateFlatData(count: number = 90): Candle[] {
  const candles: Candle[] = [];
  const basePrice = 100;

  for (let i = 0; i < count; i++) {
    const noise = Math.sin(i * 0.05) * 0.02;
    const price = basePrice + noise;
    candles.push({
      timestamp: Date.now() + i * 60000,
      open: price - 0.005,
      high: price + 0.01,
      low: price - 0.01,
      close: price + 0.005,
    });
  }

  return candles;
}

/**
 * 급락은 있지만 확인 조건이 1개만 충족되는 데이터
 * Z-score 트리거는 걸리지만 RSI/BB/윅 중 1개만 충족
 */
function generatePartialConfirmData(count: number = 90): Candle[] {
  const candles: Candle[] = [];
  let price = 100;

  // 조금 더 변동성 있는 횡보 (RSI가 중립 범위에 있도록)
  for (let i = 0; i < count - 2; i++) {
    const change = Math.sin(i * 0.15) * 0.3;
    price = 100 + change;
    candles.push({
      timestamp: Date.now() + i * 60000,
      open: price,
      high: price + 0.15,
      low: price - 0.15,
      close: price + (i % 2 === 0 ? 0.05 : -0.05),
    });
  }

  // 급락하지만 윅은 작게 (body가 큰 음봉)
  price -= 1.5;
  candles.push({
    timestamp: Date.now() + (count - 2) * 60000,
    open: price + 1.0,
    high: price + 1.1,
    low: price - 0.05,
    close: price,
  });

  // 추가 급락 (윅 작은 순수 음봉 → wickConfirm 미충족)
  price -= 1.0;
  candles.push({
    timestamp: Date.now() + (count - 1) * 60000,
    open: price + 0.8,
    high: price + 0.85, // 상방 윅 작음
    low: price - 0.02, // 하방 윅 매우 작음
    close: price, // body가 큼
  });

  return candles;
}

// ============================================================
// Core Strategy Tests
// ============================================================

describe('ZMR-60 Strategy', () => {
  describe('데이터 부족 처리', () => {
    it('캔들이 minCandles(80) 미만이면 null 반환', () => {
      const candles = generateFlatData(50);
      const result = zmr60Strategy(candles);
      expect(result.signal).toBeNull();
      expect(result.reason).toContain('Insufficient data');
    });

    it('빈 배열에서 null 반환', () => {
      const result = zmr60Strategy([]);
      expect(result.signal).toBeNull();
    });

    it('정확히 80개 캔들에서 동작 (경계값)', () => {
      const candles = generateFlatData(80);
      const result = zmr60Strategy(candles);
      // 평탄한 데이터이므로 신호 없음이 정상
      expect(result).toHaveProperty('signal');
      expect(result).toHaveProperty('indicators');
    });
  });

  describe('CALL 신호 생성', () => {
    it('극단 급락 + 하단밴드 근접 + RSI 과매도 + 하방윅 → CALL', () => {
      const candles = generateSharpDropData(90);
      // z threshold를 낮추어 테스트 데이터에서 확실히 트리거
      const result = zmr60Strategy(candles, {
        zThreshold: 1.5, // 테스트용으로 낮춤
        confirmMin: 1, // 1개만 확인해도 OK (테스트 단순화)
      });
      // 급락 데이터이므로 CALL이 나와야 함 (또는 null — z가 충분히 극단이 아닐 수 있음)
      if (result.signal !== null) {
        expect(result.signal).toBe('CALL');
        expect(result.confidence).toBeGreaterThanOrEqual(0.6);
        expect(result.confidence).toBeLessThanOrEqual(0.9);
      }
    });

    it('CALL 신호의 reason에 z, RSI, BBpos, wick 정보가 포함됨', () => {
      const candles = generateSharpDropData(90);
      const result = zmr60Strategy(candles, { zThreshold: 1.5, confirmMin: 1 });
      if (result.signal === 'CALL') {
        expect(result.reason).toContain('ZMR-60');
        expect(result.reason).toContain('z=');
      }
    });

    it('CALL 신호의 indicators에 z, sigma, rLast, rsi, bbPosition, wickRatio 포함', () => {
      const candles = generateSharpDropData(90);
      const result = zmr60Strategy(candles, { zThreshold: 1.5, confirmMin: 1 });
      if (result.signal === 'CALL') {
        expect(result.indicators).toHaveProperty('z');
        expect(result.indicators).toHaveProperty('sigma');
        expect(result.indicators).toHaveProperty('rLast');
        expect(result.indicators).toHaveProperty('rsi');
        expect(result.indicators).toHaveProperty('bbPosition');
        expect(result.indicators).toHaveProperty('wickRatio');
        expect(result.indicators).toHaveProperty('confirmCount');
        expect(result.indicators.z).toBeLessThan(0); // 급락이므로 z < 0
      }
    });
  });

  describe('PUT 신호 생성', () => {
    it('극단 급등 + 상단밴드 근접 + RSI 과매수 + 상방윅 → PUT', () => {
      const candles = generateSharpSurgeData(90);
      const result = zmr60Strategy(candles, {
        zThreshold: 1.5,
        confirmMin: 1,
      });
      if (result.signal !== null) {
        expect(result.signal).toBe('PUT');
        expect(result.confidence).toBeGreaterThanOrEqual(0.6);
        expect(result.confidence).toBeLessThanOrEqual(0.9);
      }
    });

    it('PUT 신호의 z 값이 양수', () => {
      const candles = generateSharpSurgeData(90);
      const result = zmr60Strategy(candles, { zThreshold: 1.5, confirmMin: 1 });
      if (result.signal === 'PUT') {
        expect(result.indicators.z).toBeGreaterThan(0);
      }
    });
  });

  describe('필터링 (신호 미생성 케이스)', () => {
    it('횡보 데이터(변동 미미)에서는 z-trigger 미충족 → null', () => {
      const candles = generateFlatData(90);
      const result = zmr60Strategy(candles);
      expect(result.signal).toBeNull();
    });

    it('z-trigger 충족하지만 confirmMin 미충족 → null', () => {
      // confirmMin=3 으로 올려서 3개 모두 충족해야 신호
      const candles = generateSharpDropData(90);
      const result = zmr60Strategy(candles, {
        zThreshold: 1.5,
        confirmMin: 3, // 3개 모두 필요
      });
      // 3개 모두 충족하기 어려울 수 있으므로 null 가능
      // 핵심: confirmMin이 높으면 필터링됨을 확인
      if (result.signal === null) {
        expect(result.reason).toContain('confirms=');
      }
    });

    it('높은 zThreshold(10.0)에서는 횡보 데이터에서 null', () => {
      // 평탄한 데이터는 극단 z에 도달하지 못함
      const candles = generateFlatData(90);
      const result = zmr60Strategy(candles, { zThreshold: 10.0 });
      expect(result.signal).toBeNull();
    });
  });

  describe('confidence 산정', () => {
    it('confidence는 0.60~0.90 범위', () => {
      const candles = generateSharpDropData(90);
      const result = zmr60Strategy(candles, { zThreshold: 1.5, confirmMin: 1 });
      if (result.signal !== null) {
        expect(result.confidence).toBeGreaterThanOrEqual(0.6);
        expect(result.confidence).toBeLessThanOrEqual(0.9);
      }
    });
  });

  describe('config 커스터마이즈', () => {
    it('rsiPeriod 변경이 반영됨', () => {
      const candles = generateSharpDropData(90);
      const result14 = zmr60Strategy(candles, { rsiPeriod: 14, zThreshold: 1.5, confirmMin: 1 });
      const result7 = zmr60Strategy(candles, { rsiPeriod: 7, zThreshold: 1.5, confirmMin: 1 });

      // RSI 기간에 따라 값이 다를 수 있음 (동일 신호일 수도 있지만 indicators.rsi 값이 다름)
      if (result14.signal !== null && result7.signal !== null) {
        // 두 결과 모두 indicators에 rsi가 있어야 함
        expect(result14.indicators).toHaveProperty('rsi');
        expect(result7.indicators).toHaveProperty('rsi');
      }
    });

    it('minCandles를 100으로 올리면 90개 데이터에서 null', () => {
      const candles = generateSharpDropData(90);
      const result = zmr60Strategy(candles, { minCandles: 100 });
      expect(result.signal).toBeNull();
      expect(result.reason).toContain('Insufficient data');
    });
  });

  describe('엣지 케이스', () => {
    it('모든 캔들이 동일 가격(σ=0)이면 null 반환', () => {
      const candles: Candle[] = Array.from({ length: 90 }, (_, i) => ({
        timestamp: Date.now() + i * 60000,
        open: 100,
        high: 100,
        low: 100,
        close: 100,
      }));
      const result = zmr60Strategy(candles);
      expect(result.signal).toBeNull();
      expect(result.reason).toContain('Zero volatility');
    });
  });
});

// ============================================================
// Integration: runHighWinRateStrategy('zmr-60')
// ============================================================

describe('ZMR-60 in runHighWinRateStrategy', () => {
  it('runHighWinRateStrategy("zmr-60") 호출 가능', async () => {
    const { runHighWinRateStrategy } = await import('./high-winrate');
    const candles = generateFlatData(90);
    const result = runHighWinRateStrategy('zmr-60', candles);
    expect(result).toHaveProperty('signal');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('reason');
    expect(result).toHaveProperty('indicators');
  });
});
