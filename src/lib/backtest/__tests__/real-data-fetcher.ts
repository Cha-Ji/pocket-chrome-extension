// ============================================================
// Real Market Data Fetcher
// ============================================================

import { Candle } from '../types'

interface BinanceKline {
  openTime: number
  open: string
  high: string
  low: string
  close: string
  volume: string
  closeTime: number
}

/**
 * Fetch real OHLCV data from Binance
 */
export async function fetchBinanceData(
  symbol: string = 'BTCUSDT',
  interval: string = '1m',
  limit: number = 500
): Promise<Candle[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
  
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Binance API error: ${response.status}`)
  }
  
  const data = await response.json() as any[][]
  
  return data.map(k => ({
    timestamp: k[0] as number,
    open: parseFloat(k[1] as string),
    high: parseFloat(k[2] as string),
    low: parseFloat(k[3] as string),
    close: parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
  }))
}

/**
 * Fetch multiple symbols for comparison
 */
export async function fetchMultipleSymbols(
  symbols: string[] = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'],
  interval: string = '1m',
  limit: number = 500
): Promise<Map<string, Candle[]>> {
  const result = new Map<string, Candle[]>()
  
  for (const symbol of symbols) {
    try {
      const candles = await fetchBinanceData(symbol, interval, limit)
      result.set(symbol, candles)
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 100))
    } catch (e) {
      console.error(`Failed to fetch ${symbol}:`, e)
    }
  }
  
  return result
}
