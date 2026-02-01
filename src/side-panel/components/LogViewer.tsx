import React, { useRef, useEffect } from 'react'
import { LogEntry } from '../hooks/useLogs'

interface LogViewerProps {
  logs: LogEntry[]
  onClear: () => void
}

export function LogViewer({ logs, onClear }: LogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs])

  return (
    <div className="bg-pocket-dark rounded-lg p-4 flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
          Logs
        </h2>
        <button
          onClick={onClear}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          Clear
        </button>
      </div>
      
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto space-y-1 font-mono text-xs"
        style={{ maxHeight: '200px' }}
      >
        {logs.length === 0 ? (
          <div className="text-gray-600 text-center py-4">No logs yet</div>
        ) : (
          logs.map((log) => (
            <LogLine key={log.id} log={log} />
          ))
        )}
      </div>
    </div>
  )
}

function LogLine({ log }: { log: LogEntry }) {
  const levelColors = {
    info: 'text-blue-400',
    success: 'text-pocket-green',
    warning: 'text-yellow-400',
    error: 'text-pocket-red',
  }

  const time = new Date(log.timestamp).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  return (
    <div className="flex gap-2">
      <span className="text-gray-600">{time}</span>
      <span className={levelColors[log.level]}>[{log.level.toUpperCase()}]</span>
      <span className="text-gray-300">{log.message}</span>
    </div>
  )
}
