// ============================================================
// Backtest Scoring System
// ============================================================
// 전략 평가를 위한 종합 점수(0-100) 계산 모듈.
// 가중치 기반으로 승률, 리스크, 안정성 등을 평가.
// ============================================================

// ============================================================
// Scoring Weights (상수 분리)
// ============================================================

/** 기본 평가 가중치 — 합계 = 1.0 */
export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  winRate: 0.30,           // 승률 (핵심 — 52.1% 이상이어야 수익)
  expectedValue: 0.20,     // 기대값 (EV > 0 필수)
  maxDrawdown: 0.15,       // 최대 드로다운 (낮을수록 좋음)
  maxLosingStreak: 0.10,   // 최대 연속 손실 (낮을수록 좋음)
  profitFactor: 0.10,      // 이익 팩터 (높을수록 좋음)
  tradeCount: 0.10,        // 거래 횟수 (충분한 표본)
  consistency: 0.05,       // 안정성 (주별 승률 변동)
}

/**
 * 안정형 프로필: 드로다운/연속손실/안정성 중심.
 * 작은 계좌 또는 리스크 민감한 트레이더에 적합.
 */
export const STABILITY_WEIGHTS: ScoreWeights = {
  winRate: 0.20,
  expectedValue: 0.15,
  maxDrawdown: 0.25,        // ↑ 드로다운 비중 상승
  maxLosingStreak: 0.15,    // ↑ 연속손실 비중 상승
  profitFactor: 0.10,
  tradeCount: 0.05,
  consistency: 0.10,        // ↑ 안정성 비중 상승
}

/**
 * 성장형 프로필: EV/이익팩터/거래횟수 중심.
 * 충분한 자금이 있고 거래량 목표를 빠르게 달성하려는 트레이더에 적합.
 */
export const GROWTH_WEIGHTS: ScoreWeights = {
  winRate: 0.25,
  expectedValue: 0.25,      // ↑ EV 비중 상승
  maxDrawdown: 0.10,
  maxLosingStreak: 0.05,
  profitFactor: 0.15,       // ↑ 이익팩터 비중 상승
  tradeCount: 0.15,         // ↑ 거래횟수 비중 상승
  consistency: 0.05,
}

/** Named scoring profiles */
export type ScoringProfile = 'default' | 'stability' | 'growth'

/** Get weights by profile name */
export function getWeightsByProfile(profile: ScoringProfile): ScoreWeights {
  switch (profile) {
    case 'stability': return STABILITY_WEIGHTS
    case 'growth': return GROWTH_WEIGHTS
    default: return DEFAULT_SCORE_WEIGHTS
  }
}

/** 바이너리 옵션 기준 임계값 */
export const SCORING_THRESHOLDS = {
  /** 52.1%: 92% 페이아웃에서 손익분기 승률 */
  breakEvenWinRate: 52.1,
  /** 최소 거래 횟수 (통계 유의성) */
  minTradesForSignificance: 30,
  /** 우수 거래 횟수 */
  excellentTradeCount: 200,
  /** 최대 허용 드로다운 % */
  maxAcceptableDrawdown: 30,
  /** 최대 허용 연속 손실 */
  maxAcceptableLosingStreak: 10,
  /** 우수 이익 팩터 */
  excellentProfitFactor: 3.0,
} as const

// ============================================================
// Types
// ============================================================

export interface ScoreWeights {
  winRate: number
  expectedValue: number
  maxDrawdown: number
  maxLosingStreak: number
  profitFactor: number
  tradeCount: number
  consistency: number
}

/** 점수 계산 입력 */
export interface ScoreInput {
  wins: number
  losses: number
  ties: number
  payoutPercent: number        // 평균 페이아웃 (e.g., 92)
  totalTrades: number
  maxDrawdownPercent: number
  maxLosingStreak: number
  profitFactor: number
  winRateStdDev?: number       // 주별 승률 표준편차 (optional)
}

