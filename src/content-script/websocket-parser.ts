// ============================================================
// WebSocket Message Parser - Pocket Option 가격 데이터 파싱
// ============================================================
// 다양한 메시지 형식을 처리하고 가격 데이터를 추출합니다.
// 분석 모드에서 발견된 패턴을 기반으로 파서를 확장할 수 있습니다.
// ============================================================

import type {
  PriceUpdate,
  CandleData,
  OrderBookData,
  TradeData,
  MessageType,
  ParsedMessage,
} from './websocket-types'

export type { PriceUpdate, CandleData, OrderBookData, TradeData, MessageType, ParsedMessage } from './websocket-types'

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
        const priceActions = ['tick', 'price', 'quote', 'candle', 'rate', 'update', 'stream']
        const isPriceAction = priceActions.some(a => action.toLowerCase().includes(a))
        
        if (isPriceAction) {
          // 데이터에서 가격 추출 시도
          const payload = data.data || data.payload || data.body || data
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
            // 파싱 결과 필드 검증
            const validated = this.validateParsedMessage(result)
            if (validated) return validated
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
  // Validation
  // ============================================================

  /**
   * 파싱 결과의 필수 필드를 검증
   * 검증 실패 시 null 반환 (silent drop)
   */
  private validateParsedMessage(msg: ParsedMessage): ParsedMessage | null {
    if (!msg.data) return msg // data가 null인 경우(heartbeat 등)는 그대로 통과

    switch (msg.type) {
      case 'price_update': {
        const d = msg.data as PriceUpdate
        if (typeof d.symbol !== 'string' || typeof d.price !== 'number') return null
        return msg
      }
      case 'candle_data': {
        const d = msg.data as CandleData
        if (
          typeof d.open !== 'number' ||
          typeof d.high !== 'number' ||
          typeof d.low !== 'number' ||
          typeof d.close !== 'number'
        ) return null
        if (d.volume !== undefined && typeof d.volume !== 'number') return null
        return msg
      }
      case 'orderbook': {
        const d = msg.data as OrderBookData
        if (typeof d.bid !== 'number' || typeof d.ask !== 'number') return null
        return msg
      }
      case 'trade': {
        const d = msg.data as TradeData
        if (typeof d.price !== 'number' || typeof d.quantity !== 'number') return null
        return msg
      }
      default:
        return msg
    }
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
