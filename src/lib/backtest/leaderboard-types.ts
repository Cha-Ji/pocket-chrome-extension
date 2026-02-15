// ============================================================
// Backtest Leaderboard Types
// ============================================================
// 전략 간 비교/랭킹을 위한 리더보드 타입 정의
// ============================================================

import type { ScoreGrade } from './scoring';

/** 리더보드 엔트리: 전략 하나의 백테스트 결과 요약 */
export interface LeaderboardEntry {
  id?: number;

  // 전략 식별
  strategyId: string;
  strategyName: string;
  params: Record<string, number>;

  // 기본 통계
  totalTrades: number;
  wins: number;
  losses: number;
  ties: number;
  winRate: number; // % (e.g., 55.3)
  netProfit: number; // $ 순이익
  netProfitPercent: number; // % 수익률
  profitFactor: number; // 총이익/총손실
  expectancy: number; // 거래당 기대수익 $

  // 리스크 지표
  maxDrawdown: number; // MDD $
  maxDrawdownPercent: number; // MDD %
  maxConsecutiveLosses: number; // 최대 연속 손실
  maxConsecutiveWins: number; // 최대 연속 승리
  recoveryFactor: number; // 순이익 / MDD
  sharpeRatio: number;
  sortinoRatio: number;

  // 일일 거래량 지표
  tradingDays: number; // 총 거래일수
  tradesPerDay: number; // 일 평균 거래 횟수
  dailyVolume: number; // 일 평균 거래금액 $
  totalVolume: number; // 전체 거래금액 $

  // 거래량 목표 (입금액 대비 거래량 달성 소요일)
  daysToVolumeTarget: number | null; // 입금액의 volumeMultiplier배 거래량 달성 예상일

  // 안정성 지표
  winRateStdDev: number; // 주별 승률 표준편차
  kellyFraction: number; // Kelly Criterion 최적 배팅 비율 %
  minRequiredBalance: number; // MDD 기반 최소 필요 자금

  // 종합 점수
  compositeScore: number; // 0-100 종합 점수 (상대 비교)
  rank: number; // 순위
  absoluteScore?: number; // 0-100 절대 점수 (scoring.ts)
  grade?: ScoreGrade; // A-F 등급 (scoring.ts)

  // 백테스트 메타
  dataRange: { start: number; end: number };
  candleCount: number;
  betAmount: number;
  payout: number;
  expirySeconds: number;
  createdAt: number;
}

/** 리더보드 실행 설정 */
export interface LeaderboardConfig {
  // 공통 백테스트 설정
  symbol: string;
  startTime: number;
  endTime: number;
  initialBalance: number;
  betAmount: number;
  betType: 'fixed' | 'percentage';
  payout: number; // e.g., 92
  expirySeconds: number;

  // 거래량 목표 계산용
  volumeMultiplier: number; // 입금액의 N배 (기본 100)

  // 종합 점수 가중치 (합계 = 1.0)
  weights?: LeaderboardWeights;

  // 필터
  minTrades?: number; // 최소 거래 횟수 (기본 30)
  minWinRate?: number; // 최소 승률 필터 (기본 0)
}

/**
 * 종합 점수 가중치 (상대 비교 방식).
 *
 * NOTE: 이 가중치는 리더보드의 **상대 비교**(min-max normalization)에 사용된다.
 * 절대 평가용 scoring.ts의 ScoreWeights(7-factor: winRate, EV, MDD, losingStreak,
 * profitFactor, tradeCount, consistency)와는 별도의 시스템이다.
 * 절대 점수(Grade A-F)는 scoring.ts의 calculateScore()를 사용하라.
 */
export interface LeaderboardWeights {
  winRate: number; // 승률 (기본 0.30)
  profitFactor: number; // 이익팩터 (기본 0.20)
  maxDrawdown: number; // MDD 역점수 (기본 0.15)
  maxConsecutiveLosses: number; // 연속손실 역점수 (기본 0.10)
  tradesPerDay: number; // 일거래횟수 (기본 0.10)
  recoveryFactor: number; // 회복팩터 (기본 0.15)
}

/** 리더보드 실행 진행 상황 */
export interface LeaderboardProgress {
  total: number; // 전체 전략 수
  completed: number; // 완료된 전략 수
  currentStrategy: string; // 현재 실행 중인 전략명
  status: 'idle' | 'running' | 'complete' | 'error';
  error?: string;
}

/** 리더보드 실행 결과 */
export interface LeaderboardResult {
  entries: LeaderboardEntry[];
  config: LeaderboardConfig;
  executedAt: number;
  totalStrategies: number;
  filteredOut: number; // 필터에 의해 제외된 전략 수
  executionTimeMs: number;
}

/** 정렬 기준 */
export type LeaderboardSortKey =
  | 'compositeScore'
  | 'winRate'
  | 'netProfit'
  | 'profitFactor'
  | 'tradesPerDay'
  | 'maxDrawdownPercent'
  | 'maxConsecutiveLosses'
  | 'dailyVolume'
  | 'daysToVolumeTarget'
  | 'sharpeRatio'
  | 'recoveryFactor'
  | 'kellyFraction';

export const DEFAULT_WEIGHTS: LeaderboardWeights = {
  winRate: 0.3,
  profitFactor: 0.2,
  maxDrawdown: 0.15,
  maxConsecutiveLosses: 0.1,
  tradesPerDay: 0.1,
  recoveryFactor: 0.15,
};
