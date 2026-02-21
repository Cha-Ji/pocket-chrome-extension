/**
 * Pocket Option 1m candle collector (REAL account, read-only)
 *
 * Design goals:
 * - Run 24/7
 * - Use persistent browser session (userDataDir) to reuse login
 * - Collect 1m OHLC candles from live price updates
 * - Memory monitoring: exit to let PM2 restart when over threshold
 *
 * How it works:
 * - Launch Playwright Chromium in persistent context
 * - Navigate to PO trading page
 * - Inject MutationObserver that watches a price DOM node
 * - Send ticks to Node via exposed binding
 * - Aggregate into 1m candles, post to local collector server (/api/candle)
 *
 * Notes:
 * - This is NOT a trading bot. It only reads price and stores candles.
 * - DOM selectors may need adjustment depending on PO UI updates.
 */

import { chromium, type BrowserContext, type Page } from '@playwright/test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

type Tick = { symbol: string; ts: number; price: number }

type Candle = {
  symbol: string
  interval: '60'
  timestamp: number // start of minute (ms)
  open: number
  high: number
  low: number
  close: number
  volume: number
  source: 'pocketoption-dom'
}

const PO_URL = process.env.PO_URL || 'https://pocketoption.com/en/cabinet/quick-high-low/'
const SYMBOL = process.env.PO_SYMBOL || 'EURUSD'
const HEADLESS = (process.env.PO_HEADLESS ?? '1') !== '0'
const DEFAULT_PROFILE_DIR = path.join(os.homedir(), '.pocket-quant', 'chrome-profile')
const USER_DATA_DIR =
  process.env.PO_USER_DATA_DIR || DEFAULT_PROFILE_DIR

const COLLECTOR_URL = process.env.COLLECTOR_URL || 'http://127.0.0.1:3001'

// Memory guard (MB). When exceeded, exit(0) to let PM2 restart.
const MEM_RESTART_MB = Number(process.env.PO_MEM_RESTART_MB ?? '2500')
const MEM_CHECK_EVERY_MS = Number(process.env.PO_MEM_CHECK_EVERY_MS ?? '15000')

// Price selector candidates (may need updates)
const PRICE_SELECTORS = [
  '.chart-item .value__val',
  '.chart-block__price .value__val',
  '.chart-item .value',
  '.chart-block__price .value',
]

function minuteStartMs(ts: number): number {
  return Math.floor(ts / 60000) * 60000
}

class CandleAggregator {
  private cur: { start: number; open: number; high: number; low: number; close: number; vol: number } | null = null

  onTick(t: Tick): Candle | null {
    const start = minuteStartMs(t.ts)
    if (!this.cur || this.cur.start !== start) {
      // finalize previous
      const prev = this.cur
      this.cur = { start, open: t.price, high: t.price, low: t.price, close: t.price, vol: 1 }
      if (prev) {
        return {
          symbol: t.symbol,
          interval: '60',
          timestamp: prev.start,
          open: prev.open,
          high: prev.high,
          low: prev.low,
          close: prev.close,
          volume: prev.vol,
          source: 'pocketoption-dom',
        }
      }
      return null
    }

    this.cur.high = Math.max(this.cur.high, t.price)
    this.cur.low = Math.min(this.cur.low, t.price)
    this.cur.close = t.price
    this.cur.vol += 1
    return null
  }
}

async function postCandle(c: Candle): Promise<void> {
  const payload = {
    symbol: c.symbol,
    interval: c.interval,
    timestamp: c.timestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
    source: c.source,
  }

  const res = await fetch(`${COLLECTOR_URL}/api/candle`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`collector /api/candle failed: ${res.status} ${txt}`)
  }
}

async function ensureDirs(): Promise<void> {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true })
}

async function launchContext(): Promise<BrowserContext> {
  await ensureDirs()

  return chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: HEADLESS,
    viewport: { width: 1400, height: 900 },
    args: [
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  })
}

