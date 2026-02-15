// ============================================================
// Trend Following Strategies (v3) - For Trending Markets
// ============================================================
// 목표: ADX >= 25인 추세장에서 52.1% 이상 승률 달성
// 핵심 원칙:
// 1. 추세 방향으로만 진입 (역추세 금지)
// 2. 풀백(조정) 구간에서 진입
// 3. 다중 확인으로 신뢰도 향상
// ============================================================

import { Candle } from '../../signals/types';
import { RSI, MACD, EMA } from '../../indicators';

// ============================================================
// Strategy Interfaces
// ============================================================

export interface TrendStrategyResult {
  signal: 'CALL' | 'PUT' | null;
  confidence: number;
  reason: string;
  indicators: Record<string, number>;
}

export interface TrendStrategyConfig {
  adxPeriod: number;
  adxThreshold: number; // 추세 확인 임계값 (기본 25)
  strongTrendThreshold: number; // 강한 추세 임계값 (기본 40)
  emaFast: number;
  emaSlow: number;
  rsiPeriod: number;
}

export const DEFAULT_TREND_CONFIG: TrendStrategyConfig = {
  adxPeriod: 14,
  adxThreshold: 25,
  strongTrendThreshold: 40,
  emaFast: 9,
  emaSlow: 21,
  rsiPeriod: 14,
};

// ============================================================
// ADX/DI Calculator (Inline for independence)
// ============================================================

interface ADXResult {
  adx: number;
  plusDI: number;
  minusDI: number;
  trend: 'up' | 'down' | 'none';
  strength: 'strong' | 'weak' | 'none';
}

function calculateADX(candles: Candle[], period: number = 14): ADXResult | null {
  if (candles.length < period * 2 + 1) return null;

  const dms: { plusDM: number; minusDM: number; tr: number }[] = [];

  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i];
    const prev = candles[i - 1];

    const upMove = curr.high - prev.high;
    const downMove = prev.low - curr.low;

    let plusDM = 0;
    let minusDM = 0;

    if (upMove > downMove && upMove > 0) plusDM = upMove;
    if (downMove > upMove && downMove > 0) minusDM = downMove;

    const tr = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close),
    );

    dms.push({ plusDM, minusDM, tr });
  }

  let smoothedPlusDM = dms.slice(0, period).reduce((s, d) => s + d.plusDM, 0);
  let smoothedMinusDM = dms.slice(0, period).reduce((s, d) => s + d.minusDM, 0);
  let smoothedTR = dms.slice(0, period).reduce((s, d) => s + d.tr, 0);

  const dxValues: number[] = [];

  for (let i = period; i < dms.length; i++) {
    smoothedPlusDM = smoothedPlusDM - smoothedPlusDM / period + dms[i].plusDM;
    smoothedMinusDM = smoothedMinusDM - smoothedMinusDM / period + dms[i].minusDM;
    smoothedTR = smoothedTR - smoothedTR / period + dms[i].tr;

    const plusDI = smoothedTR > 0 ? (smoothedPlusDM / smoothedTR) * 100 : 0;
    const minusDI = smoothedTR > 0 ? (smoothedMinusDM / smoothedTR) * 100 : 0;

    const diDiff = Math.abs(plusDI - minusDI);
    const diSum = plusDI + minusDI;

    const dx = diSum > 0 ? (diDiff / diSum) * 100 : 0;
    dxValues.push(dx);
  }

  if (dxValues.length < period) return null;

  let adx = dxValues.slice(0, period).reduce((s, v) => s + v, 0) / period;

  for (let i = period; i < dxValues.length; i++) {
    adx = (adx * (period - 1) + dxValues[i]) / period;
  }

  const lastPlusDI = smoothedTR > 0 ? (smoothedPlusDM / smoothedTR) * 100 : 0;
  const lastMinusDI = smoothedTR > 0 ? (smoothedMinusDM / smoothedTR) * 100 : 0;

  // Determine trend direction and strength
  const trend = lastPlusDI > lastMinusDI ? 'up' : lastMinusDI > lastPlusDI ? 'down' : 'none';
  const strength = adx >= 40 ? 'strong' : adx >= 25 ? 'weak' : 'none';

  return { adx, plusDI: lastPlusDI, minusDI: lastMinusDI, trend, strength };
}

// ============================================================
// ATR Calculator for Supertrend
// ============================================================

