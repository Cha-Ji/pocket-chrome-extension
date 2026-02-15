// ============================================================
// Backtest Leaderboard Engine
// ============================================================
// 모든 전략을 일괄 백테스트하고 비교/랭킹하는 엔진
// ============================================================

import { Candle, BacktestConfig, BacktestResult, Strategy } from './types'
import { getBacktestEngine } from './engine'
import { calculateDetailedStatistics } from './statistics'
import { calculateScore } from './scoring'
import {
  LeaderboardEntry,
  LeaderboardConfig,
  LeaderboardWeights,
  LeaderboardProgress,
  LeaderboardResult,
  DEFAULT_WEIGHTS,
} from './leaderboard-types'

// ============================================================
// Batch Runner - 모든 전략 일괄 백테스트
// ============================================================

/**
 * 등록된 모든 전략을 백테스트하고 리더보드를 생성한다.
 *
 * @param candles 백테스트에 사용할 캔들 데이터 (oldest first)
 * @param config 리더보드 설정
 * @param onProgress 진행 상황 콜백 (optional)
 * @returns 정렬된 리더보드 결과
 */
export function runLeaderboard(
  candles: Candle[],
  config: LeaderboardConfig,
  onProgress?: (progress: LeaderboardProgress) => void
): LeaderboardResult {
  const startTs = Date.now()
  const engine = getBacktestEngine()
  const strategies = engine.getStrategies()
  const weights = config.weights ?? DEFAULT_WEIGHTS
  const minTrades = config.minTrades ?? 30

  const entries: LeaderboardEntry[] = []
  let filteredOut = 0

  for (let i = 0; i < strategies.length; i++) {
    const strategy = strategies[i]

    onProgress?.({
      total: strategies.length,
      completed: i,
      currentStrategy: strategy.name,
      status: 'running',
    })

    try {
      // 기본 파라미터로 백테스트 실행
      const defaultParams: Record<string, number> = {}
      for (const [key, def] of Object.entries(strategy.params)) {
        defaultParams[key] = def.default
      }

      const btConfig: BacktestConfig = {
        symbol: config.symbol,
        startTime: config.startTime,
        endTime: config.endTime,
        initialBalance: config.initialBalance,
        betAmount: config.betAmount,
        betType: config.betType,
        payout: config.payout,
        expirySeconds: config.expirySeconds,
        strategyId: strategy.id,
        strategyParams: defaultParams,
      }

      const result = engine.run(btConfig, candles)

      // 최소 거래 횟수 필터
      if (result.totalTrades < minTrades) {
        filteredOut++
        continue
      }

      // 최소 승률 필터
      if (config.minWinRate && result.winRate < config.minWinRate) {
        filteredOut++
        continue
      }

      const entry = buildLeaderboardEntry(result, strategy, config)
      entries.push(entry)
    } catch {
      // 전략 실행 실패 시 건너뜀
      filteredOut++
    }
  }

  // 종합 점수 계산 및 랭킹
  scoreAndRankEntries(entries, weights)

  onProgress?.({
    total: strategies.length,
    completed: strategies.length,
    currentStrategy: '',
    status: 'complete',
  })

  return {
    entries,
    config,
    executedAt: Date.now(),
    totalStrategies: strategies.length,
    filteredOut,
    executionTimeMs: Date.now() - startTs,
  }
}

// ============================================================
// Entry Builder - 백테스트 결과 → 리더보드 엔트리 변환
// ============================================================

