import React, { useState, useEffect } from 'react'
import { Signal, MarketRegime } from '../../lib/signals/types'
import { getSignalGenerator, fetchCandles, runDemoCheck } from '../../lib/signals/signal-generator'

interface SignalPanelProps {
  onSignal?: (signal: Signal) => void
}

export function SignalPanel({ onSignal }: SignalPanelProps) {
  const [regime, setRegime] = useState<{ regime: MarketRegime; adx: number; direction: number } | null>(null)
  const [signals, setSignals] = useState<Signal[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [symbol, setSymbol] = useState('BTCUSDT')

  const checkSignal = async () => {
    setIsLoading(true)
    try {
      const result = await runDemoCheck(symbol)
      setRegime(result.regime)
      
      if (result.signal) {
        setSignals(prev => [result.signal!, ...prev].slice(0, 20))
        onSignal?.(result.signal)
      }
    } catch (error) {
      console.error('Failed to check signal:', error)
    }
    setIsLoading(false)
  }

  useEffect(() => {
    checkSignal()
  }, [symbol])

  useEffect(() => {
    if (!autoRefresh) return
    
    const interval = setInterval(checkSignal, 10000) // Check every 10s
    return () => clearInterval(interval)
  }, [autoRefresh, symbol])

  const getRegimeColor = (regime: MarketRegime) => {
    switch (regime) {
      case 'strong_uptrend': return 'text-green-400 bg-green-400/10'
      case 'weak_uptrend': return 'text-green-300 bg-green-300/10'
      case 'ranging': return 'text-yellow-400 bg-yellow-400/10'
      case 'weak_downtrend': return 'text-red-300 bg-red-300/10'
      case 'strong_downtrend': return 'text-red-400 bg-red-400/10'
      default: return 'text-gray-400 bg-gray-400/10'
    }
  }

  const getDirectionIcon = (direction: number) => {
    if (direction > 0) return '📈'
    if (direction < 0) return '📉'
    return '↔️'
  }

  return (
    <div className="bg-pocket-dark rounded-lg p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">🎯 Signal Generator</h2>
        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          className="bg-pocket-darker text-white text-sm rounded px-2 py-1 border border-gray-600"
        >
          <option value="BTCUSDT">BTC/USDT</option>
          <option value="ETHUSDT">ETH/USDT</option>
          <option value="BNBUSDT">BNB/USDT</option>
        </select>
      </div>

      {/* Market Regime */}
      {regime && (
        <div className={`rounded-lg p-3 ${getRegimeColor(regime.regime)}`}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Market Regime</span>
            <span className="text-lg">{getDirectionIcon(regime.direction)}</span>
          </div>
          <div className="mt-1 text-lg font-bold capitalize">
            {regime.regime.replace('_', ' ')}
          </div>
          <div className="mt-1 text-xs opacity-75">
            ADX: {regime.adx.toFixed(1)} | Direction: {regime.direction > 0 ? 'Up' : regime.direction < 0 ? 'Down' : 'Neutral'}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-2">
        <button
          onClick={checkSignal}
          disabled={isLoading}
          className="flex-1 bg-pocket-green hover:bg-pocket-green/80 disabled:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition"
        >
          {isLoading ? '⏳ Checking...' : '🔍 Check Now'}
        </button>
        <button
          onClick={() => setAutoRefresh(!autoRefresh)}
          className={`px-4 py-2 rounded-lg font-medium transition ${
            autoRefresh 
              ? 'bg-pocket-green text-white' 
              : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
          }`}
        >
          {autoRefresh ? '⏸️' : '▶️'}
        </button>
      </div>

      {autoRefresh && (
        <div className="text-xs text-gray-400 text-center">
          Auto-refresh every 10 seconds
        </div>
      )}

      {/* Signal List */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-gray-400">Recent Signals</h3>
        
        {signals.length === 0 ? (
          <div className="text-center text-gray-500 py-4">
            No signals yet. Click "Check Now" to scan.
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
            ${signal.entryPrice.toFixed(2)}
          </div>
          <div className="text-xs text-gray-400">
            {new Date(signal.timestamp).toLocaleTimeString()}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
        <span>{signal.symbol}</span>
        <span>Expiry: {signal.expiry}s</span>
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