function calculateATR(candles: Candle[], period: number = 14): number | null {
  if (candles.length < period + 1) return null;

  const trueRanges: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i];
    const prev = candles[i - 1];

    const tr = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close),
    );
    trueRanges.push(tr);
  }

  if (trueRanges.length < period) return null;

  // Simple ATR (SMA of TR)
  const atr = trueRanges.slice(-period).reduce((s, v) => s + v, 0) / period;
  return atr;
}

// ============================================================
// Strategy 1: ADX + DI Crossover
// ============================================================
// 추세 강도가 충분하고 DI가 교차할 때 진입

export function adxDiCrossoverStrategy(
  candles: Candle[],
  config: Partial<TrendStrategyConfig> = {},
): TrendStrategyResult {
  const cfg = { ...DEFAULT_TREND_CONFIG, ...config };

  if (candles.length < 50) {
    return { signal: null, confidence: 0, reason: 'Insufficient data', indicators: {} };
  }

  const adxResult = calculateADX(candles, cfg.adxPeriod);
  if (!adxResult) {
    return { signal: null, confidence: 0, reason: 'ADX calculation failed', indicators: {} };
  }

  // 이전 ADX 계산 (DI 크로스 확인용)
  const prevAdxResult = calculateADX(candles.slice(0, -1), cfg.adxPeriod);
  if (!prevAdxResult) {
    return { signal: null, confidence: 0, reason: 'Prev ADX failed', indicators: {} };
  }

  const indicators = {
    adx: adxResult.adx,
    plusDI: adxResult.plusDI,
    minusDI: adxResult.minusDI,
    prevPlusDI: prevAdxResult.plusDI,
    prevMinusDI: prevAdxResult.minusDI,
  };

  // 추세가 약하면 신호 없음
  if (adxResult.adx < cfg.adxThreshold) {
    return {
      signal: null,
      confidence: 0,
      reason: `ADX too low (${adxResult.adx.toFixed(1)})`,
      indicators,
    };
  }

  // DI Crossover 확인
  const prevPlusDIHigher = prevAdxResult.plusDI > prevAdxResult.minusDI;
  const currPlusDIHigher = adxResult.plusDI > adxResult.minusDI;

  // +DI가 -DI를 상향 돌파 → CALL
  if (!prevPlusDIHigher && currPlusDIHigher) {
    const confidence = Math.min(0.5 + adxResult.adx / 100, 0.85);
    return {
      signal: 'CALL',
      confidence,
      reason: `+DI crossed above -DI (ADX: ${adxResult.adx.toFixed(1)})`,
      indicators,
    };
  }

  // -DI가 +DI를 상향 돌파 → PUT
  if (prevPlusDIHigher && !currPlusDIHigher) {
    const confidence = Math.min(0.5 + adxResult.adx / 100, 0.85);
    return {
      signal: 'PUT',
      confidence,
      reason: `-DI crossed above +DI (ADX: ${adxResult.adx.toFixed(1)})`,
      indicators,
    };
  }

  return { signal: null, confidence: 0, reason: 'No DI crossover', indicators };
}

// ============================================================
// Strategy 2: Trend Pullback Entry
// ============================================================
// 추세 중 조정(풀백) 구간에서 추세 방향으로 진입

