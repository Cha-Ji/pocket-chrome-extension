// ============================================================
// Strategy V3: SMMA + Stochastic + Market Regime Filter
// ============================================================
// Trending: Entry on SMMA pullback + Stochastic cross
// Ranging: Entry on SMMA mean reversion + Stochastic extreme cross
// ============================================================

import { Candle, Strategy, StrategySignal, Direction } from '../backtest/types'
import { RSI, SMMA, Stochastic } from '../indicators'

export class StrategyV3 implements Strategy {
  id = 'strategy-v3'
  name = 'V3: Adaptive SMMA + Stochastic'
  description = 'Trend-following and Mean-reversion adaptive strategy'
  
  params = {
    smmaFast: { default: 5, min: 3, max: 10, step: 1 },
    smmaMid: { default: 12, min: 10, max: 20, step: 1 },
    smmaSlow: { default: 25, min: 20, max: 50, step: 5 },
    stochK: { default: 5, min: 3, max: 14, step: 1 },
    stochD: { default: 3, min: 2, max: 10, step: 1 },
    rsiPeriod: { default: 14, min: 7, max: 21, step: 1 },
    adxThreshold: { default: 25, min: 15, max: 35, step: 5 }, // ADX dummy proxy using RSI slope for now
  }

  generateSignal(candles: Candle[], params: Record<string, number>): StrategySignal | null {
    if (candles.length < 50) return null

    const closes = candles.map(c => c.close)
    const highs = candles.map(c => c.high)
    const lows = candles.map(c => c.low)

    // Indicators
    const sFast = SMMA.latest(closes, params.smmaFast)
    const sMid = SMMA.latest(closes, params.smmaMid)
    const sSlow = SMMA.latest(closes, params.smmaSlow)
    const stoch = Stochastic.latest(highs, lows, closes, params.stochK, params.stochD)
    const rsi = RSI.latest(closes, params.rsiPeriod)

    if (!sFast || !sMid || !sSlow || !stoch || !rsi) return null

    // Trending Detection: Strict alignment
    const isTrendingUp = sFast > sMid && sMid > sSlow
    const isTrendingDown = sFast < sMid && sMid < sSlow
    const isRanging = !isTrendingUp && !isTrendingDown

    // Strategy Logic
    let direction: Direction | null = null
    let confidence = 0
    let reason = ''

    if (isTrendingUp) {
      // Pullback in uptrend: Stoch oversold cross up
      if (stoch.k < 30 && stoch.k > stoch.d) {
        direction = 'CALL'
        confidence = 0.8
        reason = 'Trend Pullback'
      }
    } else if (isTrendingDown) {
      // Pullback in downtrend: Stoch overbought cross down
      if (stoch.k > 70 && stoch.k < stoch.d) {
        direction = 'PUT'
        confidence = 0.8
        reason = 'Trend Pullback'
      }
    } else {
      // Mean reversion in range
      if (rsi < 25 && stoch.k < 20 && stoch.k > stoch.d) {
        direction = 'CALL'
        confidence = 0.7
        reason = 'Range Bottom'
      } else if (rsi > 75 && stoch.k > 80 && stoch.k < stoch.d) {
        direction = 'PUT'
        confidence = 0.7
        reason = 'Range Top'
      }
    }

    return {
      direction,
      confidence,
      reason,
      indicators: {
        rsi,
        stochK: stoch.k,
        stochD: stoch.d,
        sFast,
        sMid,
        sSlow
      }
    }
  }
}
