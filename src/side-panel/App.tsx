import React, { useState, useEffect } from 'react'
import { TradingStatus } from '../lib/types'
import { StatusCard } from './components/StatusCard'
import { ControlPanel } from './components/ControlPanel'
import { LogViewer } from './components/LogViewer'
import { SignalPanel } from './components/SignalPanel'
import { AutoTradePanel } from './components/AutoTradePanel'
import { SettingsPanel } from './components/SettingsPanel'
import { Dashboard } from './components/Dashboard'
import { useTradingStatus } from './hooks/useTradingStatus'
import { useLogs } from './hooks/useLogs'
import { useTrades } from './hooks/useTrades'
import { Signal } from '../lib/signals/types'

export default function App() {
  const { status, startTrading, stopTrading, isLoading } = useTradingStatus()
  const { logs, addLog, clearLogs } = useLogs()
  const { trades } = useTrades()
  const [activeTab, setActiveTab] = useState<'signals' | 'auto' | 'status' | 'logs' | 'settings'>('signals')

  useEffect(() => {
    addLog('info', 'Side panel initialized')
  }, [])

  const handleSignal = (signal: Signal) => {
    addLog('success', `🎯 ${signal.direction} signal: ${signal.strategy} @ $${signal.entryPrice.toFixed(2)}`)
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

      {activeTab === 'settings' && (
        <SettingsPanel />
      )}
    </div>
  )
}
