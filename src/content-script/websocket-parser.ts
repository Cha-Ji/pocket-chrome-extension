// ============================================================
// WebSocket Message Parser - Pocket Option 가격 데이터 파싱
// ============================================================
// 다양한 메시지 형식을 처리하고 가격 데이터를 추출합니다.
// 분석 모드에서 발견된 패턴을 기반으로 파서를 확장할 수 있습니다.
// ============================================================

import { PriceUpdate } from './websocket-interceptor'

// 메시지 타입 정의
export type MessageType = 
  | 'price_update'
  | 'candle_data'
  | 'candle_history' // Array of candles
  | 'orderbook'
  | 'trade'
  | 'heartbeat'
  | 'unknown'

export interface ParsedMessage {
  type: MessageType
  data: PriceUpdate | CandleData | CandleData[] | OrderBookData | TradeData | null
  raw: any
  confidence: number // 0-1, 파싱 확신도
}

export interface CandleData {
  symbol: string
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export interface OrderBookData {
  symbol: string
  bid: number
  ask: number
  timestamp: number
}

export interface TradeData {
  symbol: string
  price: number
  quantity: number
  side: 'buy' | 'sell'
  timestamp: number
}

// 알려진 Pocket Option 메시지 패턴
// 분석 모드에서 발견되면 여기에 추가
interface MessagePattern {
  name: string
  detect: (data: any) => boolean
  parse: (data: any) => ParsedMessage
}

// ============================================================
// Parser Implementation
// ============================================================

export class WebSocketParser {
  private patterns: MessagePattern[] = []
  private unknownMessageTypes: Set<string> = new Set()

  constructor() {
    this.registerDefaultPatterns()
  }

  // ============================================================
  // Pattern Registration
  // ============================================================

