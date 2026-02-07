
interface ControlPanelProps {
  isRunning: boolean
  isLoading: boolean
  onStart: () => void
  onStop: () => void
}

export function ControlPanel({ isRunning, isLoading, onStart, onStop }: ControlPanelProps) {
  return (
    <div className="bg-pocket-dark rounded-lg p-4 space-y-3">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
        Controls
      </h2>
      
      <div className="flex gap-2">
        {!isRunning ? (
          <button
            onClick={onStart}
            disabled={isLoading}
            className="flex-1 bg-pocket-green hover:bg-pocket-green/80 disabled:bg-gray-600 
                       text-white font-medium py-2 px-4 rounded-lg transition-colors
                       disabled:cursor-not-allowed"
          >
            {isLoading ? 'Starting...' : '▶ Start Trading'}
          </button>
        ) : (
          <button
            onClick={onStop}
            disabled={isLoading}
            className="flex-1 bg-pocket-red hover:bg-pocket-red/80 disabled:bg-gray-600 
                       text-white font-medium py-2 px-4 rounded-lg transition-colors
                       disabled:cursor-not-allowed"
          >
            {isLoading ? 'Stopping...' : '⏹ Stop Trading'}
          </button>
        )}
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2">
        <button
          className="flex-1 bg-pocket-dark border border-gray-600 hover:border-gray-500
                     text-gray-300 text-sm py-1.5 px-3 rounded transition-colors"
        >
          📊 Backtest
        </button>
        <button
          className="flex-1 bg-pocket-dark border border-gray-600 hover:border-gray-500
                     text-gray-300 text-sm py-1.5 px-3 rounded transition-colors"
        >
          ⚙️ Settings
        </button>
      </div>
    </div>
  )
}
