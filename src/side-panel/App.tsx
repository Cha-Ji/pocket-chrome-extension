import React, { useState, useEffect } from 'react'
import { TradingStatus } from '../lib/types'
import { StatusCard } from './components/StatusCard'
import { ControlPanel } from './components/ControlPanel'
import { LogViewer } from './components/LogViewer'
import { useTradingStatus } from './hooks/useTradingStatus'
import { useLogs } from './hooks/useLogs'

export default function App() {
  const { status, startTrading, stopTrading, isLoading } = useTradingStatus()
  const { logs, addLog, clearLogs } = useLogs()

  useEffect(() => {
    addLog('info', 'Side panel initialized')
  }, [])

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

      {/* Status Card */}
      <StatusCard status={status} />

      {/* Control Panel */}
      <ControlPanel
        isRunning={status.isRunning}
        isLoading={isLoading}
        onStart={handleStart}
        onStop={handleStop}
      />

      {/* Log Viewer */}
      <LogViewer logs={logs} onClear={clearLogs} />
    </div>
  )
}
