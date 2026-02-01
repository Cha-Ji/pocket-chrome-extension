/**
 * Binance Historical Data Fetcher
 * 
 * Binance API로 과거 가격 데이터 수집
 * - 최대 1000개 캔들/요청 (무료, API키 불필요)
 * - 1분/5분/15분/1시간 등 다양한 타임프레임
 * - JSON 캐싱으로 재사용
 */

import * as fs from 'fs'
import * as path from 'path'

const BINANCE_API = 'https://api.binance.com/api/v3/klines'
const DATA_DIR = path.join(__dirname, '..', 'data')

interface BinanceKline {
  openTime: number
  open: string
  high: string
  low: string
  close: string
  volume: string
  closeTime: number
  quoteVolume: string
  trades: number
  takerBuyBase: string
  takerBuyQuote: string
  ignore: string
}

interface Candle {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface FetchConfig {
  symbol: string
  interval: string // 1m, 5m, 15m, 1h, 4h, 1d
  days: number
  outputFile?: string
}

/**
 * Binance API에서 캔들 데이터 가져오기
 */
async function fetchKlines(
  symbol: string,
  interval: string,
  startTime: number,
  endTime: number,
  limit: number = 1000
): Promise<Candle[]> {
  const url = `${BINANCE_API}?symbol=${symbol}&interval=${interval}&startTime=${startTime}&endTime=${endTime}&limit=${limit}`
  
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Binance API error: ${response.status} ${response.statusText}`)
  }
  
  const data = await response.json() as any[][]
  
  return data.map(k => ({
    timestamp: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }))
}

/**
 * 지정된 기간의 모든 캔들 데이터 수집 (페이징 처리)
 */
async function fetchAllCandles(config: FetchConfig): Promise<Candle[]> {
  const { symbol, interval, days } = config
  
  const endTime = Date.now()
  const startTime = endTime - days * 24 * 60 * 60 * 1000
  
  // interval을 ms로 변환
  const intervalMs = getIntervalMs(interval)
  const maxCandles = Math.ceil((endTime - startTime) / intervalMs)
  
  console.log(`[Fetcher] ${symbol} ${interval} - 최대 ${maxCandles}개 캔들 예상`)
  
  const allCandles: Candle[] = []
  let currentStart = startTime
  let page = 0
  
  while (currentStart < endTime) {
    page++
    const candles = await fetchKlines(symbol, interval, currentStart, endTime, 1000)
    
    if (candles.length === 0) break
    
    allCandles.push(...candles)
    console.log(`[Fetcher] Page ${page}: ${candles.length}개 수집 (총 ${allCandles.length}개)`)
    
    // 다음 요청 시작점 설정
    currentStart = candles[candles.length - 1].timestamp + intervalMs
    
    // Rate limit 방지 (0.5초 대기)
    await new Promise(r => setTimeout(r, 500))
  }
  
  // 중복 제거 및 정렬
  const uniqueCandles = Array.from(
    new Map(allCandles.map(c => [c.timestamp, c])).values()
  ).sort((a, b) => a.timestamp - b.timestamp)
  
  console.log(`[Fetcher] 최종: ${uniqueCandles.length}개 캔들`)
  return uniqueCandles
}

function getIntervalMs(interval: string): number {
  const map: Record<string, number> = {
    '1m': 60 * 1000,
    '3m': 3 * 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
  }
  return map[interval] || 60 * 1000
}

/**
 * 데이터를 JSON 파일로 저장
 */
function saveToFile(candles: Candle[], filename: string): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
  
  const filepath = path.join(DATA_DIR, filename)
  const data = {
    fetchedAt: new Date().toISOString(),
    count: candles.length,
    startTime: candles[0]?.timestamp,
    endTime: candles[candles.length - 1]?.timestamp,
    candles,
  }
  
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2))
  console.log(`[Fetcher] 저장됨: ${filepath}`)
}

/**
 * 캐시된 데이터 로드
 */
function loadFromCache(filename: string): Candle[] | null {
  const filepath = path.join(DATA_DIR, filename)
  
  if (!fs.existsSync(filepath)) {
    return null
  }
  
  const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'))
  
  // 24시간 이상 된 캐시는 무효화
  const fetchedAt = new Date(data.fetchedAt).getTime()
  if (Date.now() - fetchedAt > 24 * 60 * 60 * 1000) {
    console.log(`[Fetcher] 캐시 만료: ${filename}`)
    return null
  }
  
  console.log(`[Fetcher] 캐시 로드: ${filename} (${data.count}개)`)
  return data.candles
}

/**
 * 메인 함수: 여러 심볼/타임프레임 데이터 수집
 */
async function main() {
  const configs: FetchConfig[] = [
    // BTC 데이터 (1개월)
    { symbol: 'BTCUSDT', interval: '1m', days: 7 },
    { symbol: 'BTCUSDT', interval: '5m', days: 30 },
    
    // ETH 데이터
    { symbol: 'ETHUSDT', interval: '1m', days: 7 },
    { symbol: 'ETHUSDT', interval: '5m', days: 30 },
    
    // 기타 주요 코인
    { symbol: 'BNBUSDT', interval: '5m', days: 14 },
    { symbol: 'XRPUSDT', interval: '5m', days: 14 },
    { symbol: 'SOLUSDT', interval: '5m', days: 14 },
  ]
  
  console.log('='.repeat(60))
  console.log('Binance Historical Data Fetcher')
  console.log('='.repeat(60))
  
  for (const config of configs) {
    const filename = `${config.symbol}_${config.interval}_${config.days}d.json`
    
    // 캐시 체크
    const cached = loadFromCache(filename)
    if (cached) {
      continue
    }
    
    console.log(`\n[Fetcher] 수집 시작: ${config.symbol} ${config.interval} (${config.days}일)`)
    
    try {
      const candles = await fetchAllCandles(config)
      saveToFile(candles, filename)
    } catch (error) {
      console.error(`[Fetcher] 에러: ${config.symbol}`, error)
    }
    
    // 요청 간 딜레이
    await new Promise(r => setTimeout(r, 1000))
  }
  
  console.log('\n[Fetcher] 완료!')
}

// Export for use in other scripts
export { fetchAllCandles, loadFromCache, saveToFile, Candle, FetchConfig }

// Run if called directly
main().catch(console.error)