export function trendPullbackStrategy(
  candles: Candle[],
  config: Partial<TrendStrategyConfig> = {},
): TrendStrategyResult {
  const cfg = { ...DEFAULT_TREND_CONFIG, ...config };

  if (candles.length < 50) {
    return { signal: null, confidence: 0, reason: 'Insufficient data', indicators: {} };
  }

  const closes = candles.map((c) => c.close);
  const currentPrice = closes[closes.length - 1];

  // ADX로 추세 확인
  const adxResult = calculateADX(candles, cfg.adxPeriod);
  if (!adxResult || adxResult.adx < cfg.adxThreshold) {
    return { signal: null, confidence: 0, reason: 'No trend', indicators: {} };
  }

  // EMA로 추세 방향 확인
  const emaFastArr = EMA.calculate(closes, cfg.emaFast);
  const emaSlowArr = EMA.calculate(closes, cfg.emaSlow);

  if (emaFastArr.length < 2 || emaSlowArr.length < 2) {
    return { signal: null, confidence: 0, reason: 'EMA calculation failed', indicators: {} };
  }

  const emaFast = emaFastArr[emaFastArr.length - 1];
  const emaSlow = emaSlowArr[emaSlowArr.length - 1];

  // RSI로 풀백 확인
  const rsiArr = RSI.calculate(closes, cfg.rsiPeriod);
  if (rsiArr.length < 2) {
    return { signal: null, confidence: 0, reason: 'RSI calculation failed', indicators: {} };
  }

  const currentRSI = rsiArr[rsiArr.length - 1];
  const prevRSI = rsiArr[rsiArr.length - 2];

  const indicators = {
    adx: adxResult.adx,
    plusDI: adxResult.plusDI,
    minusDI: adxResult.minusDI,
    emaFast,
    emaSlow,
    rsi: currentRSI,
    prevRsi: prevRSI,
    price: currentPrice,
  };

  // 상승 추세 + 풀백 후 반등
  const isUptrend = emaFast > emaSlow && adxResult.trend === 'up';
  if (isUptrend) {
    // RSI가 40-55 구간에서 반등 시작
    if (currentRSI >= 35 && currentRSI <= 55 && currentRSI > prevRSI) {
      // 가격이 느린 EMA 근처 또는 위에 있어야 함
      if (currentPrice >= emaSlow * 0.998) {
        const confidence = Math.min(0.55 + adxResult.adx / 200, 0.8);
        return {
          signal: 'CALL',
          confidence,
          reason: `Uptrend pullback: RSI ${currentRSI.toFixed(1)} bouncing`,
          indicators,
        };
      }
    }
  }

  // 하락 추세 + 풀백 후 하락 재개
  const isDowntrend = emaFast < emaSlow && adxResult.trend === 'down';
  if (isDowntrend) {
    // RSI가 45-65 구간에서 하락 시작
    if (currentRSI >= 45 && currentRSI <= 65 && currentRSI < prevRSI) {
      // 가격이 느린 EMA 근처 또는 아래에 있어야 함
      if (currentPrice <= emaSlow * 1.002) {
        const confidence = Math.min(0.55 + adxResult.adx / 200, 0.8);
        return {
          signal: 'PUT',
          confidence,
          reason: `Downtrend pullback: RSI ${currentRSI.toFixed(1)} dropping`,
          indicators,
        };
      }
    }
  }

  return { signal: null, confidence: 0, reason: 'No pullback signal', indicators };
}

// ============================================================
// Strategy 3: MACD Trend Momentum
// ============================================================
// MACD가 추세 방향으로 모멘텀을 보일 때 진입

export function macdTrendMomentumStrategy(
  candles: Candle[],
  config: Partial<TrendStrategyConfig> = {},
): TrendStrategyResult {
  const cfg = { ...DEFAULT_TREND_CONFIG, ...config };

  if (candles.length < 50) {
    return { signal: null, confidence: 0, reason: 'Insufficient data', indicators: {} };
  }

  const closes = candles.map((c) => c.close);

  // ADX로 추세 확인
  const adxResult = calculateADX(candles, cfg.adxPeriod);
  if (!adxResult || adxResult.adx < cfg.adxThreshold) {
    return { signal: null, confidence: 0, reason: 'No trend', indicators: {} };
  }

  // MACD 계산
  const macdArr = MACD.calculate(closes, 12, 26, 9);
  if (macdArr.length < 3) {
    return { signal: null, confidence: 0, reason: 'MACD calculation failed', indicators: {} };
  }

  const currentMACD = macdArr[macdArr.length - 1];
  const prevMACD = macdArr[macdArr.length - 2];
  const prevPrevMACD = macdArr[macdArr.length - 3];

  const indicators = {
    adx: adxResult.adx,
    plusDI: adxResult.plusDI,
    minusDI: adxResult.minusDI,
    macd: currentMACD.macd,
    signal: currentMACD.signal,
    histogram: currentMACD.histogram,
    prevHistogram: prevMACD.histogram,
  };

  // 상승 추세 + MACD 상승 모멘텀
  if (adxResult.trend === 'up') {
    // 히스토그램이 0 위에서 증가하거나, 0선을 상향 돌파
    const histogramIncreasing =
      currentMACD.histogram > prevMACD.histogram && prevMACD.histogram > prevPrevMACD.histogram;
    const zeroCrossUp = prevMACD.histogram <= 0 && currentMACD.histogram > 0;

    if (histogramIncreasing && currentMACD.histogram > 0) {
      const confidence = Math.min(0.55 + adxResult.adx / 200, 0.75);
      return {
        signal: 'CALL',
        confidence,
        reason: `MACD momentum increasing in uptrend`,
        indicators,
      };
    }

    if (zeroCrossUp) {
      const confidence = Math.min(0.6 + adxResult.adx / 200, 0.8);
      return {
        signal: 'CALL',
        confidence,
        reason: `MACD crossed above zero in uptrend`,
        indicators,
      };
    }
  }

  // 하락 추세 + MACD 하락 모멘텀
  if (adxResult.trend === 'down') {
    // 히스토그램이 0 아래에서 감소하거나, 0선을 하향 돌파
    const histogramDecreasing =
      currentMACD.histogram < prevMACD.histogram && prevMACD.histogram < prevPrevMACD.histogram;
    const zeroCrossDown = prevMACD.histogram >= 0 && currentMACD.histogram < 0;

    if (histogramDecreasing && currentMACD.histogram < 0) {
      const confidence = Math.min(0.55 + adxResult.adx / 200, 0.75);
      return {
        signal: 'PUT',
        confidence,
        reason: `MACD momentum decreasing in downtrend`,
        indicators,
      };
    }

    if (zeroCrossDown) {
      const confidence = Math.min(0.6 + adxResult.adx / 200, 0.8);
      return {
        signal: 'PUT',
        confidence,
        reason: `MACD crossed below zero in downtrend`,
        indicators,
      };
    }
  }

  return { signal: null, confidence: 0, reason: 'No MACD momentum signal', indicators };
}

