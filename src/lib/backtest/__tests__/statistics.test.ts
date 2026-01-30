// ============================================================
// Statistics Calculation Tests
// ============================================================

import { describe, it, expect } from 'vitest'
import { calculateStats, Trade } from './test-helpers'

describe('Statistics Calculation', () => {
  it('should calculate win rate correctly', () => {
    const trades: Trade[] = [
      { entryIdx: 0, exitIdx: 1, entryPrice: 100, exitPrice: 101, direction: 'CALL', result: 'WIN', profit: 92 },
      { entryIdx: 2, exitIdx: 3, entryPrice: 100, exitPrice: 99, direction: 'CALL', result: 'LOSS', profit: -100 },
      { entryIdx: 4, exitIdx: 5, entryPrice: 100, exitPrice: 101, direction: 'CALL', result: 'WIN', profit: 92 },
    ]

    const stats = calculateStats(trades)
    
    expect(stats.totalTrades).toBe(3)
    expect(stats.wins).toBe(2)
    expect(stats.losses).toBe(1)
    expect(stats.winRate).toBeCloseTo(66.67, 1)
  })

  it('should calculate profit factor correctly', () => {
    const trades: Trade[] = [
      { entryIdx: 0, exitIdx: 1, entryPrice: 100, exitPrice: 101, direction: 'CALL', result: 'WIN', profit: 92 },
      { entryIdx: 2, exitIdx: 3, entryPrice: 100, exitPrice: 99, direction: 'CALL', result: 'LOSS', profit: -100 },
    ]

    const stats = calculateStats(trades)
    
    // Profit factor = gross profit / gross loss = 92 / 100 = 0.92
    expect(stats.profitFactor).toBeCloseTo(0.92, 2)
  })

  it('should handle empty trades', () => {
    const stats = calculateStats([])
    
    expect(stats.totalTrades).toBe(0)
    expect(stats.winRate).toBe(0)
    expect(stats.netProfit).toBe(0)
  })

  it('should calculate CALL/PUT stats separately', () => {
    const trades: Trade[] = [
      { entryIdx: 0, exitIdx: 1, entryPrice: 100, exitPrice: 101, direction: 'CALL', result: 'WIN', profit: 92 },
      { entryIdx: 2, exitIdx: 3, entryPrice: 100, exitPrice: 99, direction: 'PUT', result: 'WIN', profit: 92 },
      { entryIdx: 4, exitIdx: 5, entryPrice: 100, exitPrice: 101, direction: 'CALL', result: 'WIN', profit: 92 },
      { entryIdx: 6, exitIdx: 7, entryPrice: 100, exitPrice: 101, direction: 'PUT', result: 'LOSS', profit: -100 },
    ]

    const stats = calculateStats(trades)
    
    expect(stats.callTrades).toBe(2)
    expect(stats.putTrades).toBe(2)
    expect(stats.callWinRate).toBe(100) // 2/2
    expect(stats.putWinRate).toBe(50)   // 1/2
  })

  it('should handle all wins (infinite profit factor)', () => {
    const trades: Trade[] = [
      { entryIdx: 0, exitIdx: 1, entryPrice: 100, exitPrice: 101, direction: 'CALL', result: 'WIN', profit: 92 },
      { entryIdx: 2, exitIdx: 3, entryPrice: 100, exitPrice: 99, direction: 'PUT', result: 'WIN', profit: 92 },
    ]

    const stats = calculateStats(trades)
    
    expect(stats.profitFactor).toBe(Infinity)
    expect(stats.winRate).toBe(100)
  })
})
