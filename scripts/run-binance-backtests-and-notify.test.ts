import { describe, expect, it } from 'vitest'
import {
  parseDotEnvContent,
  splitLongMessage,
  buildFailureDetailMessage,
  buildJsonBacktestMessage,
} from './run-binance-backtests-and-notify'

describe('run-binance-backtests-and-notify helpers', () => {
  it('parses .env content with comments and quoted values', () => {
    const parsed = parseDotEnvContent(`
# comment
TELEGRAM_BOT_TOKEN="123:abc"
TELEGRAM_CHAT_ID='-1001234'
INVALID LINE
EMPTY=
`)

    expect(parsed).toEqual({
      TELEGRAM_BOT_TOKEN: '123:abc',
      TELEGRAM_CHAT_ID: '-1001234',
      EMPTY: '',
    })
  })

  it('splits long messages within size limit and preserves content', () => {
    const input = [
      'line-1 1234567890',
      'line-2 1234567890',
      'line-3 1234567890',
      'line-4 1234567890',
      'line-5 1234567890',
      'line-6 1234567890',
    ].join('\n')

    const chunks = splitLongMessage(input, 40)

    expect(chunks.length).toBeGreaterThan(1)
    chunks.forEach(chunk => expect(chunk.length).toBeLessThanOrEqual(40))
    expect(chunks.join('\n')).toBe(input)
  })

  it('builds failure detail message with stderr snippets', () => {
    const msg = buildFailureDetailMessage([
      {
        name: 'JSON Backtest',
        command: 'npx',
        args: ['tsx', 'scripts/run-backtest-report.ts'],
        exitCode: 1,
        durationMs: 1000,
        stdout: '',
        stderr: 'first error\nsecond error\n',
      },
      {
        name: 'SQLite Backtest',
        command: 'npx',
        args: ['tsx', 'scripts/backtest-from-sqlite.ts'],
        exitCode: 0,
        durationMs: 1000,
        stdout: '',
        stderr: '',
      },
    ])

    expect(msg).toContain('Failed Pipelines')
    expect(msg).toContain('JSON Backtest')
    expect(msg).toContain('first error')
    expect(msg).not.toContain('SQLite Backtest')
  })

  it('builds JSON backtest message with top 3 strategies', () => {
    const message = buildJsonBacktestMessage({
      generatedAt: '2026-02-18T12:00:00.000Z',
      summary: {
        totalPassedEntries: 4,
        averageWinRate: 57.2,
        profitableStrategies: 2,
      },
      datasets: [
        {
          symbol: 'BTCUSDT',
          timeframe: '1m',
          entries: [
            { name: 'S1', winRate: 55.1, profitFactor: 1.2, trades: 20, compositeScore: 60.5 },
            { name: 'S2', winRate: 66.1, profitFactor: 1.8, trades: 15, compositeScore: 72.1 },
          ],
        },
        {
          symbol: 'ETHUSDT',
          timeframe: '5m',
          entries: [
            { name: 'S3', winRate: 58.3, profitFactor: 1.3, trades: 10, compositeScore: 61.2 },
            { name: 'S4', winRate: 51.2, profitFactor: 1.1, trades: 25, compositeScore: 59.1 },
          ],
        },
      ],
    })

    expect(message).toContain('[JSON Backtest]')
    expect(message).toContain('Top 3 Strategies')
    expect(message).toContain('1. S2')
    expect(message).toContain('2. S3')
    expect(message).toContain('3. S1')
    expect(message).not.toContain('S4')
  })
})