  /**
   * 기본 메시지 패턴 등록
   */
  private registerDefaultPatterns(): void {
    // 패턴 1: { symbol/asset: string, price/value/rate: number }
    this.patterns.push({
      name: 'simple_price',
      detect: (data) => {
        if (typeof data !== 'object' || data === null) return false
        const hasSymbol = 'symbol' in data || 'asset' in data || 'pair' in data || 'ticker' in data
        const hasPrice = 'price' in data || 'value' in data || 'rate' in data || 'close' in data
        return hasSymbol && hasPrice && typeof (data.price ?? data.value ?? data.rate ?? data.close) === 'number'
      },
      parse: (data) => ({
        type: 'price_update',
        data: {
          symbol: data.symbol || data.asset || data.pair || data.ticker,
          price: data.price ?? data.value ?? data.rate ?? data.close,
          timestamp: data.timestamp || data.time || data.t || Date.now(),
          source: 'websocket',
        },
        raw: data,
        confidence: 0.9,
      }),
    })

    // 패턴 2: { bid: number, ask: number }
    this.patterns.push({
      name: 'bid_ask',
      detect: (data) => {
        if (typeof data !== 'object' || data === null) return false
        return typeof data.bid === 'number' && typeof data.ask === 'number'
      },
      parse: (data) => ({
        type: 'orderbook',
        data: {
          symbol: data.symbol || data.asset || data.pair || 'UNKNOWN',
          bid: data.bid,
          ask: data.ask,
          timestamp: data.timestamp || data.time || Date.now(),
        } as OrderBookData,
        raw: data,
        confidence: 0.85,
      }),
    })

    // 패턴 3: OHLC 캔들 데이터
    this.patterns.push({
      name: 'ohlc_candle',
      detect: (data) => {
        if (typeof data !== 'object' || data === null) return false
        const hasOHLC = 'open' in data && 'high' in data && 'low' in data && 'close' in data
        return hasOHLC && typeof data.open === 'number'
      },
      parse: (data) => ({
        type: 'candle_data',
        data: {
          symbol: data.symbol || data.asset || data.pair || 'UNKNOWN',
          timestamp: data.timestamp || data.time || Date.now(),
          open: data.open || data.o,
          high: data.high || data.h,
          low: data.low || data.l,
          close: data.close || data.c,
          volume: data.volume || data.v,
        } as CandleData,
        raw: data,
        confidence: 0.95,
      }),
    })

    // 패턴 4: 배열 형태의 가격 데이터 [timestamp, price] 또는 [price]
    this.patterns.push({
      name: 'array_price',
      detect: (data) => {
        if (!Array.isArray(data)) return false
        if (data.length === 2 && typeof data[1] === 'number') return true
        if (data.length === 1 && typeof data[0] === 'number') return true
        return false
      },
      parse: (data) => {
        const price = data.length === 2 ? data[1] : data[0]
        const timestamp = data.length === 2 && typeof data[0] === 'number' ? data[0] : Date.now()
        return {
          type: 'price_update',
          data: {
            symbol: 'CURRENT',
            price,
            timestamp,
            source: 'websocket',
          },
          raw: data,
          confidence: 0.6, // 심볼 정보가 없어서 확신도 낮음
        }
      },
    })

    // 패턴 5: 중첩된 데이터 구조 { data: { ... } }
    this.patterns.push({
      name: 'nested_data',
      detect: (data) => {
        if (typeof data !== 'object' || data === null) return false
        return 'data' in data && typeof data.data === 'object'
      },
      parse: (data) => {
        // 내부 데이터로 재귀 파싱
        return this.parse(data.data)
      },
    })

    // 패턴 6: Pocket Option 추정 패턴 (action/cmd 필드가 있는 메시지)
    this.patterns.push({
      name: 'pocket_option_action',
      detect: (data) => {
        if (typeof data !== 'object' || data === null) return false
        return ('action' in data || 'cmd' in data || 'type' in data) && typeof (data.action || data.cmd || data.type) === 'string'
      },
      parse: (data) => {
        const action = data.action || data.cmd || data.type
        
        // 가격 관련 액션인지 확인
        const priceActions = ['tick', 'price', 'quote', 'candle', 'rate', 'update', 'stream', 'history', 'load']
        const isPriceAction = priceActions.some(a => action.toLowerCase().includes(a))
        
        if (isPriceAction) {
          const payload = data.data || data.payload || data.body || data
          
          // Case 1: History Array (Array of candles)
          if (Array.isArray(payload) && payload.length > 0) {
             const first = payload[0];
             if (typeof first === 'object' && ('open' in first || 'close' in first || 'rate' in first)) {
                // Reuse logic from candle_history_array pattern (defined below)
                // But for now, let's just return it as unknown so the specialized pattern catches it,
                // OR handle it here. Let's handle it here for specific action wrapper.
                const symbol = data.symbol || data.asset || data.pair || 'CURRENT'
                const candles: CandleData[] = payload.map((item: any) => ({
                    symbol: item.symbol || symbol,
                    timestamp: item.timestamp || item.time || item.t || Date.now(),
                    open: item.open ?? item.o ?? item.rate ?? 0,
                    high: item.high ?? item.h ?? item.max ?? (item.open ?? 0),
                    low: item.low ?? item.l ?? item.min ?? (item.open ?? 0),
                    close: item.close ?? item.c ?? item.rate ?? (item.open ?? 0),
                    volume: item.volume ?? item.v ?? 0
                }));
                return {
                    type: 'candle_history',
                    data: candles,
                    raw: data,
                    confidence: 0.95
                }
             }
          }

          // Case 2: Single Price
          const price = this.extractPriceFromPayload(payload)
          
          if (price) {
            return {
              type: 'price_update',
              data: {
                symbol: payload.symbol || payload.asset || payload.pair || 'CURRENT',
                price,
                timestamp: payload.timestamp || payload.time || Date.now(),
                source: 'websocket',
              },
              raw: data,
              confidence: 0.75,
            }
          }
        }
        
        // Heartbeat 메시지
        if (action.toLowerCase().includes('ping') || action.toLowerCase().includes('heartbeat')) {
          return {
            type: 'heartbeat',
            data: null,
            raw: data,
            confidence: 1.0,
          }
        }
        
        return {
          type: 'unknown',
          data: null,
          raw: data,
          confidence: 0,
        }
      },
    })

    // 패턴 8: Socket.IO 메시지 (Legacy Migration)
    this.patterns.push({
      name: 'socketio_message',
      detect: (data) => {
        // Socket.IO 메시지는 "42[...]" 형태의 문자열임
        if (typeof data !== 'string') return false;
        // 42 또는 2 + JSON 배열 시작([...]) 체크
        return /^\d+(\{.*\}|\[.*\])$/.test(data);
      },
      parse: (data) => {
        try {
          // 접두어(숫자) 제거하고 JSON 파싱
          const jsonStr = data.replace(/^\d+/, '');
          const parsed = JSON.parse(jsonStr); // ["eventName", payload]

          // 배열이고, 두 번째 요소가 데이터인 경우
          if (Array.isArray(parsed) && parsed.length >= 2) {
            const eventName = parsed[0];
            const payload = parsed[1];

            // 1. 히스토리 데이터 (updateHistoryNewFast)
            if (eventName === 'updateHistoryNewFast' && payload.data) {
                // payload.data는 문자열일 수 있음 (이중 JSON)
                let history = payload.data;
                if (typeof history === 'string') history = JSON.parse(history);
                
                // history는 [[time, open, close, high, low], ...] 형식일 가능성 높음
                // 하지만 여기서는 CandleData 형식으로 변환해야 함
                // 일단 raw 데이터로 넘기고, 인터셉터에서 처리하도록 유도하거나 여기서 변환
                
                // Pocket Option History Format: [time, open, close, high, low, ???] (추정)
                // 정확한 매핑 필요. 일단 Unknown으로 넘기지 말고 candle_history로 식별
                
                // 만약 history가 배열이라면
                if (Array.isArray(history)) {
                    return {
                        type: 'candle_history',
                        data: history.map((c: any) => {
                            // 배열 인덱스 기반 매핑 (추정)
                            // [timestamp, open, close, high, low]
                            if (Array.isArray(c)) {
                                return {
                                    symbol: 'CURRENT', // 컨텍스트에서 채워야 함
                                    timestamp: c[0],
                                    open: c[1],
                                    close: c[2],
                                    high: c[3],
                                    low: c[4],
                                    volume: 0
                                } as CandleData;
                            }
                            // 객체 기반 매핑
                            return {
                                symbol: c.symbol || 'CURRENT',
                                timestamp: c.timestamp || c.time || Date.now(),
                                open: c.open,
                                high: c.high,
                                low: c.low,
                                close: c.close,
                                volume: c.volume || 0
                            } as CandleData;
                        }),
                        raw: data,
                        confidence: 0.95
                    }
                }
            }

            // 2. 실시간 스트림 (updateStream)
            if (eventName === 'updateStream') {
                // payload: [["BTCUSD_otc", 1738..., 1.234]]
                if (Array.isArray(payload)) {
                    const item = payload[0]; // 첫 번째 업데이트
                    if (Array.isArray(item) && item.length >= 3) {
                        return {
                            type: 'price_update',
                            data: {
                                symbol: item[0],
                                timestamp: item[1],
                                price: item[2],
                                source: 'websocket'
                            },
                            raw: data,
                            confidence: 0.99
                        }
                    }
                }
            }
          }
        } catch (e) {
            // console.warn('Socket.IO parsing failed', e);
        }

        return {
          type: 'unknown',
          data: null,
          raw: data,
          confidence: 0,
        }
      }
    })
  }