/** 점수 계산 결과 */
export interface ScoreResult {
  /** 종합 점수 0-100 */
  score: number
  /** 각 항목별 점수 0-100 */
  breakdown: ScoreBreakdown
  /** 기대값 (거래당 수익률) */
  expectedValue: number
  /** A~F 등급 */
  grade: ScoreGrade
  /** 사람이 읽을 수 있는 요약 */
  summary: string
}

export interface ScoreBreakdown {
  winRate: number
  expectedValue: number
  maxDrawdown: number
  maxLosingStreak: number
  profitFactor: number
  tradeCount: number
  consistency: number
}

export type ScoreGrade = 'A' | 'B' | 'C' | 'D' | 'F'

// ============================================================
// Core Scoring Function
// ============================================================

/**
 * 전략의 종합 점수를 계산한다.
 *
 * @param input 전략 통계 데이터
 * @param weights 가중치 (기본: DEFAULT_SCORE_WEIGHTS)
 * @returns ScoreResult (0-100 점수, breakdown, grade)
 */
export function calculateScore(
  input: ScoreInput,
  weights: ScoreWeights = DEFAULT_SCORE_WEIGHTS,
): ScoreResult {
  const decided = input.wins + input.losses
  const winRate = decided > 0 ? (input.wins / decided) * 100 : 0

  // EV = winRate * payout - lossRate * 1.0
  // When no decided trades, EV = 0 (undefined, not negative)
  const p = winRate / 100
  const q = 1 - p
  const b = input.payoutPercent / 100
  const expectedValue = decided > 0 ? p * b - q : 0

  // --- Individual scores (0-100) ---
  const breakdown: ScoreBreakdown = {
    winRate: scoreWinRate(winRate, input.payoutPercent),
    expectedValue: scoreExpectedValue(expectedValue),
    maxDrawdown: scoreMaxDrawdown(input.maxDrawdownPercent),
    maxLosingStreak: scoreMaxLosingStreak(input.maxLosingStreak),
    profitFactor: scoreProfitFactor(input.profitFactor),
    tradeCount: scoreTradeCount(input.totalTrades),
    consistency: scoreConsistency(input.winRateStdDev ?? 0),
  }

  // --- Weighted composite ---
  const score = clamp(
    breakdown.winRate * weights.winRate +
    breakdown.expectedValue * weights.expectedValue +
    breakdown.maxDrawdown * weights.maxDrawdown +
    breakdown.maxLosingStreak * weights.maxLosingStreak +
    breakdown.profitFactor * weights.profitFactor +
    breakdown.tradeCount * weights.tradeCount +
    breakdown.consistency * weights.consistency,
    0,
    100,
  )

  const grade = toGrade(score)
  const summary = buildSummary(score, grade, winRate, expectedValue, input)

  return { score, breakdown, expectedValue, grade, summary }
}

// ============================================================
// Individual Scoring Functions (0-100)
// ============================================================

/**
 * 승률 점수: 52.1% = 50점 기준 (손익분기).
 * 50% 이하 = 0~20, 52.1% = 50, 60%+ = 90~100
 */
function scoreWinRate(winRate: number, payoutPercent: number): number {
  // Break-even win rate for this payout
  const breakEven = 100 / (100 + payoutPercent) * 100
  if (winRate <= breakEven - 5) return 0
  if (winRate <= breakEven) {
    // Linear 0-50 from (breakEven-5) to breakEven
    return ((winRate - (breakEven - 5)) / 5) * 50
  }
  // Above break-even: 50 → 100
  // 60% ≈ 90, 65%+ ≈ 100
  const above = winRate - breakEven
  return Math.min(50 + above * (50 / 10), 100)
}

/**
 * 기대값 점수: EV <= 0 = 0~20, EV = 0.02 = 50, EV > 0.10 = 100
 */
