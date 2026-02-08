import { useState, useEffect } from 'react'
import { ControlPanel } from './components/ControlPanel'
import { LogViewer } from './components/LogViewer'
import { SignalPanel } from './components/SignalPanel'
import { AutoTradePanel } from './components/AutoTradePanel'
import { SettingsPanel } from './components/SettingsPanel'
import { Dashboard } from './components/Dashboard'
import { AutoMinerControl } from './components/AutoMinerControl'
import { HistoryMiner } from './components/HistoryMiner'
import { DBMonitorDashboard } from './components/DBMonitorDashboard'
import { useTradingStatus } from './hooks/useTradingStatus'
import { useLogs } from './hooks/useLogs'
import { useTrades } from './hooks/useTrades'
import { Signal } from '../lib/signals/types'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Leaderboard } from './components/Leaderboard'
import type { LeaderboardEntry, LeaderboardProgress } from '../lib/backtest/leaderboard-types'
import { runLeaderboard, initializeBacktest } from '../lib/backtest'
import { CandleRepository, LeaderboardRepository } from '../lib/db'

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  )
}

function AppContent() {
  const { status, startTrading, stopTrading, isLoading } = useTradingStatus()
  const { logs, addLog, clearLogs } = useLogs()
  const { trades } = useTrades()
  const [activeTab, setActiveTab] = useState<'signals' | 'auto' | 'mining' | 'status' | 'logs' | 'leaderboard' | 'settings'>('signals')
  const [lbEntries, setLbEntries] = useState<LeaderboardEntry[]>([])
  const [lbRunning, setLbRunning] = useState(false)
  const [lbProgress, setLbProgress] = useState<LeaderboardProgress | undefined>()

  useEffect(() => {
    addLog('info', 'Side panel initialized')
    // 저장된 리더보드 데이터 로드
    LeaderboardRepository.getAll().then(entries => {
      if (entries.length > 0) setLbEntries(entries)
    }).catch(() => {})
  }, [])

  const handleRunLeaderboard = async () => {
    try {
      setLbRunning(true)
      addLog('info', 'Starting leaderboard backtest...')

      initializeBacktest()

      // DB에서 캔들 데이터 조회
      const tickers = await CandleRepository.getTickers()
      if (tickers.length === 0) {
        addLog('error', 'No candle data. Mine history data first.')
        setLbRunning(false)
        return
      }

      const ticker = tickers[0]
      const candles = await CandleRepository.getByTicker(ticker, 5, 10000)
      if (candles.length < 100) {
        addLog('error', `Not enough candles (${candles.length}). Need at least 100.`)
        setLbRunning(false)
        return
      }

      const config = {
        symbol: ticker,
        startTime: candles[0].timestamp,
        endTime: candles[candles.length - 1].timestamp,
        initialBalance: 10000,
        betAmount: 1,
        betType: 'fixed' as const,
        payout: 92,
        expirySeconds: 300,
        volumeMultiplier: 100,
        minTrades: 10,
      }

      const result = runLeaderboard(
        candles.map(c => ({ timestamp: c.timestamp, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume })),
        config,
        (progress) => setLbProgress(progress)
      )

      setLbEntries(result.entries)
      await LeaderboardRepository.saveResults(result.entries)
      addLog('success', `Leaderboard complete: ${result.entries.length} strategies ranked (${result.executionTimeMs}ms)`)
    } catch (err: unknown) {
      addLog('error', `Leaderboard error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLbRunning(false)
      setLbProgress(undefined)
    }
  }

  const handleSignal = (signal: Signal) => {
    // entryPrice can be undefined in some cases
    const price = signal.entryPrice ?? 0
    addLog('success', `🎯 ${signal.direction} signal: ${signal.strategy} @ $${price.toFixed(2)}`)
  }

  const handleStart = async () => {
    addLog('info', 'Starting auto-trading...')
    const result = await startTrading()
    if (result.success) {
      addLog('success', 'Auto-trading started')
    } else {
      addLog('error', `Failed to start: ${result.error}`)
    }
  }

  const handleStop = async () => {
    addLog('info', 'Stopping auto-trading...')
    const result = await stopTrading()
    if (result.success) {
      addLog('success', 'Auto-trading stopped')
    } else {
      addLog('error', `Failed to stop: ${result.error}`)
    }
  }

  return (
    <div className="min-h-screen bg-pocket-darker p-4 flex flex-col gap-4">
      {/* Header */}
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">
          🎯 Pocket Quant
        </h1>
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          status.isRunning 
            ? 'bg-pocket-green/20 text-pocket-green' 
            : 'bg-gray-600/20 text-gray-400'
        }`}>
          {status.isRunning ? 'RUNNING' : 'STOPPED'}
        </span>
      </header>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-pocket-dark rounded-lg p-1">
        <button
          onClick={() => setActiveTab('signals')}
          className={`flex-1 py-2 px-2 rounded-md text-xs font-medium transition ${
            activeTab === 'signals'
              ? 'bg-pocket-green text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          🎯 Signals
        </button>
        <button
          onClick={() => setActiveTab('auto')}
          className={`flex-1 py-2 px-2 rounded-md text-xs font-medium transition ${
            activeTab === 'auto'
              ? 'bg-pocket-green text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          🤖 Auto
        </button>
        <button
          onClick={() => setActiveTab('mining')}
          className={`flex-1 py-2 px-2 rounded-md text-xs font-medium transition ${
            activeTab === 'mining'
              ? 'bg-pocket-green text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          ⛏️ Mine
        </button>
        <button
          onClick={() => setActiveTab('status')}
          className={`flex-1 py-2 px-2 rounded-md text-xs font-medium transition ${
            activeTab === 'status'
              ? 'bg-pocket-green text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          📊 Status
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`flex-1 py-2 px-2 rounded-md text-xs font-medium transition ${
            activeTab === 'logs'
              ? 'bg-pocket-green text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          📜 Logs
        </button>
        <button
          onClick={() => setActiveTab('leaderboard')}
          className={`flex-1 py-2 px-2 rounded-md text-xs font-medium transition ${
            activeTab === 'leaderboard'
              ? 'bg-pocket-green text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          LB
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex-1 py-2 px-2 rounded-md text-xs font-medium transition ${
            activeTab === 'settings'
              ? 'bg-pocket-green text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          ⚙️
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'signals' && (
        <SignalPanel onSignal={handleSignal} />
      )}

      {activeTab === 'auto' && (
        <AutoTradePanel />
      )}

      {activeTab === 'mining' && (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-bold text-white">⛏️ Data Mining</h2>
          <p className="text-xs text-gray-400">
            백테스트에 필요한 캔들 데이터를 자동으로 수집합니다.
          </p>
          <AutoMinerControl />
          <HistoryMiner />
          <DBMonitorDashboard />
        </div>
      )}

      {activeTab === 'status' && (
        <>
          <Dashboard status={status} trades={trades} />
          <ControlPanel
            isRunning={status.isRunning}
            isLoading={isLoading}
            onStart={handleStart}
            onStop={handleStop}
          />
        </>
      )}

      {activeTab === 'logs' && (
        <LogViewer logs={logs} onClear={clearLogs} />
      )}

      {activeTab === 'leaderboard' && (
        <Leaderboard
          entries={lbEntries}
          isRunning={lbRunning}
          progress={lbProgress ? { completed: lbProgress.completed, total: lbProgress.total, currentStrategy: lbProgress.currentStrategy } : undefined}
          onRun={handleRunLeaderboard}
        />
      )}

      {activeTab === 'settings' && (
        <SettingsPanel />
      )}
    </div>
  )
}
