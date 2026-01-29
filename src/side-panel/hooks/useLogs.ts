import { useState, useCallback } from 'react'

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
  const [nextId, setNextId] = useState(1)

  const addLog = useCallback((level: LogLevel, message: string) => {
    setLogs((prev) => {
      const newLog: LogEntry = {
        id: nextId,
        timestamp: Date.now(),
        level,
        message,
      }
      setNextId((id) => id + 1)
      
      const updated = [...prev, newLog]
      // Keep only last MAX_LOGS entries
      return updated.slice(-MAX_LOGS)
    })
  }, [nextId])

  const clearLogs = useCallback(() => {
    setLogs([])
  }, [])

  return {
    logs,
    addLog,
    clearLogs,
  }
}