// ============================================================
// Strategy 4: Supertrend Strategy
// ============================================================
// ATR 기반 동적 추세 추종

export function supertrendStrategy(
  candles: Candle[],
  config: Partial<TrendStrategyConfig> = {},
  multiplier: number = 3,
): TrendStrategyResult {
  const cfg = { ...DEFAULT_TREND_CONFIG, ...config };

  if (candles.length < 50) {
    return { signal: null, confidence: 0, reason: 'Insufficient data', indicators: {} };
  }

  const atrPeriod = 10;
  const atr = calculateATR(candles, atrPeriod);
  if (!atr) {
    return { signal: null, confidence: 0, reason: 'ATR calculation failed', indicators: {} };
  }

  // ADX로 추세 확인
  const adxResult = calculateADX(candles, cfg.adxPeriod);
  if (!adxResult || adxResult.adx < cfg.adxThreshold) {
    return { signal: null, confidence: 0, reason: 'No trend', indicators: {} };
  }

  // Supertrend 계산
  const closes = candles.map((c) => c.close);

  // 현재와 이전 캔들의 중간값
  const currentHL2 = (candles[candles.length - 1].high + candles[candles.length - 1].low) / 2;

  // Upper/Lower bands
  const currentUpperBand = currentHL2 + multiplier * atr;
  const currentLowerBand = currentHL2 - multiplier * atr;

  const currentClose = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];

  // 간단한 Supertrend 로직
  const inUptrend = currentClose > currentLowerBand && adxResult.trend === 'up';
  const inDowntrend = currentClose < currentUpperBand && adxResult.trend === 'down';

  const indicators = {
    adx: adxResult.adx,
    plusDI: adxResult.plusDI,
    minusDI: adxResult.minusDI,
    atr,
    upperBand: currentUpperBand,
    lowerBand: currentLowerBand,
    close: currentClose,
  };

  // 상승 추세 + 하단 밴드 위에서 지지
  if (inUptrend) {
    // 가격이 하단 밴드 근처에서 반등
    const nearLowerBand = (currentClose - currentLowerBand) / currentClose < 0.01;
    if (nearLowerBand && currentClose > prevClose) {
      const confidence = Math.min(0.55 + adxResult.adx / 200, 0.75);
      return {
        signal: 'CALL',
        confidence,
        reason: `Supertrend support bounce (ADX: ${adxResult.adx.toFixed(1)})`,
        indicators,
      };
    }
  }

  // 하락 추세 + 상단 밴드 아래에서 저항
  if (inDowntrend) {
    // 가격이 상단 밴드 근처에서 하락
    const nearUpperBand = (currentUpperBand - currentClose) / currentClose < 0.01;
    if (nearUpperBand && currentClose < prevClose) {
      const confidence = Math.min(0.55 + adxResult.adx / 200, 0.75);
      return {
        signal: 'PUT',
        confidence,
        reason: `Supertrend resistance rejection (ADX: ${adxResult.adx.toFixed(1)})`,
        indicators,
      };
    }
  }

  return { signal: null, confidence: 0, reason: 'No supertrend signal', indicators };
}

