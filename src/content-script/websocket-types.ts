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

/** 프레임 유형: text(문자열), binary(ArrayBuffer/Blob/BufferSource), unknown */
export type FrameType = 'text' | 'binary' | 'unknown';

/**
 * WebSocket 프레임 메타데이터
 * PR #111 codex 피드백: 바이너리 프레임의 정확한 분류 및 바이트 크기 기록
 */
export interface FrameMetadata {
  /** 프레임 유형 분류 (text / binary / unknown) */
  frameType: FrameType;
  /** 프레임 크기 — 단위: 바이트(byte) */
  frameSizeBytes: number;
  /** 바이너리 프레임 미리보기 (기본 OFF, feature flag로 활성화) */
  binaryPreview?: Uint8Array;
}

export interface WebSocketMessage {
  connectionId: string;
  url: string;
  parsed: any;
  rawType: string;
  timestamp: number;
  raw?: any;
  text?: string | null;
  /** 프레임 메타데이터: 정확한 타입 분류 + 바이트 크기 */
  frameMetadata?: FrameMetadata;
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
