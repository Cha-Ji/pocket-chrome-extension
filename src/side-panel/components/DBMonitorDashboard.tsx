import { useState, useEffect, useCallback } from 'react'
import { CandleRepository } from '../../lib/db'
import type { DataSenderStats } from '../../lib/data-sender'
import { sendTabMessageCallback, sendRuntimeMessage } from '../infrastructure/extension-client'

// NOTE: 서버는 로컬(collector)로만 붙는다. 프로덕션 빌드에서도 상태 확인이 필요해서 DEV 가드 제거.
const SERVER_URL = 'http://localhost:3001'
const POLL_SENDER_MS = 5000
const POLL_SERVER_MS = 10000
const POLL_INDEXEDDB_MS = 10000

interface ServerAssetStats {
  symbol: string
  count: number
  oldest: number
  newest: number
  days: number
}

interface IndexedDBStats {
  totalCandles: number
  tickers: { ticker: string; interval: number; count: number }[]
  oldestTimestamp: number | null
  newestTimestamp: number | null
}

interface TickBufferStats {
  buffer: {
    bufferSize: number
    accepted: number
    dropped: number
    flushed: number
    flushErrors: number
    retentionRuns: number
    retentionDeleted: number
    policy: {
      sampleIntervalMs: number
      batchSize: number
      flushIntervalMs: number
      maxTicks: number
      maxAgeMs: number
      retentionIntervalMs: number
    }
  }
  db: {
    count: number
    oldestTimestamp: number | null
    newestTimestamp: number | null
  }
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function timeAgo(timestamp: number): string {
  if (!timestamp) return '-'
  const diff = Math.floor((Date.now() - timestamp) / 1000)
  if (diff < 0) return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function timestampToDate(ts: number): string {
  if (!ts) return '-'
  // 초 단위면 ms로 변환
  const ms = ts < 1e12 ? ts * 1000 : ts
  return new Date(ms).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })
}