// ============================================================
// Strategy 5: EMA Ribbon Trend Entry
// ============================================================
// 여러 EMA가 정렬될 때 추세 방향으로 진입

export function emaRibbonStrategy(
  candles: Candle[],
  config: Partial<TrendStrategyConfig> = {},
): TrendStrategyResult {
  const cfg = { ...DEFAULT_TREND_CONFIG, ...config };

  if (candles.length < 60) {
    return { signal: null, confidence: 0, reason: 'Insufficient data', indicators: {} };
  }

  const closes = candles.map((c) => c.close);
  const currentPrice = closes[closes.length - 1];

  // ADX로 추세 확인
  const adxResult = calculateADX(candles, cfg.adxPeriod);
  if (!adxResult || adxResult.adx < cfg.adxThreshold) {
    return { signal: null, confidence: 0, reason: 'No trend', indicators: {} };
  }

  // EMA Ribbon: 8, 13, 21, 34, 55
  const emaPeriods = [8, 13, 21, 34, 55];
  const emaValues: number[] = [];

  for (const period of emaPeriods) {
    const emaArr = EMA.calculate(closes, period);
    if (emaArr.length === 0) {
      return { signal: null, confidence: 0, reason: 'EMA calculation failed', indicators: {} };
    }
    emaValues.push(emaArr[emaArr.length - 1]);
  }

  // 정렬 확인 (bullish: 8 > 13 > 21 > 34 > 55)
  let bullishAlignment = true;
  let bearishAlignment = true;

  for (let i = 0; i < emaValues.length - 1; i++) {
    if (emaValues[i] <= emaValues[i + 1]) bullishAlignment = false;
    if (emaValues[i] >= emaValues[i + 1]) bearishAlignment = false;
  }

  const indicators = {
    adx: adxResult.adx,
    plusDI: adxResult.plusDI,
    minusDI: adxResult.minusDI,
    ema8: emaValues[0],
    ema13: emaValues[1],
    ema21: emaValues[2],
    ema34: emaValues[3],
    ema55: emaValues[4],
    price: currentPrice,
    bullishAlignment: bullishAlignment ? 1 : 0,
    bearishAlignment: bearishAlignment ? 1 : 0,
  };

  // 상승 정렬 + 가격이 EMA 위
  if (bullishAlignment && adxResult.trend === 'up') {
    // 가격이 가장 빠른 EMA 위에서 약간 풀백
    if (currentPrice >= emaValues[0] * 0.998 && currentPrice <= emaValues[0] * 1.005) {
      const confidence = Math.min(0.6 + adxResult.adx / 200, 0.8);
      return {
        signal: 'CALL',
        confidence,
        reason: `EMA ribbon bullish alignment (ADX: ${adxResult.adx.toFixed(1)})`,
        indicators,
      };
    }
  }

  // 하락 정렬 + 가격이 EMA 아래
  if (bearishAlignment && adxResult.trend === 'down') {
    // 가격이 가장 빠른 EMA 아래에서 약간 풀백
    if (currentPrice <= emaValues[0] * 1.002 && currentPrice >= emaValues[0] * 0.995) {
      const confidence = Math.min(0.6 + adxResult.adx / 200, 0.8);
      return {
        signal: 'PUT',
        confidence,
        reason: `EMA ribbon bearish alignment (ADX: ${adxResult.adx.toFixed(1)})`,
        indicators,
      };
    }
  }

  return { signal: null, confidence: 0, reason: 'No EMA ribbon signal', indicators };
}

// ============================================================
// Combined Trend Strategy (Best of All)
// ============================================================

export type TrendStrategyName =
  | 'adx-di-crossover'
  | 'trend-pullback'
  | 'macd-momentum'
  | 'supertrend'
  | 'ema-ribbon';

export function runTrendStrategy(
  strategyName: TrendStrategyName,
  candles: Candle[],
  config: Partial<TrendStrategyConfig> = {},
): TrendStrategyResult {
  switch (strategyName) {
    case 'adx-di-crossover':
      return adxDiCrossoverStrategy(candles, config);
    case 'trend-pullback':
      return trendPullbackStrategy(candles, config);
    case 'macd-momentum':
      return macdTrendMomentumStrategy(candles, config);
    case 'supertrend':
      return supertrendStrategy(candles, config);
    case 'ema-ribbon':
      return emaRibbonStrategy(candles, config);
    default:
      return { signal: null, confidence: 0, reason: 'Unknown strategy', indicators: {} };
  }
}