function scoreExpectedValue(ev: number): number {
  if (ev <= -0.05) return 0
  if (ev <= 0) return linearMap(ev, -0.05, 0, 0, 20)
  if (ev <= 0.02) return linearMap(ev, 0, 0.02, 20, 50)
  if (ev <= 0.10) return linearMap(ev, 0.02, 0.10, 50, 100)
  return 100
}

/**
 * 드로다운 점수: 0% = 100, 30%+ = 0
 */
function scoreMaxDrawdown(mddPercent: number): number {
  if (mddPercent <= 0) return 100
  if (mddPercent >= SCORING_THRESHOLDS.maxAcceptableDrawdown) return 0
  return linearMap(mddPercent, 0, SCORING_THRESHOLDS.maxAcceptableDrawdown, 100, 0)
}

/**
 * 연속 손실 점수: 0 = 100, 10+ = 0
 */
function scoreMaxLosingStreak(streak: number): number {
  if (streak <= 0) return 100
  if (streak >= SCORING_THRESHOLDS.maxAcceptableLosingStreak) return 0
  return linearMap(streak, 0, SCORING_THRESHOLDS.maxAcceptableLosingStreak, 100, 0)
}

/**
 * 이익 팩터 점수: < 1.0 = 0~30, 1.0 = 30, 1.5 = 60, 3.0+ = 100
 */
function scoreProfitFactor(pf: number): number {
  if (!isFinite(pf)) pf = SCORING_THRESHOLDS.excellentProfitFactor
  if (pf <= 0) return 0
  if (pf < 1.0) return linearMap(pf, 0, 1.0, 0, 30)
  if (pf < 1.5) return linearMap(pf, 1.0, 1.5, 30, 60)
  if (pf < SCORING_THRESHOLDS.excellentProfitFactor) {
    return linearMap(pf, 1.5, SCORING_THRESHOLDS.excellentProfitFactor, 60, 100)
  }
  return 100
}

/**
 * 거래 횟수 점수: < 30 = 0~30, 30 = 30, 200+ = 100
 */
function scoreTradeCount(count: number): number {
  if (count <= 0) return 0
  if (count < SCORING_THRESHOLDS.minTradesForSignificance) {
    return linearMap(count, 0, SCORING_THRESHOLDS.minTradesForSignificance, 0, 30)
  }
  if (count < SCORING_THRESHOLDS.excellentTradeCount) {
    return linearMap(count, SCORING_THRESHOLDS.minTradesForSignificance, SCORING_THRESHOLDS.excellentTradeCount, 30, 100)
  }
  return 100
}

/**
 * 안정성 점수 (주별 승률 표준편차 기반): 0 = 100, 15+ = 0
 */
function scoreConsistency(winRateStdDev: number): number {
  if (winRateStdDev <= 0) return 100
  if (winRateStdDev >= 15) return 0
  return linearMap(winRateStdDev, 0, 15, 100, 0)
}

// ============================================================
// Helpers
// ============================================================

function linearMap(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  if (inMax === inMin) return outMin
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function toGrade(score: number): ScoreGrade {
  if (score >= 80) return 'A'
  if (score >= 60) return 'B'
  if (score >= 40) return 'C'
  if (score >= 20) return 'D'
  return 'F'
}

function buildSummary(score: number, grade: ScoreGrade, winRate: number, ev: number, input: ScoreInput): string {
  const parts: string[] = [
    `Grade ${grade} (${score.toFixed(1)}/100)`,
    `WR: ${winRate.toFixed(1)}%`,
    `EV: ${(ev * 100).toFixed(2)}%/trade`,
    `PF: ${input.profitFactor.toFixed(2)}`,
    `MDD: ${input.maxDrawdownPercent.toFixed(1)}%`,
    `MaxLoss: ${input.maxLosingStreak}x`,
    `Trades: ${input.totalTrades}`,
  ]
  return parts.join(' | ')
}