export function DBMonitorDashboard() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('dbmonitor-collapsed') === 'true' } catch { return true }
  })

  // 소스 1: DataSender 전송 통계 (Content Script 경유)
  const [senderStats, setSenderStats] = useState<DataSenderStats | null>(null)

  // 소스 2: 서버 상태 + SQLite 통계 (직접 fetch)
  const [serverOnline, setServerOnline] = useState(false)
  const [serverTotalCandles, setServerTotalCandles] = useState(0)
  const [serverAssets, setServerAssets] = useState<ServerAssetStats[]>([])
  const [lastServerCheck, setLastServerCheck] = useState(0)

  // 소스 3: IndexedDB 통계 (Dexie 직접 접근)
  const [indexedDBStats, setIndexedDBStats] = useState<IndexedDBStats | null>(null)

  // 소스 4: TickBuffer 통계 (Background 경유)
  const [tickBufferStats, setTickBufferStats] = useState<TickBufferStats | null>(null)

  // 접기 상태 저장
  useEffect(() => {
    try { localStorage.setItem('dbmonitor-collapsed', String(collapsed)) } catch {}
  }, [collapsed])

  // 소스 1: DataSender 통계 폴링 (5초)
  const fetchSenderStats = useCallback(() => {
    sendTabMessageCallback('GET_DB_MONITOR_STATUS', (res) => {
      const typed = res as { sender?: DataSenderStats } | null
      if (typed?.sender) setSenderStats(typed.sender)
    })
  }, [])

  // 소스 2: 서버 health + stats 폴링 (10초)
  // NOTE: Chrome/확장 환경에서는 AbortSignal.timeout 미지원(또는 제한)일 수 있어 수동 타임아웃을 사용한다.
  const fetchWithTimeout = useCallback(async (url: string, timeoutMs: number) => {
    // AbortSignal.timeout이 있으면 사용
    const anyAbortSignal = AbortSignal as any
    if (anyAbortSignal?.timeout) {
      return fetch(url, { signal: anyAbortSignal.timeout(timeoutMs) })
    }

    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetch(url, { signal: controller.signal })
    } finally {
      clearTimeout(t)
    }
  }, [])

  const fetchServerStats = useCallback(async () => {
    try {
      const healthRes = await fetchWithTimeout(`${SERVER_URL}/health`, 3000)
      if (healthRes.ok) {
        const data = await healthRes.json()
        setServerOnline(true)
        setServerTotalCandles(data.totalCandles || 0)
      } else {
        setServerOnline(false)
      }
    } catch {
      setServerOnline(false)
    }
    setLastServerCheck(Date.now())

    try {
      const statsRes = await fetchWithTimeout(`${SERVER_URL}/api/candles/stats`, 5000)
      if (statsRes.ok) {
        const data = await statsRes.json()
        setServerAssets(Array.isArray(data) ? data : [])
      }
    } catch {}
  }, [fetchWithTimeout])

  // 소스 3: IndexedDB 통계 폴링 (10초)
  const fetchIndexedDBStats = useCallback(async () => {
    try {
      const stats = await CandleRepository.getStats()
      setIndexedDBStats(stats)
    } catch {}
  }, [])

  // 소스 4: TickBuffer 통계 폴링 (5초, Background에서)
  const fetchTickBufferStats = useCallback(async () => {
    try {
      const res = await sendRuntimeMessage('GET_TICK_BUFFER_STATS')
      if (res && typeof res === 'object') {
        setTickBufferStats(res as TickBufferStats)
      }
    } catch {}
  }, [])

  // 폴링 시작 (collapsed 상태면 중지, visibility-aware)
  useEffect(() => {
    if (collapsed) return

    const isVisible = () => document.visibilityState === 'visible'

    // 즉시 한번 실행
    fetchSenderStats()
    fetchServerStats()
    fetchIndexedDBStats()
    fetchTickBufferStats()

    const senderInterval = setInterval(() => { if (isVisible()) fetchSenderStats() }, POLL_SENDER_MS)
    const serverInterval = setInterval(() => { if (isVisible()) fetchServerStats() }, POLL_SERVER_MS)
    const dbInterval = setInterval(() => { if (isVisible()) fetchIndexedDBStats() }, POLL_INDEXEDDB_MS)
    const tickInterval = setInterval(() => { if (isVisible()) fetchTickBufferStats() }, POLL_SENDER_MS)

    // Refresh immediately when becoming visible again
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchSenderStats()
        fetchServerStats()
        fetchIndexedDBStats()
        fetchTickBufferStats()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(senderInterval)
      clearInterval(serverInterval)
      clearInterval(dbInterval)
      clearInterval(tickInterval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [collapsed, fetchSenderStats, fetchServerStats, fetchIndexedDBStats, fetchTickBufferStats])

  const handleRefresh = () => {
    fetchSenderStats()
    fetchServerStats()
    fetchIndexedDBStats()
    fetchTickBufferStats()
  }

  // [3B] Diagnostic actions
  const handleFlushNow = async () => {
    try {
      await sendRuntimeMessage('FLUSH_TICK_BUFFER')
      handleRefresh()
    } catch {}
  }

  const handleRetentionNow = async () => {
    try {
      await sendRuntimeMessage('RUN_TICK_RETENTION')
      handleRefresh()
    } catch {}
  }

  return (
    <div className="p-4 bg-gray-800 rounded-lg border border-cyan-500">
      {/* 헤더 */}
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setCollapsed(!collapsed)}
      >
        <h3 className="text-lg font-bold text-white flex items-center">
          <span>📡 DB Monitor</span>
          {serverOnline && <span className="ml-2 w-2.5 h-2.5 bg-green-500 rounded-full" />}
          {!serverOnline && !collapsed && <span className="ml-2 w-2.5 h-2.5 bg-red-500 rounded-full" />}
        </h3>
        <span className="text-gray-400 text-sm">{collapsed ? '▶' : '▼'}</span>
      </div>

      {collapsed && (
        <div className="flex gap-3 mt-2 text-xs text-gray-400">
          <span className={serverOnline ? 'text-green-400' : 'text-red-400'}>
            {serverOnline ? '● Online' : '○ Offline'}
          </span>
          {serverTotalCandles > 0 && (
            <span>Server: {formatNumber(serverTotalCandles)}</span>
          )}
          {indexedDBStats && indexedDBStats.totalCandles > 0 && (
            <span>Local: {formatNumber(indexedDBStats.totalCandles)}</span>
          )}
        </div>
      )}

      {!collapsed && (
        <div className="mt-3 space-y-3">
          {/* 섹션 1: 서버 연결 상태 */}
          <div className="bg-gray-900 rounded-md p-3 space-y-2">
            <div className="text-xs text-gray-500 mb-1 font-semibold uppercase">Server Connection</div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">상태</span>
              <span className={serverOnline ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                {serverOnline ? '● Online' : '○ Offline'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">서버 총 캔들</span>
              <span className="text-cyan-400 font-bold">{formatNumber(serverTotalCandles)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">마지막 체크</span>
              <span className="text-gray-300">{lastServerCheck ? timeAgo(lastServerCheck) : '-'}</span>
            </div>
          </div>

          {/* 섹션 2: 전송 통계 */}
          <div className="bg-gray-900 rounded-md p-3 space-y-2">
            <div className="text-xs text-gray-500 mb-1 font-semibold uppercase">Transfer Stats</div>
            {senderStats ? (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">벌크 전송</span>
                  <span>
                    <span className="text-green-400 font-bold">{senderStats.bulkSuccessCount}</span>
                    <span className="text-gray-500"> / </span>
                    <span className="text-red-400">{senderStats.bulkFailCount}</span>
                    <span className="text-gray-500 text-xs"> (성공/실패)</span>
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">벌크 캔들</span>
                  <span className="text-cyan-400 font-bold">{formatNumber(senderStats.bulkTotalCandles)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">실시간 전송</span>
                  <span>
                    <span className="text-green-400 font-bold">{senderStats.realtimeSuccessCount}</span>
                    <span className="text-gray-500"> / </span>
                    <span className="text-red-400">{senderStats.realtimeFailCount}</span>
                    <span className="text-gray-500 text-xs"> (성공/실패)</span>
                  </span>
                </div>
                {senderStats.lastBulkSendAt > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">마지막 벌크</span>
                    <span className="text-gray-300">{timeAgo(senderStats.lastBulkSendAt)}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs text-gray-500">Content Script 미연결</div>
            )}
          </div>

          {/* 섹션 3: 서버 DB 자산별 현황 */}
          <div className="bg-gray-900 rounded-md p-3">
            <div className="text-xs text-gray-500 mb-2 font-semibold uppercase">
              Server DB (SQLite) — {serverAssets.length} assets
            </div>
            {serverAssets.length > 0 ? (
              <>
                <div className="flex text-[10px] text-gray-600 mb-1 px-1">
                  <span className="flex-1">자산</span>
                  <span className="w-16 text-right">캔들수</span>
                  <span className="w-14 text-right">일수</span>
                  <span className="w-16 text-right">최근</span>
                </div>
                <div className="space-y-0.5 max-h-40 overflow-y-auto">
                  {serverAssets
                    .sort((a, b) => b.count - a.count)
                    .map(a => (
                    <div key={a.symbol} className="flex text-xs px-1 py-0.5 hover:bg-gray-800 rounded">
                      <span className="flex-1 text-gray-300 truncate">{a.symbol}</span>
                      <span className="w-16 text-right text-cyan-400 font-mono">{formatNumber(a.count)}</span>
                      <span className="w-14 text-right text-gray-400">{a.days.toFixed(1)}d</span>
                      <span className="w-16 text-right text-gray-500">{timestampToDate(a.newest)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-xs text-gray-500">
                {serverOnline ? '데이터 없음' : '서버 오프라인'}
              </div>
            )}
          </div>

          {/* 섹션 4: 로컬 IndexedDB 현황 */}
          <div className="bg-gray-900 rounded-md p-3 space-y-2">
            <div className="text-xs text-gray-500 mb-1 font-semibold uppercase">Local DB (IndexedDB)</div>
            {indexedDBStats ? (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">총 캔들</span>
                  <span className="text-cyan-400 font-bold">{formatNumber(indexedDBStats.totalCandles)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">티커 수</span>
                  <span className="text-gray-300">{indexedDBStats.tickers.length}개</span>
                </div>
                {indexedDBStats.oldestTimestamp && indexedDBStats.newestTimestamp && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">기간</span>
                    <span className="text-gray-300">
                      {timestampToDate(indexedDBStats.oldestTimestamp)} ~ {timestampToDate(indexedDBStats.newestTimestamp)}
                    </span>
                  </div>
                )}
                {indexedDBStats.tickers.length > 0 && (
                  <div className="space-y-0.5 max-h-24 overflow-y-auto mt-1">
                    {indexedDBStats.tickers
                      .sort((a, b) => b.count - a.count)
                      .map(t => (
                      <div key={`${t.ticker}-${t.interval}`} className="flex justify-between text-xs px-1">
                        <span className="text-gray-400 truncate">{t.ticker}</span>
                        <span className="text-gray-500 font-mono">{formatNumber(t.count)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs text-gray-500">로딩 중...</div>
            )}
          </div>

          {/* 섹션 5: Tick Buffer 통계 */}
          <div className="bg-gray-900 rounded-md p-3 space-y-2">
            <div className="text-xs text-gray-500 mb-1 font-semibold uppercase">Tick Buffer / DB Ticks</div>
            {tickBufferStats ? (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">버퍼</span>
                  <span className="text-yellow-400 font-bold">{tickBufferStats.buffer.bufferSize}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">수용/드롭</span>
                  <span>
                    <span className="text-green-400 font-bold">{formatNumber(tickBufferStats.buffer.accepted)}</span>
                    <span className="text-gray-500"> / </span>
                    <span className="text-red-400">{formatNumber(tickBufferStats.buffer.dropped)}</span>
                    {tickBufferStats.buffer.accepted + tickBufferStats.buffer.dropped > 0 && (
                      <span className="text-gray-500 text-xs ml-1">
                        ({((tickBufferStats.buffer.accepted / (tickBufferStats.buffer.accepted + tickBufferStats.buffer.dropped)) * 100).toFixed(0)}%)
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">플러시됨</span>
                  <span className="text-cyan-400 font-bold">{formatNumber(tickBufferStats.buffer.flushed)}</span>
                </div>
                {tickBufferStats.buffer.flushErrors > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">플러시 에러</span>
                    <span className="text-red-400 font-bold">{tickBufferStats.buffer.flushErrors}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">리텐션 삭제</span>
                  <span className="text-gray-300">{formatNumber(tickBufferStats.buffer.retentionDeleted)}</span>
                </div>
                <div className="border-t border-gray-700 my-1" />
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">DB 틱 수</span>
                  <span className="text-cyan-400 font-bold">{formatNumber(tickBufferStats.db.count)}</span>
                </div>
                {tickBufferStats.db.oldestTimestamp && tickBufferStats.db.newestTimestamp && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">틱 기간</span>
                    <span className="text-gray-300">
                      {timestampToDate(tickBufferStats.db.oldestTimestamp)} ~ {timestampToDate(tickBufferStats.db.newestTimestamp)}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs text-gray-500">Background 미연결</div>
            )}
          </div>

          {/* 진단 버튼 */}
          <div className="flex gap-2">
            <button
              onClick={handleFlushNow}
              className="flex-1 py-1.5 rounded text-xs text-gray-400 hover:text-white bg-gray-900 hover:bg-gray-700 transition-colors border border-gray-700"
            >
              Flush Now
            </button>
            <button
              onClick={handleRetentionNow}
              className="flex-1 py-1.5 rounded text-xs text-gray-400 hover:text-white bg-gray-900 hover:bg-gray-700 transition-colors border border-gray-700"
            >
              Run Retention
            </button>
          </div>

          {/* 새로고침 버튼 */}
          <button
            onClick={handleRefresh}
            className="w-full py-2 rounded text-sm text-gray-400 hover:text-white bg-gray-900 hover:bg-gray-700 transition-colors"
          >
            🔄 새로고침
          </button>
        </div>
      )}
    </div>
  )
}