// ============================================================
// Vote Strategy for Trending Markets
// ============================================================

export function trendVoteStrategy(
  candles: Candle[],
  minVotes: number = 2,
  config: Partial<TrendStrategyConfig> = {},
): TrendStrategyResult {
  const strategies: TrendStrategyName[] = [
    'adx-di-crossover',
    'trend-pullback',
    'macd-momentum',
    'supertrend',
    'ema-ribbon',
  ];

  let callVotes = 0;
  let putVotes = 0;
  const reasons: string[] = [];
  const allIndicators: Record<string, number> = {};
  let maxConfidence = 0;

  for (const name of strategies) {
    const result = runTrendStrategy(name, candles, config);

    if (result.signal === 'CALL') {
      callVotes++;
      reasons.push(`${name}: CALL`);
      maxConfidence = Math.max(maxConfidence, result.confidence);
    } else if (result.signal === 'PUT') {
      putVotes++;
      reasons.push(`${name}: PUT`);
      maxConfidence = Math.max(maxConfidence, result.confidence);
    }

    // 인디케이터 병합
    Object.entries(result.indicators).forEach(([key, value]) => {
      if (typeof value === 'number') {
        allIndicators[`${name}_${key}`] = value;
      }
    });
  }

  allIndicators.callVotes = callVotes;
  allIndicators.putVotes = putVotes;

  if (callVotes >= minVotes && callVotes > putVotes) {
    return {
      signal: 'CALL',
      confidence: maxConfidence * (callVotes / strategies.length),
      reason: `${callVotes}/${strategies.length} trend strategies agree: CALL (${reasons.join(', ')})`,
      indicators: allIndicators,
    };
  }

  if (putVotes >= minVotes && putVotes > callVotes) {
    return {
      signal: 'PUT',
      confidence: maxConfidence * (putVotes / strategies.length),
      reason: `${putVotes}/${strategies.length} trend strategies agree: PUT (${reasons.join(', ')})`,
      indicators: allIndicators,
    };
  }

  return {
    signal: null,
    confidence: 0,
    reason: `No consensus: ${callVotes} CALL, ${putVotes} PUT (need ${minVotes})`,
    indicators: allIndicators,
  };
}

// ============================================================
// Regime-Aware Strategy Selector
// ============================================================
// ADX 값에 따라 최적의 전략 자동 선택

export function selectBestTrendStrategy(
  candles: Candle[],
  config: Partial<TrendStrategyConfig> = {},
): TrendStrategyResult {
  const cfg = { ...DEFAULT_TREND_CONFIG, ...config };

  if (candles.length < 60) {
    return { signal: null, confidence: 0, reason: 'Insufficient data', indicators: {} };
  }

  const adxResult = calculateADX(candles, cfg.adxPeriod);
  if (!adxResult) {
    return { signal: null, confidence: 0, reason: 'ADX calculation failed', indicators: {} };
  }

  // 횡보장 (ADX < 25) - 이 전략은 추세장용이므로 신호 없음
  if (adxResult.adx < cfg.adxThreshold) {
    return {
      signal: null,
      confidence: 0,
      reason: `Market ranging (ADX: ${adxResult.adx.toFixed(1)} < ${cfg.adxThreshold})`,
      indicators: { adx: adxResult.adx },
    };
  }

  // 강한 추세 (ADX >= 40) - DI Crossover, MACD Momentum 우선
  if (adxResult.adx >= cfg.strongTrendThreshold) {
    // DI Crossover 먼저 체크
    const diResult = adxDiCrossoverStrategy(candles, config);
    if (diResult.signal) return diResult;

    // MACD Momentum
    const macdResult = macdTrendMomentumStrategy(candles, config);
    if (macdResult.signal) return macdResult;

    // EMA Ribbon
    const ribbonResult = emaRibbonStrategy(candles, config);
    if (ribbonResult.signal) return ribbonResult;
  }

  // 약한 추세 (ADX 25-40) - Pullback, Supertrend 우선
  const pullbackResult = trendPullbackStrategy(candles, config);
  if (pullbackResult.signal) return pullbackResult;

  const supertrendResult = supertrendStrategy(candles, config);
  if (supertrendResult.signal) return supertrendResult;

  // 최후로 Vote 전략
  return trendVoteStrategy(candles, 2, config);
}
