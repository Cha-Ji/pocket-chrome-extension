import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLogs } from './useLogs'

describe('useLogs', () => {
  it('should initialize with empty logs', () => {
    const { result } = renderHook(() => useLogs())
    expect(result.current.logs).toHaveLength(0)
  })

  it('should add a log entry', () => {
    const { result } = renderHook(() => useLogs())
    
    act(() => {
      result.current.addLog('info', 'Test message')
    })
    
    expect(result.current.logs).toHaveLength(1)
    expect(result.current.logs[0].level).toBe('info')
    expect(result.current.logs[0].message).toBe('Test message')
  })

  it('should add logs with different levels', () => {
    const { result } = renderHook(() => useLogs())
    
    act(() => {
      result.current.addLog('info', 'Info message')
      result.current.addLog('success', 'Success message')
      result.current.addLog('warning', 'Warning message')
      result.current.addLog('error', 'Error message')
    })
    
    expect(result.current.logs).toHaveLength(4)
    expect(result.current.logs[0].level).toBe('info')
    expect(result.current.logs[1].level).toBe('success')
    expect(result.current.logs[2].level).toBe('warning')
    expect(result.current.logs[3].level).toBe('error')
  })

  it('should clear all logs', () => {
    const { result } = renderHook(() => useLogs())
    
    act(() => {
      result.current.addLog('info', 'Test 1')
      result.current.addLog('info', 'Test 2')
    })
    
    expect(result.current.logs).toHaveLength(2)
    
    act(() => {
      result.current.clearLogs()
    })
    
    expect(result.current.logs).toHaveLength(0)
  })

  it('should have unique ids for each log', () => {
    const { result } = renderHook(() => useLogs())
    
    act(() => {
      result.current.addLog('info', 'Test 1')
      result.current.addLog('info', 'Test 2')
      result.current.addLog('info', 'Test 3')
    })
    
    const ids = result.current.logs.map(log => log.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(3)
  })

  it('should include timestamp in log entries', () => {
    const { result } = renderHook(() => useLogs())
    const before = Date.now()
    
    act(() => {
      result.current.addLog('info', 'Test message')
    })
    
    const after = Date.now()
    const logTimestamp = result.current.logs[0].timestamp
    
    expect(logTimestamp).toBeGreaterThanOrEqual(before)
    expect(logTimestamp).toBeLessThanOrEqual(after)
  })

  it('should limit logs to MAX_LOGS (100)', () => {
    const { result } = renderHook(() => useLogs())
    
    act(() => {
      for (let i = 0; i < 150; i++) {
        result.current.addLog('info', `Message ${i}`)
      }
    })
    
    expect(result.current.logs.length).toBeLessThanOrEqual(100)
  })
})
