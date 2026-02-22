// ============================================================
// Real Data Fixture Loader
// ============================================================
// Loads JSON candle fixtures from data/ for realistic backtests.
// Uses fs.readFileSync — only available in Vitest/Node, not in browser.
// ============================================================

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { Candle } from '../types';

const DATA_DIR = resolve(__dirname, '../../../../data');

export const FIXTURES = {
  BTCUSDT_1M: 'BTCUSDT_1m.json',
  ETHUSDT_1M: 'ETHUSDT_1m.json',
  BTCUSDT_5M: 'BTCUSDT_5m.json',
  ETHUSDT_5M: 'ETHUSDT_5m.json',
} as const;

interface FixtureFile {
  symbol: string;
  interval: string;
  count: number;
  candles: Candle[];
}

/**
 * Check whether a fixture file exists on disk.
 */
export function hasFixture(filename: string): boolean {
  return existsSync(resolve(DATA_DIR, filename));
}

/**
 * Load all candles from a fixture file.
 * Throws if the file is missing or malformed.
 */
export function loadFixture(filename: string): Candle[] {
  const filepath = resolve(DATA_DIR, filename);
  const raw = readFileSync(filepath, 'utf-8');
  const parsed: FixtureFile = JSON.parse(raw);
  return parsed.candles;
}

/**
 * Load up to `max` candles from a fixture file (from the beginning).
 * Useful for keeping test runtimes short.
 */
export function loadFixtureSlice(filename: string, max = 1000): Candle[] {
  const candles = loadFixture(filename);
  return candles.slice(0, max);
}
