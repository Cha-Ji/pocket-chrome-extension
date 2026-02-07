/**
 * Console Monitor — captures and categorises browser console output.
 *
 * Each log line is tagged with a pipeline stage so an LLM (or human) can
 * instantly see which part of the mining data-flow is working / broken.
 *
 * Pipeline stages:
 *   BRIDGE   — Tampermonkey pq-bridge messages
 *   WS_HOOK  — WebSocket interception / connection
 *   PARSER   — WebSocket message parsing
 *   HISTORY  — Candle history capture
 *   MINER    — AutoMiner asset rotation / requesting
 *   SENDER   — DataSender HTTP calls to local server
 *   SIGNAL   — Signal generation
 *   TRADE    — Trade execution
 *   INIT     — Extension initialisation
 *   OTHER    — Anything else from the extension
 */

import type { Page, ConsoleMessage } from '@playwright/test'

export type PipelineStage =
  | 'BRIDGE'
  | 'WS_HOOK'
  | 'PARSER'
  | 'HISTORY'
  | 'MINER'
  | 'SENDER'
  | 'SIGNAL'
  | 'TRADE'
  | 'INIT'
  | 'OTHER'

export interface TaggedLog {
  stage: PipelineStage
  level: 'log' | 'warn' | 'error' | 'info' | 'debug'
  text: string
  timestamp: number
}

// Pattern → Stage mapping.  First match wins.
const STAGE_RULES: Array<{ pattern: RegExp; stage: PipelineStage }> = [
  { pattern: /\[TM-Spy\]|pq-bridge|Bridge Connected|Bridge Ready/i, stage: 'BRIDGE' },
  { pattern: /WS Hook|WebSocket Constructor|ws_instances|🔌.*WebSocket/i, stage: 'WS_HOOK' },
  { pattern: /WS.?Parser|Pattern.*error|History parsed/i, stage: 'PARSER' },
  { pattern: /History Captured|Candle History Detected|History response|onHistoryReceived|📜/i, stage: 'HISTORY' },
  { pattern: /Miner|Mining|⛏️|mine.*asset|scanAndMine|loadHistoryPeriod|getHistory/i, stage: 'MINER' },
  { pattern: /DataSender|Sending candle|Bulk s|sendHistory|sendCandle|localhost:3001|Network error/i, stage: 'SENDER' },
  { pattern: /Signal|🎯.*Signal/i, stage: 'SIGNAL' },
  { pattern: /Trade.*Executed|executeTrade|CALL|PUT/i, stage: 'TRADE' },
  { pattern: /\[PO\].*Starting init|\[PO\].*\[\d\]|\[PO\].*SUCCESS|\[PO\].*Build Version/i, stage: 'INIT' },
]

function classify(text: string): PipelineStage {
  for (const rule of STAGE_RULES) {
    if (rule.pattern.test(text)) return rule.stage
  }
  if (/\[PO\]/.test(text)) return 'OTHER'
  return 'OTHER'
}

/**
 * Attach a console monitor to a Playwright page.
 * Returns a handle that gives access to the collected logs and helpers.
 */
export function attachConsoleMonitor(page: Page) {
  const logs: TaggedLog[] = []

  const handler = (msg: ConsoleMessage) => {
    const text = msg.text()
    // Only capture extension-related logs to keep noise down
    if (!isExtensionLog(text)) return

    const entry: TaggedLog = {
      stage: classify(text),
      level: msg.type() as TaggedLog['level'],
      text,
      timestamp: Date.now(),
    }
    logs.push(entry)
  }

  page.on('console', handler)

  return {
    /** All captured logs */
    logs,

    /** Logs filtered by stage */
    byStage(stage: PipelineStage): TaggedLog[] {
      return logs.filter(l => l.stage === stage)
    },

    /** Only error-level logs */
    errors(): TaggedLog[] {
      return logs.filter(l => l.level === 'error')
    },

    /** Check whether a stage ever emitted at least one log */
    stageReached(stage: PipelineStage): boolean {
      return logs.some(l => l.stage === stage)
    },

    /** Build a per-stage summary suitable for LLM consumption */
    buildDiagnosticReport(): string {
      const stages: PipelineStage[] = [
        'INIT', 'BRIDGE', 'WS_HOOK', 'PARSER', 'HISTORY', 'MINER', 'SENDER',
      ]
      const lines: string[] = ['## Mining Pipeline Diagnostic Report', '']

      for (const stage of stages) {
        const entries = logs.filter(l => l.stage === stage)
        const errors = entries.filter(l => l.level === 'error')
        const icon = entries.length === 0
          ? '  '   // never reached
          : errors.length > 0
            ? '  '  // has errors
            : '  '  // OK

        lines.push(`### ${icon} ${stage}  (${entries.length} logs, ${errors.length} errors)`)

        if (entries.length === 0) {
          lines.push('> No logs captured — this stage was never reached.')
        } else {
          // Show last 5 logs for context
          const tail = entries.slice(-5)
          for (const e of tail) {
            const prefix = e.level === 'error' ? 'ERROR' : e.level.toUpperCase()
            lines.push(`- [${prefix}] ${e.text}`)
          }
          if (entries.length > 5) {
            lines.push(`- ... (${entries.length - 5} more)`)
          }
        }
        lines.push('')
      }

      // Overall summary
      const reachedStages = stages.filter(s => logs.some(l => l.stage === s))
      const errorStages = stages.filter(s => logs.some(l => l.stage === s && l.level === 'error'))

      lines.push('### Summary')
      lines.push(`- Stages reached: ${reachedStages.join(', ') || 'NONE'}`)
      lines.push(`- Stages with errors: ${errorStages.join(', ') || 'NONE'}`)
      lines.push(`- Total logs: ${logs.length}`)

      // Identify the break point
      const firstMissing = stages.find(s => !reachedStages.includes(s))
      if (firstMissing) {
        lines.push(`- **Pipeline breaks at: ${firstMissing}**`)
      }

      return lines.join('\n')
    },

    /** Stop collecting */
    detach() {
      page.off('console', handler)
    },
  }
}

/** Quick filter — only keep lines that look like they come from our extension */
function isExtensionLog(text: string): boolean {
  return (
    text.includes('[PO]') ||
    text.includes('[TM-Spy]') ||
    text.includes('pq-bridge') ||
    text.includes('WS Parser') ||
    text.includes('WS-Interceptor') ||
    text.includes('DataSender') ||
    text.includes('Miner') ||
    text.includes('Mining') ||
    text.includes('localhost:3001') ||
    text.includes('Bulk s') ||
    text.includes('Network error') ||
    text.includes('sendHistory') ||
    text.includes('History') ||
    text.includes('loadHistoryPeriod')
  )
}
