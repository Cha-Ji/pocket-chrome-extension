#!/usr/bin/env npx tsx
// ============================================================
// Generate Strategy Config from Leaderboard JSON
// ============================================================
// 사용법:
//   npx tsx scripts/generate-strategy-config.ts <leaderboard.json> [--symbol AAPL-OTC] [--top 3] [--out strategy-config.json]
//   npx tsx scripts/generate-strategy-config.ts --multi <dir-with-jsons> [--top 3] [--out strategy-config.json]
//
// 입력: LeaderboardResult JSON 또는 LeaderboardEntry[] JSON
// 출력: strategy-config.json
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  extractStrategyConfig,
  extractFromEntries,
  extractMultiSymbolConfig,
  type StrategyConfigFile,
} from '../src/lib/signals/strategy-config';
import type { LeaderboardResult, LeaderboardEntry } from '../src/lib/backtest/leaderboard-types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// CLI Argument Parsing
// ============================================================

interface CliArgs {
  inputPath: string;
  symbol?: string;
  topN: number;
  outputPath: string;
  dataSource: 'demo' | 'real' | 'unknown';
  multi: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  let inputPath = '';
  let symbol: string | undefined;
  let topN = 3;
  let outputPath = path.join(__dirname, '..', 'strategy-config.json');
  let dataSource: 'demo' | 'real' | 'unknown' = 'unknown';
  let multi = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--symbol':
        symbol = args[++i];
        break;
      case '--top':
        topN = parseInt(args[++i], 10);
        break;
      case '--out':
        outputPath = args[++i];
        break;
      case '--data-source':
        dataSource = args[++i] as 'demo' | 'real' | 'unknown';
        break;
      case '--multi':
        multi = true;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        if (!args[i].startsWith('-')) {
          inputPath = args[i];
        }
        break;
    }
  }

  if (!inputPath) {
    console.error('Error: input path is required');
    printUsage();
    process.exit(1);
  }

  return { inputPath, symbol, topN, outputPath, dataSource, multi };
}

function printUsage(): void {
  console.log(`
Usage: npx tsx scripts/generate-strategy-config.ts <input> [options]

Arguments:
  <input>              Path to leaderboard JSON file or directory (with --multi)

Options:
  --symbol <name>      Symbol name (required if input is LeaderboardEntry[])
  --top <n>            Number of top strategies per symbol (default: 3)
  --out <path>         Output path (default: ./strategy-config.json)
  --data-source <type> Data source label: demo | real | unknown (default: unknown)
  --multi              Treat input as directory of LeaderboardResult JSONs
  -h, --help           Show this help

Determinism:
  동일 입력이면 항상 동일 출력을 보장합니다 (generatedAt 필드 제외).
  - 동일 점수/rank 시 strategyId 오름차순 tie-breaker
  - 동일 심볼 중복 시 executedAt → executionTimeMs → totalStrategies로 최신본 선택
  - 출력 JSON의 모든 객체 키는 알파벳순으로 안정 정렬

Examples:
  npx tsx scripts/generate-strategy-config.ts data/leaderboard-AAPL-OTC.json --symbol AAPL-OTC
  npx tsx scripts/generate-strategy-config.ts data/leaderboard-result.json
  npx tsx scripts/generate-strategy-config.ts --multi data/leaderboards/ --out strategy-config.json
`);
}

// ============================================================
// Main
// ============================================================

function main(): void {
  const args = parseArgs(process.argv);
  let config: StrategyConfigFile;

  if (args.multi) {
    config = processMulti(args);
  } else {
    config = processSingle(args);
  }

  const output = stableStringify(config, 2);
  fs.writeFileSync(args.outputPath, output + '\n', 'utf-8');

  // Report
  const symbolCount = Object.keys(config.symbols).length;
  console.log(`Strategy config generated:`);
  console.log(`  Symbols: ${symbolCount}`);
  for (const [sym, sc] of Object.entries(config.symbols)) {
    console.log(`  ${sym}: ${sc.strategies.join(', ')}`);
  }
  console.log(`  Output: ${args.outputPath}`);
}

function processSingle(args: CliArgs): StrategyConfigFile {
  const raw = JSON.parse(fs.readFileSync(args.inputPath, 'utf-8'));

  // Detect format: LeaderboardResult (has .entries + .config) vs LeaderboardEntry[]
  if (isLeaderboardResult(raw)) {
    return extractStrategyConfig(raw, {
      topN: args.topN,
      dataSource: args.dataSource,
    });
  }

  // Array of LeaderboardEntry
  if (Array.isArray(raw)) {
    if (!args.symbol) {
      console.error('Error: --symbol is required when input is a LeaderboardEntry[] array');
      process.exit(1);
    }
    return extractFromEntries(raw, args.symbol, {
      topN: args.topN,
      dataSource: args.dataSource,
    });
  }

  console.error('Error: unrecognized JSON format. Expected LeaderboardResult or LeaderboardEntry[]');
  process.exit(1);
}

function processMulti(args: CliArgs): StrategyConfigFile {
  const dir = args.inputPath;
  if (!fs.statSync(dir).isDirectory()) {
    console.error(`Error: ${dir} is not a directory. Use --multi with a directory.`);
    process.exit(1);
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const results: LeaderboardResult[] = [];

  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
    if (isLeaderboardResult(raw)) {
      results.push(raw);
    } else {
      console.warn(`Skipping ${file}: not a LeaderboardResult`);
    }
  }

  // extractMultiSymbolConfig 내부에서 심볼별 최신본 선택 + 결정적 정렬을 수행.
  // 여기서는 추가 사전 정렬 불필요 (결정성은 모듈 측에서 보장).

  return extractMultiSymbolConfig(results, {
    topN: args.topN,
    dataSource: args.dataSource,
  });
}

function isLeaderboardResult(obj: unknown): obj is LeaderboardResult {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'entries' in obj &&
    'config' in obj &&
    Array.isArray((obj as LeaderboardResult).entries)
  );
}

/**
 * 객체 키를 알파벳순으로 재귀적으로 정렬한 JSON 문자열을 반환한다.
 * 동일 입력에 대해 항상 동일한 출력을 보장한다.
 */
function stableStringify(obj: unknown, indent: number = 2): string {
  return JSON.stringify(obj, (_key, value) => {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(value).sort()) {
        sorted[k] = value[k];
      }
      return sorted;
    }
    return value;
  }, indent);
}

main();
