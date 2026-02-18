/**
 * Binance 저장 데이터(JSON + SQLite) 백테스트를 실행하고 Telegram으로 결과를 전송한다.
 *
 * 실행:
 *   npx tsx scripts/run-binance-backtests-and-notify.ts
 *
 * 환경변수(.env):
 *   TELEGRAM_BOT_TOKEN=123:abc
 *   TELEGRAM_CHAT_ID=123456789
 */
import * as fs from 'fs'
import * as path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { TelegramService } from '../src/lib/notifications/telegram'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.join(__dirname, '..')
const DOT_ENV_PATH = path.join(PROJECT_ROOT, '.env')
const RESULTS_DIR = path.join(PROJECT_ROOT, 'data', 'results')
const JSON_REPORT_PATH = path.join(RESULTS_DIR, 'backtest-report-latest.json')
const SQLITE_REPORT_PATH = path.join(RESULTS_DIR, 'sqlite-backtest-report-latest.json')
const TELEGRAM_CHUNK_LIMIT = 3800

interface CommandResult {
  name: string
  command: string
  args: string[]
  exitCode: number
  durationMs: number
  stdout: string
  stderr: string
}

interface JsonBacktestEntry {
  name: string
  winRate: number
  profitFactor: number
  trades: number
  compositeScore: number
}

interface JsonBacktestDataset {
  symbol: string
  timeframe: string
  entries: JsonBacktestEntry[]
}

interface JsonBacktestReport {
  generatedAt: string
  summary: {
    totalPassedEntries: number
    averageWinRate: number
    profitableStrategies: number
  }
  datasets: JsonBacktestDataset[]
}

interface SqliteBacktestReport {
  generatedAt: string
  summary: {
    assetCount: number
    testedAssets: number
    skippedAssets: number
    totalSignals: number
    wins: number
    losses: number
    overallWinRate: number | null
    status: string
  }
  byStrategy: Array<{
    name: string
    count: number
    winRate: number | null
  }>
  byRegime: Array<{
    name: string
    count: number
    winRate: number | null
  }>
}

export function parseDotEnvContent(content: string): Record<string, string> {
  const env: Record<string, string> = {}

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) continue

    const key = match[1]
    let value = match[2].trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    env[key] = value
  }

  return env
}

function loadDotEnvFile(dotEnvPath: string): Record<string, string> {
  if (!fs.existsSync(dotEnvPath)) {
    return {}
  }

  const parsed = parseDotEnvContent(fs.readFileSync(dotEnvPath, 'utf-8'))
  Object.entries(parsed).forEach(([key, value]) => {
    if (!process.env[key]) {
      process.env[key] = value
    }
  })
  return parsed
}

export function splitLongMessage(message: string, limit: number = TELEGRAM_CHUNK_LIMIT): string[] {
  if (message.length <= limit) {
    return [message]
  }

  const lines = message.split('\n')
  const chunks: string[] = []
  let current = ''

  for (const line of lines) {
    if (line.length > limit) {
      if (current) {
        chunks.push(current)
        current = ''
      }

      for (let i = 0; i < line.length; i += limit) {
        chunks.push(line.slice(i, i + limit))
      }
      continue
    }

    const candidate = current ? `${current}\n${line}` : line
    if (candidate.length > limit) {
      if (current) {
        chunks.push(current)
      }
      current = line
    } else {
      current = candidate
    }
  }

  if (current) {
    chunks.push(current)
  }

  return chunks
}

