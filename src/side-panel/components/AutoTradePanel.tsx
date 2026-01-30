import React, { useState, useEffect, useCallback } from 'react'
import { AutoTrader, AutoTraderConfig, AutoTraderStats, TradeExecution, getAutoTrader } from '../../lib/trading/auto-trader'

export function AutoTradePanel() {
  const [trader] = useState(() => getAutoTrader({ demoMode: true }))
  const [isRunning, setIsRunning] = useState(false)
  const [stats, setStats] = useState<AutoTraderStats>({
    todayTrades: 0,
    todayWins: 0,
    todayLosses: 0,
    todayProfit: 0,
    lastTradeTime: 0,
  })
  const [executions, setExecutions] = useState<TradeExecution[]>([])
  const [logs, setLogs] = useState<{ time: string; message: string; level: string }[]>([])
  const [config, setConfig] = useState<AutoTraderConfig>(trader.getConfig())

  useEffect(() => {
    trader.setLogCallback((message, level) => {
      setLogs(prev => [...prev.slice(-50), {
        time: new Date().toLocaleTimeString(),
        message,
        level,
      }])
    })

    trader.setResultCallback((execution) => {
      setStats(trader.getStats())
      setExecutions(trader.getExecutions())
    })

    // Poll stats
    const interval = setInterval(() => {
      if (isRunning) {
        setStats(trader.getStats())
        setExecutions(trader.getExecutions())
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [trader, isRunning])

  const handleStart = () => {
    trader.updateConfig(config)
    trader.start()
    setIsRunning(true)
  }

  const handleStop = () => {
    trader.stop()
    setIsRunning(false)
  }

  const winRate = stats.todayTrades > 0 
    ? ((stats.todayWins / stats.todayTrades) * 100).toFixed(1) 
    : '0.0'

  return (
    <div className="bg-pocket-dark rounded-lg p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">🤖 Auto Trader</h2>
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          config.demoMode 
            ? 'bg-yellow-500/20 text-yellow-400' 
            : 'bg-red-500/20 text-red-400'
        }`}>
          {config.demoMode ? 'DEMO' : 'LIVE'}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-pocket-darker rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-white">{stats.todayTrades}</div>
          <div className="text-xs text-gray-400">Today's Trades</div>
        </div>
        <div className="bg-pocket-darker rounded-lg p-3 text-center">
          <div className={`text-2xl font-bold ${parseFloat(winRate) >= 53 ? 'text-green-400' : 'text-red-400'}`}>
            {winRate}%
          </div>
          <div className="text-xs text-gray-400">Win Rate</div>
        </div>
        <div className="bg-pocket-darker rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-white">
            <span className="text-green-400">{stats.todayWins}</span>
            <span className="text-gray-500"> / </span>
            <span className="text-red-400">{stats.todayLosses}</span>
          </div>
          <div className="text-xs text-gray-400">W / L</div>
        </div>
        <div className="bg-pocket-darker rounded-lg p-3 text-center">
          <div className={`text-2xl font-bold ${stats.todayProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            ${stats.todayProfit.toFixed(0)}
          </div>
          <div className="text-xs text-gray-400">P/L</div>
        </div>
      </div>

      {/* Config */}
      {!isRunning && (
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-gray-400">Amount ($)</label>
              <input
                type="number"
                value={config.amount}
                onChange={(e) => setConfig({ ...config, amount: parseFloat(e.target.value) || 1 })}
                className="w-full mt-1 bg-pocket-darker text-white text-sm rounded px-3 py-2 border border-gray-600"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-400">Expiry (sec)</label>
              <input
                type="number"
                value={config.expiry}
                onChange={(e) => setConfig({ ...config, expiry: parseInt(e.target.value) || 60 })}
                className="w-full mt-1 bg-pocket-darker text-white text-sm rounded px-3 py-2 border border-gray-600"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-gray-400">Max Daily Trades</label>
              <input
                type="number"
                value={config.maxDailyTrades}
                onChange={(e) => setConfig({ ...config, maxDailyTrades: parseInt(e.target.value) || 20 })}
                className="w-full mt-1 bg-pocket-darker text-white text-sm rounded px-3 py-2 border border-gray-600"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-400">Max Daily Loss ($)</label>
              <input
                type="number"
                value={config.maxDailyLoss}
                onChange={(e) => setConfig({ ...config, maxDailyLoss: parseFloat(e.target.value) || 100 })}
                className="w-full mt-1 bg-pocket-darker text-white text-sm rounded px-3 py-2 border border-gray-600"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="demoMode"
              checked={config.demoMode}
              onChange={(e) => setConfig({ ...config, demoMode: e.target.checked })}
              className="rounded"
            />
            <label htmlFor="demoMode" className="text-sm text-gray-300">Demo Mode (no real trades)</label>
          </div>
        </div>
      )}

      {/* Control Button */}
      <button
        onClick={isRunning ? handleStop : handleStart}
        className={`w-full py-3 rounded-lg font-bold transition ${
          isRunning
            ? 'bg-red-500 hover:bg-red-600 text-white'
            : 'bg-pocket-green hover:bg-pocket-green/80 text-white'
        }`}
      >
        {isRunning ? '⏹️ Stop Trading' : '▶️ Start Trading'}
      </button>

      {/* Recent Executions */}
      {executions.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-2">Recent Trades</h3>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {executions.slice(-5).reverse().map((exec, i) => (
              <div key={i} className={`flex items-center justify-between p-2 rounded ${
                exec.result === 'WIN' ? 'bg-green-500/10' :
                exec.result === 'LOSS' ? 'bg-red-500/10' :
                'bg-gray-500/10'
              }`}>
                <div className="flex items-center gap-2">
                  <span className={exec.direction === 'CALL' ? 'text-green-400' : 'text-red-400'}>
                    {exec.direction}
                  </span>
                  <span className="text-xs text-gray-400">
                    ${exec.entryPrice.toFixed(2)}
                  </span>
                </div>
                <div className="text-right">
                  {exec.result ? (
                    <span className={exec.result === 'WIN' ? 'text-green-400' : 'text-red-400'}>
                      {exec.result} ${exec.profit?.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-yellow-400">Pending...</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live Log */}
      {isRunning && logs.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-2">Live Log</h3>
          <div className="bg-pocket-darker rounded p-2 max-h-32 overflow-y-auto font-mono text-xs">
            {logs.slice(-10).map((log, i) => (
              <div key={i} className={`${
                log.level === 'success' ? 'text-green-400' :
                log.level === 'error' ? 'text-red-400' :
                log.level === 'warning' ? 'text-yellow-400' :
                'text-gray-400'
              }`}>
                [{log.time}] {log.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default AutoTradePanel
