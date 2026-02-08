/**
 * Server Checker — verifies the local data-collector server is healthy
 * and can query stored candle counts to confirm data actually arrived.
 */

const SERVER_URL = process.env.COLLECTOR_URL ?? 'http://localhost:3001'

export interface ServerHealth {
  ok: boolean
  totalCandles: number
  error?: string
}

export interface CandleQuery {
  symbol?: string
  interval?: string
  start?: number
  end?: number
}

/**
 * Check server health.  Returns ok:false instead of throwing.
 */
export async function checkServerHealth(): Promise<ServerHealth> {
  try {
    const res = await fetch(`${SERVER_URL}/health`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return { ok: false, totalCandles: 0, error: `HTTP ${res.status}` }
    const body = await res.json()
    return { ok: true, totalCandles: body.totalCandles ?? 0 }
  } catch (e: unknown) {
    return { ok: false, totalCandles: 0, error: (e as Error).message }
  }
}

/**
 * Query candle count for a specific symbol/interval.
 */
export async function getCandleCount(query: CandleQuery = {}): Promise<number> {
  const params = new URLSearchParams()
  if (query.symbol) params.set('symbol', query.symbol)
  if (query.interval) params.set('interval', query.interval ?? '1m')
  if (query.start) params.set('start', String(query.start))
  if (query.end) params.set('end', String(query.end))

  try {
    const res = await fetch(`${SERVER_URL}/api/candles?${params}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return 0
    const candles = await res.json()
    return Array.isArray(candles) ? candles.length : 0
  } catch {
    return 0
  }
}

/**
 * Snapshot candle counts before/after a test to measure new arrivals.
 */
export async function snapshotCandleCount(): Promise<number> {
  const health = await checkServerHealth()
  return health.totalCandles
}

/** 심볼별 캔들 수집 통계 */
export interface SymbolCandleStat {
  symbol: string
  count: number
  oldest: number
  newest: number
  days: number
}

/**
 * 서버의 /api/candles/stats 엔드포인트에서 심볼별 캔들 수를 조회.
 * 특정 심볼만 필터링하려면 symbols 배열을 전달.
 */
export async function getCandleCountBySymbol(
  symbols?: string[]
): Promise<SymbolCandleStat[]> {
  try {
    const res = await fetch(`${SERVER_URL}/api/candles/stats`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return []
    const stats: SymbolCandleStat[] = await res.json()
    if (!Array.isArray(stats)) return []
    if (symbols && symbols.length > 0) {
      // 심볼 이름 정규화 후 매칭 (대소문자/공백/OTC 표기 차이 흡수)
      const normalize = (s: string) =>
        s.toUpperCase().replace(/[\s_-]+/g, '').replace(/OTC$/, 'OTC')
      const normalizedSet = new Set(symbols.map(normalize))
      return stats.filter(s => normalizedSet.has(normalize(s.symbol)))
    }
    return stats
  } catch {
    return []
  }
}
