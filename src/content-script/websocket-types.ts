// ============================================================
// WebSocket 공유 타입 정의
// ============================================================
// websocket-parser.ts와 websocket-interceptor.ts 간
// 순환 의존을 방지하기 위해 공유 타입을 분리한 파일입니다.
// 메시지 계약에 사용되는 타입은 lib/types에서 정의되며 여기서 re-export합니다.
// ============================================================

import type { PriceUpdate, WebSocketConnection } from '../lib/types';

export type { PriceUpdate, WebSocketConnection };

export interface CandleData {
  symbol: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface OrderBookData {
  symbol: string;
  bid: number;
  ask: number;
  timestamp: number;
}

export interface TradeData {
  symbol: string;
  price: number;
  quantity: number;
  side: 'buy' | 'sell';
  timestamp: number;
}

export interface WebSocketMessage {
  connectionId: string;
  url: string;
  parsed: any;
  rawType: string;
  timestamp: number;
  raw?: any;
  text?: string | null;
}

export type WebSocketEventType =
  | 'installed'
  | 'connection'
  | 'open'
  | 'close'
  | 'error'
  | 'message';

export interface WebSocketEvent {
  type: WebSocketEventType;
  data: any;
  timestamp: number;
}

// 메시지 타입 정의
export type MessageType =
  | 'price_update'
  | 'candle_data'
  | 'candle_history' // Array of candles
  | 'orderbook'
  | 'trade'
  | 'heartbeat'
  | 'unknown';

export interface ParsedMessage {
  type: MessageType;
  data: PriceUpdate | CandleData | CandleData[] | OrderBookData | TradeData | null;
  raw: any;
  confidence: number; // 0-1, 파싱 확신도
}
