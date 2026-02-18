// ============================================================
// Strategy Config - Leaderboard 기반 심볼별 전략 설정
// ============================================================
// leaderboard 결과에서 심볼별 상위 전략을 추출하여
// SignalGeneratorV2에 주입하는 설정 타입 및 유틸리티
// ============================================================

import type { LeaderboardEntry, LeaderboardResult } from '../backtest/leaderboard-types';

// ============================================================
// Types
// ============================================================

/** 심볼별 전략 설정 */
export interface SymbolStrategyConfig {
  /** 우선순위 순서의 전략 ID 목록 (최대 3개) */
  strategies: string[];
  /** 전략별 파라미터. 키는 strategyId */
  params: Record<string, Record<string, number>>;
}

/** 전체 전략 설정 (심볼 → 설정 매핑) */
export type StrategyConfigMap = Record<string, SymbolStrategyConfig>;

/** strategy-config.json 파일의 루트 구조 */
export interface StrategyConfigFile {
  /** 생성 시각 (ISO 8601) */
  generatedAt: string;
  /** 데이터 소스 (demo, real, unknown) */
  dataSource: 'demo' | 'real' | 'unknown';
  /** 심볼별 전략 설정 */
  symbols: StrategyConfigMap;
}

// ============================================================
// Extraction Logic
// ============================================================

export interface ExtractOptions {
  /** 심볼별 추출할 최대 전략 수 (기본 3) */
  topN?: number;
  /** 최소 거래 횟수 필터 (기본 0, 이미 leaderboard에서 필터링됨) */
  minTrades?: number;
  /** 데이터 소스 라벨 */
  dataSource?: 'demo' | 'real' | 'unknown';
}

/**
 * LeaderboardResult에서 심볼별 상위 N개 전략을 추출한다.
 *
 * LeaderboardResult는 단일 심볼 백테스트 결과이므로,
 * config.symbol을 키로 사용한다.
 */
export function extractStrategyConfig(
  result: LeaderboardResult,
  options: ExtractOptions = {},
): StrategyConfigFile {
  const { topN = 3, minTrades = 0, dataSource = 'unknown' } = options;

  const symbol = result.config.symbol;
  const entries = filterAndSort(result.entries, minTrades);
  const topEntries = entries.slice(0, topN);

  const symbolConfig = buildSymbolConfig(topEntries);

  return {
    generatedAt: new Date().toISOString(),
    dataSource,
    symbols: symbol && topEntries.length > 0 ? { [symbol]: symbolConfig } : {},
  };
}

/**
 * 여러 LeaderboardResult를 병합하여 멀티 심볼 config를 생성한다.
 */
export function extractMultiSymbolConfig(
  results: LeaderboardResult[],
  options: ExtractOptions = {},
): StrategyConfigFile {
  const { topN = 3, minTrades = 0, dataSource = 'unknown' } = options;
  const symbols: StrategyConfigMap = {};

  for (const result of results) {
    const symbol = result.config.symbol;
    if (!symbol) continue;
    // 같은 심볼이 이미 있으면 건너뜀 (호출자가 정렬 순서를 결정)
    if (symbols[symbol]) continue;

    const entries = filterAndSort(result.entries, minTrades);
    const topEntries = entries.slice(0, topN);

    if (topEntries.length > 0) {
      symbols[symbol] = buildSymbolConfig(topEntries);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    dataSource,
    symbols,
  };
}

/**
 * LeaderboardEntry 배열(raw JSON)에서 직접 config를 추출한다.
 * 스크립트에서 사용: leaderboard JSON 파일을 직접 파싱할 때.
 */
export function extractFromEntries(
  entries: LeaderboardEntry[],
  symbol: string,
  options: ExtractOptions = {},
): StrategyConfigFile {
  const { topN = 3, minTrades = 0, dataSource = 'unknown' } = options;

  const filtered = filterAndSort(entries, minTrades);
  const topEntries = filtered.slice(0, topN);
  const symbolConfig = buildSymbolConfig(topEntries);

  return {
    generatedAt: new Date().toISOString(),
    dataSource,
    symbols: topEntries.length > 0 ? { [symbol]: symbolConfig } : {},
  };
}

// ============================================================
// Internal Helpers
// ============================================================

function filterAndSort(entries: LeaderboardEntry[], minTrades: number): LeaderboardEntry[] {
  return entries
    .filter((e) => e.totalTrades >= minTrades)
    .sort((a, b) => {
      // rank가 이미 매겨져 있으면 rank 우선, 없으면 compositeScore 내림차순
      if (a.rank > 0 && b.rank > 0) return a.rank - b.rank;
      return b.compositeScore - a.compositeScore;
    });
}

function buildSymbolConfig(entries: LeaderboardEntry[]): SymbolStrategyConfig {
  const strategies: string[] = [];
  const params: Record<string, Record<string, number>> = {};

  for (const entry of entries) {
    strategies.push(entry.strategyId);
    if (entry.params && Object.keys(entry.params).length > 0) {
      params[entry.strategyId] = { ...entry.params };
    }
  }

  return { strategies, params };
}
