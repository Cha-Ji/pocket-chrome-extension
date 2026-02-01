import { useState, useCallback, useRef } from 'react'

export type LogLevel = 'info' | 'success' | 'warning' | 'error'

export interface LogEntry {
  id: number
  timestamp: number
  level: LogLevel
  message: string
}

const MAX_LOGS = 100

export function useLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const nextIdRef = useRef(1)

  const addLog = useCallback((level: LogLevel, message: string) => {
    const newLog: LogEntry = {
      id: nextIdRef.current++,
      timestamp: Date.now(),
      level,
      message,
    }
    
    setLogs((prev) => {
      const updated = [...prev, newLog]
      // Keep only last MAX_LOGS entries
      return updated.slice(-MAX_LOGS)
    })
  }, [])

  const clearLogs = useCallback(() => {
    setLogs([])
  }, [])

  return {
    logs,
    addLog,
    clearLogs,
  }
}