function buildLeaderboardEntry(
  result: BacktestResult,
  strategy: Strategy,
  config: LeaderboardConfig
): LeaderboardEntry {
  const stats = calculateDetailedStatistics(
    result.trades,
    config.initialBalance
  )

  // 거래일수 계산
  const tradeDateSet = new Set<string>()
  for (const trade of result.trades) {
    const d = new Date(trade.entryTime)
    tradeDateSet.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
  }
  const tradingDays = Math.max(tradeDateSet.size, 1)

  // 일일 거래 지표
  const tradesPerDay = result.totalTrades / tradingDays
  const betAmount = config.betType === 'fixed'
    ? config.betAmount
    : config.initialBalance * (config.betAmount / 100)
  const totalVolume = result.totalTrades * betAmount
  const dailyVolume = totalVolume / tradingDays

  // 거래량 목표 달성 소요일
  const volumeTarget = config.initialBalance * config.volumeMultiplier
  const daysToVolumeTarget = dailyVolume > 0
    ? Math.ceil(volumeTarget / dailyVolume)
    : null

  // 주별 승률 표준편차 (안정성 지표)
  const winRateStdDev = calculateWeeklyWinRateStdDev(result)

  // Kelly Criterion: f* = (p * b - q) / b
  // p = 승률, q = 패률, b = 페이아웃 비율
  const p = stats.winRate / 100
  const q = 1 - p
  const b = config.payout / 100
  const kellyRaw = p > 0 && b > 0 ? (p * b - q) / b : 0
  const kellyFraction = Math.max(0, kellyRaw * 100) // % 단위

  // 최소 필요 자금: MDD의 3배 (안전 마진)
  const minRequiredBalance = stats.maxDrawdown * 3

  return {
    strategyId: strategy.id,
    strategyName: strategy.name,
    params: result.config.strategyParams,

    totalTrades: result.totalTrades,
    wins: result.wins,
    losses: result.losses,
    ties: result.ties,
    winRate: stats.winRate,
    netProfit: stats.netProfit,
    netProfitPercent: stats.netProfitPercent,
    profitFactor: stats.profitFactor,
    expectancy: stats.expectancy,

    maxDrawdown: stats.maxDrawdown,
    maxDrawdownPercent: stats.maxDrawdownPercent,
    maxConsecutiveLosses: stats.maxConsecutiveLosses,
    maxConsecutiveWins: stats.maxConsecutiveWins,
    recoveryFactor: stats.recoveryFactor,
    sharpeRatio: stats.sharpeRatio,
    sortinoRatio: stats.sortinoRatio,

    tradingDays,
    tradesPerDay,
    dailyVolume,
    totalVolume,
    daysToVolumeTarget,

    winRateStdDev,
    kellyFraction,
    minRequiredBalance,

    compositeScore: 0, // 이후 scoreAndRankEntries에서 계산
    rank: 0,

    // P2-2: 절대 점수 (scoring.ts calculateScore)
    ...(() => {
      const scoreResult = calculateScore({
        wins: result.wins,
        losses: result.losses,
        ties: result.ties,
        payoutPercent: config.payout,
        totalTrades: result.totalTrades,
        maxDrawdownPercent: stats.maxDrawdownPercent,
        maxLosingStreak: stats.maxConsecutiveLosses,
        profitFactor: stats.profitFactor,
        winRateStdDev,
      })
      return { absoluteScore: scoreResult.score, grade: scoreResult.grade }
    })(),

    dataRange: { start: result.startTime, end: result.endTime },
    candleCount: result.trades.length > 0
      ? Math.round((result.endTime - result.startTime) / (config.expirySeconds * 1000))
      : 0,
    betAmount,
    payout: config.payout,
    expirySeconds: config.expirySeconds,
    createdAt: Date.now(),
  }
}

// ============================================================
// Scoring & Ranking
// ============================================================

/**
 * 모든 엔트리의 종합 점수를 계산하고 순위를 매긴다.
 * 각 지표를 0-100으로 정규화한 뒤 가중합으로 종합 점수를 산출.
 */
export function scoreAndRankEntries(
  entries: LeaderboardEntry[],
  weights: LeaderboardWeights = DEFAULT_WEIGHTS
): void {
  if (entries.length === 0) return

  // 각 지표의 min/max 수집
  const ranges = {
    winRate: getRange(entries, e => e.winRate),
    profitFactor: getRange(entries, e => clampProfitFactor(e.profitFactor)),
    maxDrawdownPercent: getRange(entries, e => e.maxDrawdownPercent),
    maxConsecutiveLosses: getRange(entries, e => e.maxConsecutiveLosses),
    tradesPerDay: getRange(entries, e => e.tradesPerDay),
    recoveryFactor: getRange(entries, e => clampRecoveryFactor(e.recoveryFactor)),
  }

  for (const entry of entries) {
    // 정방향 지표 (높을수록 좋음): 0-100 정규화
    const winRateScore = normalize(entry.winRate, ranges.winRate)
    const pfScore = normalize(clampProfitFactor(entry.profitFactor), ranges.profitFactor)
    const tpdScore = normalize(entry.tradesPerDay, ranges.tradesPerDay)
    const rfScore = normalize(clampRecoveryFactor(entry.recoveryFactor), ranges.recoveryFactor)

    // 역방향 지표 (낮을수록 좋음): 100 - 정규화값
    const mddScore = 100 - normalize(entry.maxDrawdownPercent, ranges.maxDrawdownPercent)
    const mclScore = 100 - normalize(entry.maxConsecutiveLosses, ranges.maxConsecutiveLosses)

    entry.compositeScore =
      winRateScore * weights.winRate +
      pfScore * weights.profitFactor +
      mddScore * weights.maxDrawdown +
      mclScore * weights.maxConsecutiveLosses +
      tpdScore * weights.tradesPerDay +
      rfScore * weights.recoveryFactor
  }

  // 종합 점수 기준 정렬
  entries.sort((a, b) => b.compositeScore - a.compositeScore)

  // 순위 부여
  for (let i = 0; i < entries.length; i++) {
    entries[i].rank = i + 1
  }
}

