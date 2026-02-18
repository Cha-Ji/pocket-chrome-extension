// ============================================================
// Train/Validation Split — 시간 순서 기반 데이터 분할
// ============================================================
// 과최적화 방지를 위해 캔들 데이터를 시간 순서를 유지하면서
// train/validation 세트로 분할한다.
// 랜덤 셔플 없음 — 시계열 데이터의 시간 의존성 보존.
// ============================================================

import type { Candle, BacktestResult } from './types';
import { calculateScore, type ScoreInput, type ScoreResult } from './scoring';

// ============================================================
// Types
// ============================================================

/** train/validation 분할 결과 */
export interface TrainValSplit {
  train: Candle[];
  validation: Candle[];
  trainRatio: number;
  splitTimestamp: number;
  trainPeriod: { start: number; end: number };
  valPeriod: { start: number; end: number };
}

/** 단일 전략의 최적화 결과 (train + validation 비교) */
export interface OptimizationEntry {
  strategyId: string;
  strategyName: string;
  bestParams: Record<string, number>;
  train: PerformanceSummary;
  validation: PerformanceSummary;
  overfitScore: number;
}

/** 성능 요약 지표 (leaderboard/scoring과 일관) */
export interface PerformanceSummary {
  totalTrades: number;
  wins: number;
  losses: number;
  ties: number;
  winRate: number;
  netProfit: number;
  netProfitPercent: number;
  profitFactor: number;
  expectancy: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  maxConsecutiveLosses: number;
  sharpeRatio: number | undefined;
  compositeScore: number;
  grade: string;
}

/** 전체 최적화 결과 JSON */
export interface OptimizationOutput {
  generatedAt: string;
  symbol: string;
  dataSource: string;
  totalCandles: number;
  trainRatio: number;
  splitTimestamp: number;
  trainPeriod: { start: number; end: number; candles: number };
  valPeriod: { start: number; end: number; candles: number };
  config: {
    initialBalance: number;
    betAmount: number;
    payout: number;
    expirySeconds: number;
  };
  results: OptimizationEntry[];
}

// ============================================================
// Split Function
// ============================================================

/**
 * 캔들 배열을 시간 순서 기반으로 train/validation으로 분할한다.
 *
 * @param candles 정렬된 캔들 배열 (oldest first)
 * @param trainRatio train 데이터 비율 (0 < ratio < 1, 기본 0.7)
 * @returns TrainValSplit
 * @throws 캔들이 부족하거나 trainRatio가 범위 밖이면 에러
 */
export function splitTrainVal(candles: Candle[], trainRatio = 0.7): TrainValSplit {
  if (trainRatio <= 0 || trainRatio >= 1) {
    throw new Error(`trainRatio must be between 0 and 1 (exclusive), got ${trainRatio}`);
  }

  // 최소 캔들 수 검증 — train/val 각각 최소 50개 필요
  const MIN_CANDLES_PER_SET = 50;
  const minRequired = MIN_CANDLES_PER_SET * 2;
  if (candles.length < minRequired) {
    throw new Error(
      `Not enough candles: ${candles.length} (need at least ${minRequired} for train/val split)`,
    );
  }

  // 시간 순서로 정렬 확인 (이미 정렬되어 있다고 가정하되 검증)
  const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);

  const splitIdx = Math.floor(sorted.length * trainRatio);

  // split 후 각 세트 최소 크기 보장
  const effectiveSplitIdx = Math.max(
    MIN_CANDLES_PER_SET,
    Math.min(splitIdx, sorted.length - MIN_CANDLES_PER_SET),
  );

  const train = sorted.slice(0, effectiveSplitIdx);
  const validation = sorted.slice(effectiveSplitIdx);

  return {
    train,
    validation,
    trainRatio,
    splitTimestamp: train[train.length - 1].timestamp,
    trainPeriod: {
      start: train[0].timestamp,
      end: train[train.length - 1].timestamp,
    },
    valPeriod: {
      start: validation[0].timestamp,
      end: validation[validation.length - 1].timestamp,
    },
  };
}

// ============================================================
// Performance Summary Extraction
// ============================================================

/**
 * BacktestResult에서 PerformanceSummary를 추출한다.
 * scoring.ts의 calculateScore를 사용해 compositeScore/grade를 계산.
 */
export function extractPerformanceSummary(
  result: BacktestResult,
  payout: number,
): PerformanceSummary {
  // 연속 손실 계산
  let maxConsecutiveLosses = 0;
  let currentLosses = 0;
  for (const trade of result.trades) {
    if (trade.result === 'LOSS') {
      currentLosses++;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLosses);
    } else {
      currentLosses = 0;
    }
  }

  const scoreInput: ScoreInput = {
    wins: result.wins,
    losses: result.losses,
    ties: result.ties,
    payoutPercent: payout,
    totalTrades: result.totalTrades,
    maxDrawdownPercent: result.maxDrawdownPercent,
    maxLosingStreak: maxConsecutiveLosses,
    profitFactor: result.profitFactor,
  };

  let scoreResult: ScoreResult;
  try {
    scoreResult = calculateScore(scoreInput);
  } catch {
    scoreResult = {
      score: 0,
      breakdown: {
        winRate: 0,
        expectedValue: 0,
        maxDrawdown: 0,
        maxLosingStreak: 0,
        profitFactor: 0,
        tradeCount: 0,
        consistency: 0,
      },
      expectedValue: 0,
      grade: 'F',
      summary: 'Score calculation failed',
    };
  }

  return {
    totalTrades: result.totalTrades,
    wins: result.wins,
    losses: result.losses,
    ties: result.ties,
    winRate: result.winRate,
    netProfit: result.netProfit,
    netProfitPercent: result.netProfitPercent,
    profitFactor: result.profitFactor,
    expectancy: result.expectancy,
    maxDrawdown: result.maxDrawdown,
    maxDrawdownPercent: result.maxDrawdownPercent,
    maxConsecutiveLosses,
    sharpeRatio: result.sharpeRatio,
    compositeScore: scoreResult.score,
    grade: scoreResult.grade,
  };
}

// ============================================================
// Overfit Score
// ============================================================

/**
 * 과최적화 점수를 계산한다 (0~1, 높을수록 과적합 의심).
 * train과 validation의 주요 지표 차이를 비교.
 *
 * 계산:
 * - winRate 차이 (가중치 0.4)
 * - profitFactor 차이 (가중치 0.3)
 * - maxDrawdown 변화 (가중치 0.3)
 */
export function calculateOverfitScore(
  train: PerformanceSummary,
  val: PerformanceSummary,
): number {
  // 승률 차이 — 10%p 차이면 overfit 1.0
  const wrDiff = Math.abs(train.winRate - val.winRate) / 10;

  // PF 차이 — train PF 대비 val PF가 크게 떨어지면 overfit
  const pfDiff =
    train.profitFactor > 0
      ? Math.max(0, (train.profitFactor - val.profitFactor) / train.profitFactor)
      : 0;

  // MDD 악화 — val에서 MDD가 train보다 크게 증가하면 overfit
  const mddDiff =
    train.maxDrawdownPercent > 0
      ? Math.max(0, (val.maxDrawdownPercent - train.maxDrawdownPercent) / 30)
      : val.maxDrawdownPercent > 0
        ? 0.5
        : 0;

  return Math.min(1, wrDiff * 0.4 + pfDiff * 0.3 + mddDiff * 0.3);
}
