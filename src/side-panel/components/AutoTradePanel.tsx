import { useState, useEffect } from 'react';
import {
  AutoTraderConfig,
  AutoTraderStats,
  TradeExecution,
  getAutoTrader,
} from '../../lib/trading/auto-trader';
import { formatMoney, formatPercent, formatNumber } from '../utils/format';

export function AutoTradePanel() {
  const [trader] = useState(() => getAutoTrader({ demoMode: true }));
  const [isRunning, setIsRunning] = useState(false);
  const [stats, setStats] = useState<AutoTraderStats>({
    todayTrades: 0,
    todayWins: 0,
    todayLosses: 0,
    todayProfit: 0,
    lastTradeTime: 0,
    currentBalance: 1000,
    peakBalance: 1000,
    currentDrawdown: 0,
    maxDrawdownHit: 0,
    consecutiveLosses: 0,
    consecutiveWins: 0,
    longestLossStreak: 0,
    longestWinStreak: 0,
    isHalted: false,
    haltReason: null,
  });
  const [executions, setExecutions] = useState<TradeExecution[]>([]);
  const [logs, setLogs] = useState<{ time: string; message: string; level: string }[]>([]);
  const [config, setConfig] = useState<AutoTraderConfig>(trader.getConfig());

  useEffect(() => {
    trader.setLogCallback((message, level) => {
      setLogs((prev) => [
        ...prev.slice(-50),
        {
          time: new Date().toLocaleTimeString(),
          message,
          level,
        },
      ]);
    });

    trader.setResultCallback((_execution) => {
      setStats(trader.getStats());
      setExecutions(trader.getExecutions());
    });

    // Poll stats
    const interval = setInterval(() => {
      if (isRunning) {
        setStats(trader.getStats());
        setExecutions(trader.getExecutions());
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [trader, isRunning]);

  const handleStart = () => {
    trader.updateConfig(config);
    trader.start();
    setIsRunning(true);
  };

  const handleStop = () => {
    trader.stop();
    setIsRunning(false);
  };

  const winRate =
    stats.todayTrades > 0 ? formatPercent((stats.todayWins / stats.todayTrades) * 100) : '0.0';

  return (
    <div className="bg-pocket-dark rounded-lg p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">🤖 Auto Trader</h2>
        <span
          className={`px-2 py-1 rounded text-xs font-medium ${
            config.demoMode ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'
          }`}
        >
          {config.demoMode ? 'DEMO' : 'LIVE'}
        </span>
      </div>

      {/* Halt Warning */}
      {stats.isHalted && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-red-400 font-medium">🛑 Trading Halted</div>
              <div className="text-xs text-red-300">{stats.haltReason}</div>
            </div>
            <button
              onClick={() => {
                trader.resume();
                setStats(trader.getStats());
              }}
              className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-sm rounded"
            >
              Resume
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-pocket-darker rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-white">${formatNumber(stats.currentBalance)}</div>
          <div className="text-xs text-gray-400">Balance</div>
        </div>
        <div className="bg-pocket-darker rounded-lg p-2 text-center">
          <div
            className={`text-lg font-bold ${parseFloat(winRate) >= 53 ? 'text-green-400' : 'text-red-400'}`}
          >
            {winRate}%
          </div>
          <div className="text-xs text-gray-400">Win Rate</div>
        </div>
        <div className="bg-pocket-darker rounded-lg p-2 text-center">
          <div
            className={`text-lg font-bold ${stats.currentDrawdown > 10 ? 'text-red-400' : 'text-yellow-400'}`}
          >
            {formatPercent(stats.currentDrawdown)}%
          </div>
          <div className="text-xs text-gray-400">Drawdown</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-pocket-darker rounded-lg p-2 text-center">
          <div className="text-sm font-bold text-white">{stats.todayTrades}</div>
          <div className="text-xs text-gray-400">Trades</div>
        </div>
        <div className="bg-pocket-darker rounded-lg p-2 text-center">
          <div className="text-sm font-bold">
            <span className="text-green-400">{stats.todayWins}</span>
            <span className="text-gray-500">/</span>
            <span className="text-red-400">{stats.todayLosses}</span>
          </div>
          <div className="text-xs text-gray-400">W/L</div>
        </div>
        <div className="bg-pocket-darker rounded-lg p-2 text-center">
          <div
            className={`text-sm font-bold ${stats.todayProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}
          >
            ${formatNumber(stats.todayProfit)}
          </div>
          <div className="text-xs text-gray-400">P/L</div>
        </div>
      </div>

      {/* Streak indicator */}
      {(stats.consecutiveLosses >= 2 || stats.consecutiveWins >= 2) && (
        <div
          className={`text-center text-sm py-1 rounded ${
            stats.consecutiveWins >= 2
              ? 'bg-green-500/20 text-green-400'
              : 'bg-red-500/20 text-red-400'
          }`}
        >
          {stats.consecutiveWins >= 2
            ? `🔥 ${stats.consecutiveWins} wins in a row!`
            : `⚠️ ${stats.consecutiveLosses} losses in a row`}
        </div>
      )}

      {/* Config */}
      {!isRunning && (
        <div className="space-y-3">
          {/* Balance & Risk */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-gray-400">Initial Balance ($)</label>
              <input
                type="number"
                value={config.initialBalance}
                onChange={(e) =>
                  setConfig({ ...config, initialBalance: parseFloat(e.target.value) || 1000 })
                }
                className="w-full mt-1 bg-pocket-darker text-white text-sm rounded px-3 py-2 border border-gray-600"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-400">Risk per Trade (%)</label>
              <input
                type="number"
                step="0.5"
                value={config.riskPerTrade}
                onChange={(e) =>
                  setConfig({ ...config, riskPerTrade: parseFloat(e.target.value) || 1 })
                }
                className="w-full mt-1 bg-pocket-darker text-white text-sm rounded px-3 py-2 border border-gray-600"
              />
            </div>
          </div>

          {/* Position size preview */}
          <div className="bg-pocket-darker/50 rounded p-2 text-xs text-gray-400 text-center">
            Position size:{' '}
            <span className="text-white font-medium">
              ${formatMoney((config.initialBalance * config.riskPerTrade) / 100)}
            </span>{' '}
            per trade ({config.riskPerTrade}% of ${config.initialBalance})
          </div>

          {/* Limits */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-gray-400">Max Drawdown (%)</label>
              <input
                type="number"
                value={config.maxDrawdown}
                onChange={(e) =>
                  setConfig({ ...config, maxDrawdown: parseFloat(e.target.value) || 20 })
                }
                className="w-full mt-1 bg-pocket-darker text-white text-sm rounded px-3 py-2 border border-gray-600"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-400">Max Loss Streak</label>
              <input
                type="number"
                value={config.maxConsecutiveLosses}
                onChange={(e) =>
                  setConfig({ ...config, maxConsecutiveLosses: parseInt(e.target.value) || 5 })
                }
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
                onChange={(e) =>
                  setConfig({ ...config, maxDailyTrades: parseInt(e.target.value) || 20 })
                }
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

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="demoMode"
              checked={config.demoMode}
              onChange={(e) => setConfig({ ...config, demoMode: e.target.checked })}
              className="rounded"
            />
            <label htmlFor="demoMode" className="text-sm text-gray-300">
              Demo Mode (시뮬레이션)
            </label>
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
            {executions
              .slice(-5)
              .reverse()
              .map((exec, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between p-2 rounded ${
                    exec.result === 'WIN'
                      ? 'bg-green-500/10'
                      : exec.result === 'LOSS'
                        ? 'bg-red-500/10'
                        : 'bg-gray-500/10'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={exec.direction === 'CALL' ? 'text-green-400' : 'text-red-400'}>
                      {exec.direction}
                    </span>
                    <span className="text-xs text-gray-400">${formatMoney(exec.entryPrice)}</span>
                  </div>
                  <div className="text-right">
                    {exec.result ? (
                      <span
                        className={
                          exec.result === 'WIN'
                            ? 'text-green-400'
                            : exec.result === 'TIE'
                              ? 'text-gray-400'
                              : 'text-red-400'
                        }
                      >
                        {exec.result} ${formatMoney(exec.profit)}
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
              <div
                key={i}
                className={`${
                  log.level === 'success'
                    ? 'text-green-400'
                    : log.level === 'error'
                      ? 'text-red-400'
                      : log.level === 'warning'
                        ? 'text-yellow-400'
                        : 'text-gray-400'
                }`}
              >
                [{log.time}] {log.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default AutoTradePanel;