// ============================================================
// 주별 승률 표준편차 계산
// ============================================================

function calculateWeeklyWinRateStdDev(result: BacktestResult): number {
  if (result.trades.length === 0) return 0

  // 주 단위로 거래를 그룹화
  const weekMap = new Map<string, { wins: number; total: number }>()

  for (const trade of result.trades) {
    const d = new Date(trade.entryTime)
    // ISO 주 기반 키
    const year = d.getFullYear()
    const weekStart = new Date(d)
    weekStart.setDate(d.getDate() - d.getDay())
    const key = `${year}-${weekStart.getMonth()}-${weekStart.getDate()}`

    const week = weekMap.get(key) ?? { wins: 0, total: 0 }
    week.total++
    if (trade.result === 'WIN') week.wins++
    weekMap.set(key, week)
  }

  // 주별 승률 배열
  const weeklyRates: number[] = []
  for (const week of weekMap.values()) {
    if (week.total >= 5) { // 최소 5거래 이상인 주만 포함
      weeklyRates.push((week.wins / week.total) * 100)
    }
  }

  if (weeklyRates.length < 2) return 0

  const mean = weeklyRates.reduce((a, b) => a + b, 0) / weeklyRates.length
  const variance = weeklyRates.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / weeklyRates.length
  return Math.sqrt(variance)
}

// ============================================================
// Helper Functions
// ============================================================

function getRange(entries: LeaderboardEntry[], getter: (e: LeaderboardEntry) => number): { min: number; max: number } {
  let min = Infinity
  let max = -Infinity
  for (const e of entries) {
    const v = getter(e)
    if (v < min) min = v
    if (v > max) max = v
  }
  return { min, max }
}

function normalize(value: number, range: { min: number; max: number }): number {
  if (range.max === range.min) return 50 // 모든 값이 같으면 중간값
  return ((value - range.min) / (range.max - range.min)) * 100
}

/** Infinity 방지를 위한 profitFactor 클램핑 */
function clampProfitFactor(pf: number): number {
  if (!isFinite(pf)) return 10
  return Math.min(pf, 10)
}

/** Infinity 방지를 위한 recoveryFactor 클램핑 */
function clampRecoveryFactor(rf: number): number {
  if (!isFinite(rf)) return 50
  return Math.min(rf, 50)
}

// ============================================================
// Utility: 리더보드 텍스트 리포트
// ============================================================

export function formatLeaderboardReport(result: LeaderboardResult): string {
  const lines: string[] = [
    '════════════════════════════════════════════════════════════════',
    '                    BACKTEST LEADERBOARD                       ',
    '════════════════════════════════════════════════════════════════',
    `  Strategies: ${result.totalStrategies} total, ${result.entries.length} ranked, ${result.filteredOut} filtered`,
    `  Data: ${new Date(result.config.startTime).toLocaleDateString()} ~ ${new Date(result.config.endTime).toLocaleDateString()}`,
    `  Payout: ${result.config.payout}% | Bet: $${result.config.betAmount} | Expiry: ${result.config.expirySeconds}s`,
    `  Volume Target: ${result.config.volumeMultiplier}x deposit`,
    `  Execution: ${result.executionTimeMs}ms`,
    '════════════════════════════════════════════════════════════════',
    '',
  ]

  for (const entry of result.entries) {
    const profitable = entry.winRate >= 52.1 ? '+' : '-'
    const volumeDays = entry.daysToVolumeTarget !== null
      ? `${entry.daysToVolumeTarget}d`
      : 'N/A'

    const gradeStr = entry.grade ? ` [${entry.grade}]` : ''
    lines.push(
      `#${entry.rank} [${profitable}] ${entry.strategyName}${gradeStr}`,
      `   Score: ${entry.compositeScore.toFixed(1)} (abs: ${entry.absoluteScore?.toFixed(1) ?? '-'}) | WR: ${entry.winRate.toFixed(1)}% | PF: ${entry.profitFactor.toFixed(2)} | Net: $${entry.netProfit.toFixed(2)}`,
      `   MDD: ${entry.maxDrawdownPercent.toFixed(1)}% | MaxLoss: ${entry.maxConsecutiveLosses}x | Trades/Day: ${entry.tradesPerDay.toFixed(1)}`,
      `   Daily Vol: $${entry.dailyVolume.toFixed(0)} | Vol Target: ${volumeDays} | Kelly: ${entry.kellyFraction.toFixed(1)}%`,
      `   Min Balance: $${entry.minRequiredBalance.toFixed(0)} | Stability: ±${entry.winRateStdDev.toFixed(1)}%`,
      '────────────────────────────────────────────────────────────────',
    )
  }

  return lines.join('\n')
}