  /**
   * 커스텀 패턴 등록 (런타임에 확장)
   */
  registerPattern(pattern: MessagePattern): void {
    // 기존 패턴 앞에 추가 (우선순위 높음)
    this.patterns.unshift(pattern)
    console.log(`[WS Parser] Registered pattern: ${pattern.name}`)
  }

  // ============================================================
  // Parsing
  // ============================================================

  /**
   * 메시지 파싱
   */
  parse(data: any): ParsedMessage {
    // 문자열이면 JSON 파싱 시도
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data)
      } catch {
        return {
          type: 'unknown',
          data: null,
          raw: data,
          confidence: 0,
        }
      }
    }

    // 패턴 매칭
    for (const pattern of this.patterns) {
      try {
        if (pattern.detect(data)) {
          const result = pattern.parse(data)
          if (result.confidence > 0) {
            return result
          }
        }
      } catch (e) {
        console.warn(`[WS Parser] Pattern ${pattern.name} error:`, e)
      }
    }

    // 알 수 없는 메시지
    this.trackUnknownMessage(data)
    return {
      type: 'unknown',
      data: null,
      raw: data,
      confidence: 0,
    }
  }

  /**
   * 메시지에서 가격만 추출 (단순화된 API)
   */
  extractPrice(data: any): PriceUpdate | null {
    const parsed = this.parse(data)
    
    if (parsed.type === 'price_update' && parsed.data) {
      return parsed.data as PriceUpdate
    }
    
    // orderbook 데이터에서 mid price 계산
    if (parsed.type === 'orderbook' && parsed.data) {
      const ob = parsed.data as OrderBookData
      return {
        symbol: ob.symbol,
        price: (ob.bid + ob.ask) / 2,
        timestamp: ob.timestamp,
        source: 'websocket',
      }
    }
    
    // candle 데이터에서 close price 추출
    if (parsed.type === 'candle_data' && parsed.data) {
      const candle = parsed.data as CandleData
      return {
        symbol: candle.symbol,
        price: candle.close,
        timestamp: candle.timestamp,
        source: 'websocket',
      }
    }
    
    return null
  }

  // ============================================================
  // Helpers
  // ============================================================

  /**
   * 페이로드에서 가격 추출 시도
   */
  private extractPriceFromPayload(payload: any): number | null {
    if (typeof payload !== 'object' || payload === null) return null
    
    // 직접 가격 필드
    const priceFields = ['price', 'value', 'rate', 'close', 'last', 'bid', 'ask']
    for (const field of priceFields) {
      if (typeof payload[field] === 'number' && payload[field] > 0) {
        return payload[field]
      }
    }
    
    // 중첩 구조에서 재귀 탐색
    for (const key of Object.keys(payload)) {
      const value = payload[key]
      if (typeof value === 'object' && value !== null) {
        const price = this.extractPriceFromPayload(value)
        if (price) return price
      }
    }
    
    return null
  }

  /**
   * 알 수 없는 메시지 타입 추적 (분석용)
   */
  private trackUnknownMessage(data: any): void {
    const typeKey = this.getMessageTypeKey(data)
    if (typeKey && !this.unknownMessageTypes.has(typeKey)) {
      this.unknownMessageTypes.add(typeKey)
      console.log(`[WS Parser] New unknown message type: ${typeKey}`, data)
    }
  }

  /**
   * 메시지 타입 키 생성 (분류용)
   */
  private getMessageTypeKey(data: any): string {
    if (typeof data !== 'object' || data === null) {
      return `primitive:${typeof data}`
    }
    
    // 타입 힌트가 있는 필드 확인
    const typeFields = ['type', 'action', 'cmd', 'event', 'method']
    for (const field of typeFields) {
      if (typeof data[field] === 'string') {
        return `${field}:${data[field]}`
      }
    }
    
    // 주요 필드로 구분
    const keys = Object.keys(data).sort().slice(0, 5).join(',')
    return `keys:${keys}`
  }

  /**
   * 알 수 없는 메시지 타입 목록 반환
   */
  getUnknownMessageTypes(): string[] {
    return Array.from(this.unknownMessageTypes)
  }

  /**
   * 알 수 없는 메시지 타입 초기화
   */
  clearUnknownMessageTypes(): void {
    this.unknownMessageTypes.clear()
  }

  /**
   * 등록된 패턴 목록 반환
   */
  getPatterns(): string[] {
    return this.patterns.map(p => p.name)
  }
}

// ============================================================
// Singleton Instance
// ============================================================

let parserInstance: WebSocketParser | null = null

export function getWebSocketParser(): WebSocketParser {
  if (!parserInstance) {
    parserInstance = new WebSocketParser()
  }
  return parserInstance
}

// ============================================================
// Pocket Option 특화 패턴 (분석 후 추가)
// ============================================================

/**
 * Pocket Option에서 발견된 패턴을 파서에 추가
 * 분석 모드에서 패턴을 발견하면 이 함수를 호출하여 등록
 */
export function registerPocketOptionPattern(
  name: string,
  detect: (data: any) => boolean,
  extractPrice: (data: any) => { symbol: string; price: number; timestamp: number } | null
): void {
  const parser = getWebSocketParser()
  
  parser.registerPattern({
    name: `pocket_option_${name}`,
    detect,
    parse: (data) => {
      const priceData = extractPrice(data)
      if (priceData) {
        return {
          type: 'price_update',
          data: {
            ...priceData,
            source: 'websocket',
          },
          raw: data,
          confidence: 0.9,
        }
      }
      return {
        type: 'unknown',
        data: null,
        raw: data,
        confidence: 0,
      }
    },
  })
}
