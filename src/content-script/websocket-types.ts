// ============================================================
// WebSocket 공유 타입 정의
// ============================================================
// websocket-parser.ts와 websocket-interceptor.ts 간
// 순환 의존을 방지하기 위해 공유 타입을 분리한 파일입니다.
// ============================================================

export interface PriceUpdate {
  symbol: string
  price: number
  timestamp: number
  source: 'websocket'
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

export interface WebSocketConnection {
  id: string
  url: string
  isPriceRelated: boolean
  readyState: 'connecting' | 'open' | 'closing' | 'closed'
  messageCount: number
  lastMessageAt: number | null
}

export interface WebSocketMessage {
  connectionId: string
  url: string
  parsed: any
  rawType: string
  timestamp: number
}

export type WebSocketEventType = 'installed' | 'connection' | 'open' | 'close' | 'error' | 'message'

export interface WebSocketEvent {
  type: WebSocketEventType
  data: any
  timestamp: number
}

// 메시지 타입 정의
export type MessageType =
  | 'price_update'
  | 'candle_data'
  | 'orderbook'
  | 'trade'
  | 'heartbeat'
  | 'unknown'

export interface ParsedMessage {
  type: MessageType
  data: PriceUpdate | CandleData | OrderBookData | TradeData | null
  raw: any
  confidence: number // 0-1, 파싱 확신도
}