function formatDuration(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(1)}s`
}

function runCommand(name: string, command: string, args: string[]): Promise<CommandResult> {
  const startedAt = Date.now()

  return new Promise(resolve => {
    const child = spawn(command, args, {
      cwd: PROJECT_ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', chunk => {
      stdout += String(chunk)
    })

    child.stderr.on('data', chunk => {
      stderr += String(chunk)
    })

    child.on('close', code => {
      resolve({
        name,
        command,
        args,
        exitCode: code ?? 1,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr,
      })
    })
  })
}

function readJsonIfExists<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T
}

function buildExecutionMessage(startedAt: Date, results: CommandResult[]): string {
  const endedAt = new Date()
  const successCount = results.filter(r => r.exitCode === 0).length
  const failedCount = results.length - successCount

  let statusLabel = 'SUCCESS'
  if (failedCount > 0 && successCount > 0) statusLabel = 'PARTIAL SUCCESS'
  if (failedCount === results.length) statusLabel = 'FAILED'

  const lines: string[] = []
  lines.push(`<b>Binance Backtest Run (${statusLabel})</b>`)
  lines.push(`Started: ${startedAt.toISOString()}`)
  lines.push(`Ended: ${endedAt.toISOString()}`)
  lines.push(`Elapsed: ${formatDuration(endedAt.getTime() - startedAt.getTime())}`)
  lines.push('')
  lines.push('<b>Pipeline Results</b>')

  for (const result of results) {
    const marker = result.exitCode === 0 ? '✅' : '❌'
    lines.push(
      `${marker} ${result.name}: exit=${result.exitCode}, duration=${formatDuration(result.durationMs)}`
    )
  }

  return lines.join('\n')
}

function buildJsonBacktestMessage(report: JsonBacktestReport | null): string {
  if (!report) {
    return '<b>[JSON Backtest]</b>\nNo report file found.'
  }

  const topEntries = report.datasets
    .flatMap(dataset =>
      dataset.entries.map(entry => ({
        ...entry,
        symbol: dataset.symbol,
        timeframe: dataset.timeframe,
      }))
    )
    .sort((a, b) => b.winRate - a.winRate || b.profitFactor - a.profitFactor)
    .slice(0, 3)

  const lines: string[] = []
  lines.push('<b>[JSON Backtest] data/*USDT_*.json</b>')
  lines.push(`Generated: ${report.generatedAt}`)
  lines.push(`Passed entries: ${report.summary.totalPassedEntries}`)
  lines.push(`Average win rate: ${report.summary.averageWinRate.toFixed(1)}%`)
  lines.push(`Profitable strategies: ${report.summary.profitableStrategies}`)
  lines.push('')
  lines.push('<b>Top 3 Strategies</b>')

  if (topEntries.length === 0) {
    lines.push('- No strategy passed filters')
  } else {
    topEntries.forEach((entry, index) => {
      lines.push(
        `${index + 1}. ${entry.name} (${entry.symbol}/${entry.timeframe})` +
        ` | WR ${entry.winRate.toFixed(1)}% | PF ${entry.profitFactor.toFixed(2)}` +
        ` | Trades ${entry.trades} | Score ${entry.compositeScore.toFixed(1)}`
      )
    })
  }

  return lines.join('\n')
}

function buildSqliteBacktestMessage(report: SqliteBacktestReport | null): string {
  if (!report) {
    return '<b>[SQLite Backtest]</b>\nNo report file found.'
  }

  const topStrategies = report.byStrategy.slice(0, 5)
  const topRegimes = report.byRegime.slice(0, 5)

  const lines: string[] = []
  lines.push('<b>[SQLite Backtest] data/market-data.db</b>')
  lines.push(`Generated: ${report.generatedAt}`)
  lines.push(
    `Assets: ${report.summary.assetCount} (tested ${report.summary.testedAssets}, skipped ${report.summary.skippedAssets})`
  )
  lines.push(
    `Signals: ${report.summary.totalSignals} | W/L: ${report.summary.wins}/${report.summary.losses}`
  )
  lines.push(
    `Overall WR: ${report.summary.overallWinRate === null ? 'N/A' : `${report.summary.overallWinRate.toFixed(1)}%`}`
  )
  lines.push(`Status: ${report.summary.status}`)
  lines.push('')
  lines.push('<b>Top Strategies</b>')

  if (topStrategies.length === 0) {
    lines.push('- No strategy stats')
  } else {
    topStrategies.forEach((strategy, index) => {
      lines.push(
        `${index + 1}. ${strategy.name} | Signals ${strategy.count}` +
        ` | WR ${strategy.winRate === null ? 'N/A' : `${strategy.winRate.toFixed(1)}%`}`
      )
    })
  }

  lines.push('')
  lines.push('<b>Top Regimes</b>')

  if (topRegimes.length === 0) {
    lines.push('- No regime stats')
  } else {
    topRegimes.forEach((regime, index) => {
      lines.push(
        `${index + 1}. ${regime.name} | Signals ${regime.count}` +
        ` | WR ${regime.winRate === null ? 'N/A' : `${regime.winRate.toFixed(1)}%`}`
      )
    })
  }

  return lines.join('\n')
}

function buildFailureDetailMessage(results: CommandResult[]): string | null {
  const failures = results.filter(r => r.exitCode !== 0)
  if (failures.length === 0) return null

  const lines: string[] = []
  lines.push('<b>Failed Pipelines</b>')

  for (const failure of failures) {
    const stderrLines = failure.stderr
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .slice(0, 12)

    lines.push('')
    lines.push(`- ${failure.name} (exit=${failure.exitCode})`)
    lines.push(`  cmd: ${failure.command} ${failure.args.join(' ')}`)

    if (stderrLines.length > 0) {
      lines.push('  stderr:')
      stderrLines.forEach(line => lines.push(`  ${line}`))
    } else {
      lines.push('  stderr: (empty)')
    }
  }

  return lines.join('\n')
}

async function sendChunkedMessage(service: TelegramService, message: string): Promise<void> {
  const chunks = splitLongMessage(message, TELEGRAM_CHUNK_LIMIT)
  for (const chunk of chunks) {
    const ok = await service.sendMessage(chunk)
    if (!ok) {
      throw new Error('Telegram message send failed')
    }
  }
}

async function main(): Promise<void> {
  loadDotEnvFile(DOT_ENV_PATH)

  const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || ''
  const chatId = process.env.TELEGRAM_CHAT_ID || process.env.CHAT_ID || ''

  if (!botToken || !chatId) {
    throw new Error(
      'Missing Telegram credentials. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env.'
    )
  }

  const telegram = new TelegramService({
    botToken,
    chatId,
    enabled: true,
    notifySignals: true,
    notifyTrades: true,
    notifyErrors: true,
  })

  const startedAt = new Date()

  const commandResults: CommandResult[] = []
  commandResults.push(
    await runCommand('JSON Backtest', 'npx', ['tsx', 'scripts/run-backtest-report.ts'])
  )
  commandResults.push(
    await runCommand('SQLite Backtest', 'npx', ['tsx', 'scripts/backtest-from-sqlite.ts', '--source', 'history'])
  )

  const jsonBacktestReport = readJsonIfExists<JsonBacktestReport>(JSON_REPORT_PATH)
  const sqliteBacktestReport = readJsonIfExists<SqliteBacktestReport>(SQLITE_REPORT_PATH)

  await sendChunkedMessage(telegram, buildExecutionMessage(startedAt, commandResults))
  await sendChunkedMessage(telegram, buildJsonBacktestMessage(jsonBacktestReport))
  await sendChunkedMessage(telegram, buildSqliteBacktestMessage(sqliteBacktestReport))

  const failureMessage = buildFailureDetailMessage(commandResults)
  if (failureMessage) {
    await sendChunkedMessage(telegram, failureMessage)
  }

  const succeeded = commandResults.filter(result => result.exitCode === 0).length
  if (succeeded === 0) {
    throw new Error('Both backtest pipelines failed.')
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch(error => {
    console.error('[run-binance-backtests-and-notify] fatal:', error)
    process.exit(1)
  })
}

export {
  buildExecutionMessage,
  buildJsonBacktestMessage,
  buildSqliteBacktestMessage,
  buildFailureDetailMessage,
}