async function setupTickBridge(page: Page, onTick: (t: Tick) => Promise<void>) {
  // Node callback exposed into page
  await page.exposeBinding('po_onTick', async (_source, tick: Tick) => {
    await onTick(tick)
  })

  // IMPORTANT:
  // - Do NOT pass a Function object to addInitScript/evaluate when running via tsx/esbuild,
  //   because the transpiler may inject helpers (e.g. __name) that don't exist in the page.
  // - Use plain JS string instead.
  const script = `
    (() => {
      const selectors = ${JSON.stringify(PRICE_SELECTORS)};
      const symbol = ${JSON.stringify(SYMBOL)};

      function findPriceEl() {
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) return el;
        }
        return null;
      }

      function parsePrice(text) {
        const cleaned = String(text || '').replace(/[^0-9.]/g, '');
        const v = Number.parseFloat(cleaned);
        return Number.isFinite(v) ? v : null;
      }

      function attach() {
        const el = findPriceEl();
        if (!el) {
          console.log('[PO][collector] price element not found; retrying...');
          setTimeout(attach, 1000);
          return;
        }

        const push = () => {
          const txt = (el.innerText || el.textContent || '').trim();
          const price = parsePrice(txt);
          if (price == null) return;
          window.po_onTick({ symbol, ts: Date.now(), price });
        };

        const obs = new MutationObserver(() => push());
        obs.observe(el, { childList: true, subtree: true, characterData: true });
        // Some PO UI updates do not trigger character-data mutations reliably.
        // Keep a low-frequency polling fallback so 1m candle aggregation continues.
        setInterval(push, 1000);
        push();
        console.log('[PO][collector] observer attached');
      }

      attach();
    })();
  `

  // 1) For future navigations
  await page.addInitScript({ content: script })

  // 2) Also inject immediately for the current page
  await page.evaluate(script)
}

function startMemoryGuard(): NodeJS.Timeout {
  return setInterval(() => {
    const rssMb = process.memoryUsage().rss / 1024 / 1024
    if (rssMb > MEM_RESTART_MB) {
      console.error(`[PO][collector] RSS ${rssMb.toFixed(0)}MB > ${MEM_RESTART_MB}MB, exiting for restart...`)
      process.exit(0)
    }
  }, MEM_CHECK_EVERY_MS)
}

async function main(): Promise<void> {
  const memTimer = startMemoryGuard()

  const aggregator = new CandleAggregator()

  const context = await launchContext()
  const page = await context.newPage()

  // Pipe page console/errors to Node logs (crucial for headless debugging)
  page.on('console', (msg) => {
    const text = msg.text()
    if (text?.includes('[PO][collector]')) {
      console.log(text)
    }
  })
  page.on('pageerror', (err) => console.error('[PO][pageerror]', err))
  page.on('requestfailed', (req) => console.error('[PO][requestfailed]', req.url(), req.failure()?.errorText))

  console.log(`[PO][collector] starting (headless=${HEADLESS ? '1' : '0'}) url=${PO_URL}`)

  // Basic navigation
  await page.goto(PO_URL, { waitUntil: 'domcontentloaded' })

  // Best-effort: wait a bit for UI
  await page.waitForTimeout(2000)

  // NOTE: optional: auto-navigate to trading page, select SYMBOL.
  // For now, user should open the trading page + choose the asset once,
  // then the persistent session keeps it.

  await setupTickBridge(page, async (t) => {
    const candle = aggregator.onTick(t)
    if (candle) {
      try {
        await postCandle(candle)
        console.log(`[PO][collector] candle saved ${candle.symbol} @ ${new Date(candle.timestamp).toISOString()}`)
      } catch (e: any) {
        console.error('[PO][collector] postCandle error:', e?.message || e)
      }
    }
  })

  // Keep alive
  page.on('close', () => {
    console.error('[PO][collector] page closed; exiting to restart')
    process.exit(0)
  })

  // Heartbeat
  setInterval(() => {
    console.log(`[PO][collector] heartbeat rssMB=${(process.memoryUsage().rss / 1024 / 1024).toFixed(0)}`)
  }, 60_000)

  // Avoid Node exiting
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await page.waitForTimeout(60_000)
  }

  // cleanup (unreachable)
  clearInterval(memTimer)
  await context.close()
}

main().catch((e) => {
  console.error('[PO][collector] fatal:', e)
  process.exit(1)
})
