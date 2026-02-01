/**
 * Binance Historical Data Fetcher (Node.js)
 * ES Module 버전 - node fetch-data.mjs 로 직접 실행
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DATA_DIR = path.join(__dirname, '..', 'data')

const BINANCE_API = 'https://api.binance.com/api/v3/klines'

// Ensure data directory
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

async function fetchKlines(symbol, interval, limit = 1000, endTime = null) {
  let url = `${BINANCE_API}?symbol=${symbol}&interval=${interval}&limit=${limit}`
  if (endTime) url += `&endTime=${endTime}`
  
  const response = await fetch(url)
  if (!response.ok) throw new Error(`API Error: ${response.status}`)
  
  const data = await response.json()
  return data.map(k => ({
    timestamp: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }))
}

async function fetchAllPages(symbol, interval, pages) {
  console.log(`[Fetcher] ${symbol} ${interval} - ${pages} 페이지 수집 중...`)
  
  const allCandles = []
  let endTime = null
  
  for (let i = 1; i <= pages; i++) {
    const candles = await fetchKlines(symbol, interval, 1000, endTime)
    
    if (candles.length === 0) {
      console.log(`  Page ${i}: 데이터 없음`)
      break
    }
    
    allCandles.push(...candles)
    console.log(`  Page ${i}: ${candles.length} 캔들 수집 (총 ${allCandles.length})`)
    
    // 다음 페이지를 위해 가장 오래된 타임스탬프 사용
    endTime = Math.min(...candles.map(c => c.timestamp)) - 1
    
    // Rate limit 방지
    await new Promise(r => setTimeout(r, 500))
  }
  
  // 중복 제거 및 정렬
  const uniqueCandles = Array.from(
    new Map(allCandles.map(c => [c.timestamp, c])).values()
  ).sort((a, b) => a.timestamp - b.timestamp)
  
  // 저장
  const outputFile = path.join(DATA_DIR, `${symbol}_${interval}.json`)
  const data = {
    symbol,
    interval,
    fetchedAt: new Date().toISOString(),
    count: uniqueCandles.length,
    startTime: uniqueCandles[0]?.timestamp,
    endTime: uniqueCandles[uniqueCandles.length - 1]?.timestamp,
    candles: uniqueCandles,
  }
  
  fs.writeFileSync(outputFile, JSON.stringify(data, null, 2))
  console.log(`[Fetcher] 저장: ${outputFile} (${uniqueCandles.length} 캔들)\n`)
  
  return uniqueCandles
}

async function main() {
  console.log('========================================')
  console.log('Binance Historical Data Fetcher')
  console.log('========================================\n')
  
  const configs = [
    // 5분봉 데이터 (각 페이지 = 약 3.5일)
    { symbol: 'BTCUSDT', interval: '5m', pages: 6 },   // ~21일
    { symbol: 'ETHUSDT', interval: '5m', pages: 6 },
    { symbol: 'BNBUSDT', interval: '5m', pages: 4 },   // ~14일
    { symbol: 'SOLUSDT', interval: '5m', pages: 4 },
    { symbol: 'XRPUSDT', interval: '5m', pages: 4 },
    
    // 1분봉 데이터 (각 페이지 = 약 16시간)
    { symbol: 'BTCUSDT', interval: '1m', pages: 10 },  // ~7일
    { symbol: 'ETHUSDT', interval: '1m', pages: 10 },
  ]
  
  for (const config of configs) {
    try {
      await fetchAllPages(config.symbol, config.interval, config.pages)
    } catch (error) {
      console.error(`[Fetcher] 에러: ${config.symbol} ${config.interval}`, error.message)
    }
  }
  
  console.log('[Fetcher] 완료!')
  
  // 수집된 파일 목록
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'))
  console.log('\n수집된 데이터:')
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'))
    console.log(`  ${file}: ${data.count || 0} 캔들`)
  }
}

main().catch(console.error)
