import { useState, useEffect, useCallback } from 'react'
import { Signal } from '../../lib/signals/types'
import { formatMoney, formatPercent, formatNumber } from '../utils/format'
import { usePortSubscription } from '../hooks/usePortSubscription'

interface SignalPanelProps {
  onSignal?: (signal: Signal) => void
}

interface SystemStatus {
  initialized: boolean
  modules: {
    dataCollector: boolean
    candleCollector: boolean
    payoutMonitor: boolean
  }
  config: {
    enabled: boolean
    autoAssetSwitch: boolean
    minPayout: number
    tradeAmount: number
    onlyRSI: boolean
  }
  signals: {
    total: number
    wins: number
    losses: number
    pending: number
    winRate: number
  } | null
  highPayoutAssets: number
  candleCount: Array<{ ticker: string; count: number }>
}

interface AssetPayout {
  name: string
  payout: number
  isOTC: boolean
}

export function SignalPanel({ onSignal }: SignalPanelProps) {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [signals, setSignals] = useState<Signal[]>([])
  const [highPayoutAssets, setHighPayoutAssets] = useState<AssetPayout[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Send message to content script
  const sendMessage = useCallback(async (type: string, payload?: unknown) => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error('No active tab')
      
      return await chrome.tabs.sendMessage(tab.id, { type, payload })
    } catch (err) {
      console.error('Message error:', err)
      throw err
    }
  }, [])

  // Fetch V2 status
  const fetchStatus = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await sendMessage('GET_STATUS_V2') as SystemStatus
      setStatus(result)
      
      // Fetch signals
      const signalList = await sendMessage('GET_SIGNALS', { limit: 20 }) as Signal[]
      setSignals(signalList || [])
      
      // Fetch high payout assets
      const assets = await sendMessage('GET_HIGH_PAYOUT_ASSETS') as AssetPayout[]
      setHighPayoutAssets(assets || [])
    } catch (err) {
      setError('확장 프로그램 연결 실패. 페이지를 새로고침하거나 Pocket Option 탭을 활성화하세요.')
      console.error('Failed to fetch status:', err)
    }
    setIsLoading(false)
  }, [sendMessage])

  // Start/Stop trading
  const toggleTrading = async () => {
    try {
      const type = status?.config.enabled ? 'STOP_TRADING_V2' : 'START_TRADING_V2'
      await sendMessage(type)
      await fetchStatus()
    } catch (err) {
      setError('Failed to toggle trading')
    }
  }

  // Initial fetch
  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // Subscribe to new signals via port (replaces onMessage listener + autoRefresh polling)
  const handleNewSignal = useCallback((payload: unknown) => {
    if (payload) {
      const { signal } = payload as { signal: Signal }
      setSignals(prev => [signal, ...prev].slice(0, 20))
      onSignal?.(signal)
    }
  }, [onSignal])
  usePortSubscription('NEW_SIGNAL_V2', handleNewSignal)

  // Subscribe to payout updates via port
  const handlePayoutUpdate = useCallback((payload: unknown) => {
    if (payload) {
      const { name, payout } = payload as { name: string; payout: number }
      setHighPayoutAssets(prev => {
        const exists = prev.some(a => a.name === name)
        if (exists) return prev.map(a => a.name === name ? { ...a, payout } : a)
        return [...prev, { name, payout, isOTC: name.includes('OTC') }].slice(0, 10)
      })
    }
  }, [])
  usePortSubscription('BEST_ASSET', handlePayoutUpdate)

  // Fallback: auto refresh for full status sync (optional, off by default)
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(fetchStatus, 10000) // Reduced from 5s to 10s
    return () => clearInterval(interval)
  }, [autoRefresh, fetchStatus])

  if (error) {
    return (
      <div className="bg-pocket-dark rounded-lg p-4">
        <div className="text-center text-yellow-400 py-4">
          ⚠️ {error}
        </div>
        <button
          onClick={fetchStatus}
          className="w-full bg-pocket-green hover:bg-pocket-green/80 text-white font-medium py-2 px-4 rounded-lg transition"
        >
          🔄 다시 시도
        </button>
      </div>
    )
  }

  return (
    <div className="bg-pocket-dark rounded-lg p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">🎯 Signal Generator V2</h2>
        <span className={`text-xs px-2 py-1 rounded ${
          status?.initialized ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
        }`}>
          {status?.initialized ? '● Connected' : '○ Offline'}
        </span>
      </div>

      {/* System Status */}
      {status && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className={`rounded p-2 ${status.modules.candleCollector ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
            <div className="text-xs text-gray-400">Candles</div>
            <div className="text-sm font-bold text-white">
              {status.candleCount.reduce((sum, c) => sum + c.count, 0)}
            </div>
          </div>
          <div className={`rounded p-2 ${status.modules.payoutMonitor ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
            <div className="text-xs text-gray-400">92%+ Assets</div>
            <div className="text-sm font-bold text-white">{status.highPayoutAssets}</div>
          </div>
          <div className="rounded p-2 bg-blue-500/10">
            <div className="text-xs text-gray-400">Win Rate</div>
            <div className="text-sm font-bold text-white">
              {formatPercent(status.signals?.winRate)}%
            </div>
          </div>
        </div>
      )}

      {/* High Payout Assets */}
      {highPayoutAssets.length > 0 && (
        <div className="rounded-lg p-3 bg-yellow-500/10 border border-yellow-500/30">
          <div className="text-xs text-yellow-400 mb-2">💰 High Payout Assets</div>
          <div className="flex flex-wrap gap-1">
            {highPayoutAssets.slice(0, 5).map(asset => (
              <span key={asset.name} className="text-xs bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded">
                {asset.name} ({asset.payout}%)
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-2">
        <button
          onClick={fetchStatus}
          disabled={isLoading}
          className="flex-1 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg transition"
        >
          {isLoading ? '⏳ Loading...' : '🔄 Refresh'}
        </button>
        <button
          onClick={toggleTrading}
          className={`flex-1 font-medium py-2 px-4 rounded-lg transition ${
            status?.config.enabled
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-pocket-green hover:bg-pocket-green/80 text-white'
          }`}
        >
          {status?.config.enabled ? '⏹️ Stop' : '▶️ Start'} Trading
        </button>
        <button
          onClick={() => setAutoRefresh(!autoRefresh)}
          className={`px-4 py-2 rounded-lg font-medium transition ${
            autoRefresh 
              ? 'bg-pocket-green text-white' 
              : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
          }`}
        >
          {autoRefresh ? '⏸️' : '🔁'}
        </button>
      </div>

      {status?.config.enabled && (
        <div className="text-xs text-green-400 text-center animate-pulse">
          🤖 Auto Trading Active (RSI V2)
        </div>
      )}

      {autoRefresh && (
        <div className="text-xs text-gray-400 text-center">
          Auto-refresh every 5 seconds
        </div>
      )}

      {/* Signal Statistics */}
      {status?.signals && status.signals.total > 0 && (
        <div className="rounded-lg p-3 bg-gray-700/50">
          <div className="text-sm text-gray-400 mb-2">📊 Session Stats</div>
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div>
              <div className="text-gray-500">Total</div>
              <div className="text-white font-bold">{status.signals.total}</div>
            </div>
            <div>
              <div className="text-green-500">Wins</div>
              <div className="text-green-400 font-bold">{status.signals.wins}</div>
            </div>
            <div>
              <div className="text-red-500">Losses</div>
              <div className="text-red-400 font-bold">{status.signals.losses}</div>
            </div>
            <div>
              <div className="text-yellow-500">Pending</div>
              <div className="text-yellow-400 font-bold">{status.signals.pending}</div>
            </div>
          </div>
        </div>
      )}

      {/* Signal List */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-gray-400">Recent Signals</h3>
        
        {signals.length === 0 ? (
          <div className="text-center text-gray-500 py-4">
            No signals yet. Collecting data...
          </div>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {signals.map((signal) => (
              <SignalCard key={signal.id} signal={signal} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SignalCard({ signal }: { signal: Signal }) {
  const isCall = signal.direction === 'CALL'
  
  return (
    <div className={`rounded-lg p-3 border ${
      isCall 
        ? 'bg-green-500/10 border-green-500/30' 
        : 'bg-red-500/10 border-red-500/30'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-2xl ${isCall ? 'text-green-400' : 'text-red-400'}`}>
            {isCall ? '📈' : '📉'}
          </span>
          <div>
            <div className={`font-bold ${isCall ? 'text-green-400' : 'text-red-400'}`}>
              {signal.direction}
            </div>
            <div className="text-xs text-gray-400">
              {signal.strategy}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-white font-mono">
            ${formatMoney(signal.entryPrice)}
          </div>
          <div className="text-xs text-gray-400">
            {new Date(signal.timestamp).toLocaleTimeString()}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
        <span>{signal.symbol}</span>
        <span className={`px-1 rounded ${
          signal.regime.includes('uptrend') ? 'bg-green-500/20 text-green-400' :
          signal.regime.includes('downtrend') ? 'bg-red-500/20 text-red-400' :
          'bg-yellow-500/20 text-yellow-400'
        }`}>
          {signal.regime.replace('_', ' ')}
        </span>
        <span>Conf: {formatNumber(signal.confidence * 100)}%</span>
        <span className={`px-2 py-0.5 rounded ${
          signal.status === 'win' ? 'bg-green-500/20 text-green-400' :
          signal.status === 'loss' ? 'bg-red-500/20 text-red-400' :
          'bg-gray-500/20 text-gray-400'
        }`}>
          {signal.status}
        </span>
      </div>
    </div>
  )
}

export default SignalPanel
