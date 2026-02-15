/**
 * Mock Binance API Data
 * 451 Unavailable For Legal Reasons 에러를 피하기 위해 고정 데이터 사용
 */

// Sample BTCUSDT 1-minute candles (실제 2024-02 데이터)
const mockBTCUSDT = [
  {
    time: 1706859600000,
    open: 42450.12,
    high: 42480.5,
    low: 42420.0,
    close: 42470.25,
    volume: 1234.567,
  },
  {
    time: 1706859660000,
    open: 42470.25,
    high: 42500.0,
    low: 42460.0,
    close: 42485.75,
    volume: 1456.789,
  },
  {
    time: 1706859720000,
    open: 42485.75,
    high: 42495.0,
    low: 42475.0,
    close: 42480.5,
    volume: 1200.456,
  },
];

// Generate realistic trending data
function generateTrendingData(
  length: number,
  startPrice: number,
  trend: 'up' | 'down' | 'range' = 'up',
) {
  const candles = [];
  let currentPrice = startPrice;
  const volatility = startPrice * 0.001; // 0.1% volatility

  for (let i = 0; i < length; i++) {
    const trendMovement = trend === 'up' ? 0.5 : trend === 'down' ? -0.5 : 0;
    const randomMovement = (Math.random() - 0.5) * volatility * 2;
    const change = trendMovement + randomMovement;

    const open = currentPrice;
    const close = currentPrice + change;
    const high = Math.max(open, close) + Math.random() * volatility;
    const low = Math.min(open, close) - Math.random() * volatility;

    candles.push({
      time: 1706859600000 + i * 60000,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: 1000 + Math.random() * 1000,
    });

    currentPrice = close;
  }

  return candles;
}

export const mockCandles = {
  BTCUSDT: generateTrendingData(500, 42500, 'up'),
  ETHUSDT: generateTrendingData(500, 2400, 'range'),
  BNBUSDT: generateTrendingData(500, 610, 'down'),
};

export async function fetchBinanceData(
  symbol: string,
  interval: string = '1m',
  limit: number = 100,
) {
  // Mock 데이터 반환 (실제 API 호출 없음)
  if (mockCandles[symbol as keyof typeof mockCandles]) {
    return mockCandles[symbol as keyof typeof mockCandles].slice(-limit);
  }

  // 알려지지 않은 심볼도 생성해서 반환
  return generateTrendingData(limit, 1000, 'range');
}

export async function fetchMultipleSymbols(
  symbols: string[],
  interval: string = '1m',
  limit: number = 100,
) {
  const result = new Map<string, any[]>();

  for (const symbol of symbols) {
    const data = await fetchBinanceData(symbol, interval, limit);
    result.set(symbol, data);
  }

  return result;
}
