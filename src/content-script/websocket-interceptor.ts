import { getWebSocketParser, WebSocketParser, CandleData } from './websocket-parser';
import type { PriceUpdate, WebSocketConnection, WebSocketMessage } from './websocket-types';
import { classifyFrame } from './websocket-frame-metadata';
import { loggers } from '../lib/logger';

export type {
  PriceUpdate,
  WebSocketConnection,
  WebSocketMessage,
  WebSocketEvent,
} from './websocket-types';

type PriceUpdateCallback = (update: PriceUpdate) => void;
type HistoryCallback = (candles: CandleData[]) => void;
type MessageCallback = (message: WebSocketMessage) => void;
type ConnectionCallback = (connection: WebSocketConnection) => void;

class WebSocketInterceptor {
  private isListening = false;
  private analysisMode = true;
  private parser: WebSocketParser;
  private boundHandler: (event: MessageEvent) => void;

  private priceUpdateCallbacks: PriceUpdateCallback[] = [];
  private historyCallbacks: HistoryCallback[] = [];
  private messageCallbacks: MessageCallback[] = [];
  private connectionCallbacks: ConnectionCallback[] = [];

  // [PO-17] 실시간 자산 코드 추적
  private lastAssetId: string | null = null;

  private static instance: WebSocketInterceptor | null = null;

  static getInstance(): WebSocketInterceptor {
    if (!WebSocketInterceptor.instance) WebSocketInterceptor.instance = new WebSocketInterceptor();
    return WebSocketInterceptor.instance;
  }

  private constructor() {
    this.parser = getWebSocketParser();
    this.boundHandler = this.handleBridgeMessage.bind(this);
  }

  start(): void {
    if (this.isListening) return;
    this.setupEventListener();
    this.injectScript();
    this.isListening = true;
  }

  stop(): void {
    if (!this.isListening) return;
    window.removeEventListener('message', this.boundHandler);
    this.isListening = false;
  }

  private injectScript(): void {
    // manifest.json의 content_scripts "world": "MAIN"으로 inject-websocket.js가
    // document_start에 Main World에서 직접 실행됨 (TM과 동일한 타이밍)
    // 동적 <script> 주입은 비동기이므로 타이밍 패배 가능 → manifest 방식 사용
    return;
  }

  private setupEventListener(): void {
    window.addEventListener('message', this.boundHandler);
  }

  /**
   * Main World Bridge 메시지 핸들러
   * boundHandler를 통해 addEventListener/removeEventListener에서 동일한 참조 사용
   * [#47] event.origin 검증으로 신뢰할 수 없는 출처의 메시지 차단
   */
  private handleBridgeMessage(event: MessageEvent): void {
    // [#47] Origin 검증: 같은 페이지(Main World ↔ Isolated World)만 허용
    if (event.origin !== window.location.origin) return;
    if (event.data?.source !== 'pq-bridge') return;
    // [#47] 메시지 구조 검증: type 필드 화이트리스트
    const validBridgeTypes = ['ws-message', 'ws-asset-change', 'bridge-ready'];
    if (!validBridgeTypes.includes(event.data.type)) return;
    if (event.data.type === 'ws-message') {
      const data = event.data.data || {};
      const frameMetadata = classifyFrame({
        raw: data.raw,
        dataType: data.dataType,
        dataSize: data.dataSize,
        text: data.text,
      });
      const message: WebSocketMessage = {
        connectionId: data.url || 'ws-bridge',
        url: data.url || 'unknown',
        parsed: data.payload ?? null,
        rawType: data.dataType || (data.text ? 'string' : typeof data.raw),
        timestamp: data.timestamp || Date.now(),
        raw: data.raw,
        text: data.text ?? null,
        frameMetadata,
      };
      this.handleMessage(message, message.timestamp);
    } else if (event.data.type === 'ws-asset-change') {
      // TM ws.send() 후킹에서 캡처된 발신 메시지의 asset ID
      const asset = event.data.data?.asset;
      if (asset) {
        this.lastAssetId = asset;
        loggers.ws.info(`Asset ID captured (outgoing): ${asset}`);
      }
    } else if (event.data.type === 'bridge-ready') {
      loggers.ws.info('Main World Bridge Connected');
    }
  }

  // 파서가 반환하는 유효한 ParsedMessage 타입 목록
  private static readonly VALID_PARSED_TYPES = new Set([
    'price_update',
    'candle_data',
    'candle_history',
    'orderbook',
    'trade',
    'heartbeat',
  ]);

  private handleMessage(data: WebSocketMessage, timestamp: number): void {
    // 이미 파싱된 데이터가 유효한 ParsedMessage 타입이 아니면 파서로 재전달
    // 중요: Bridge의 'binary_payload' 타입은 파서의 socketio_binary_payload 패턴이 처리해야 함
    let parsed = data.parsed;
    if (!parsed || !WebSocketInterceptor.VALID_PARSED_TYPES.has(parsed.type)) {
      // binary_payload는 파서의 패턴 10이 처리할 수 있으므로 원본 객체를 전달
      const toParse = parsed?.type === 'binary_payload' ? parsed : (data.text ?? data.raw);
      parsed = this.parser.parse(toParse);
    }

    const enriched: WebSocketMessage = { ...data, parsed };
    this.messageCallbacks.forEach((cb) => cb(enriched));

    // [Fix 5] 수신 WS 메시지에서 asset ID 자동 추적 (2가지 전략)
    this.trackAssetFromMessage(parsed, data);

    if (parsed && parsed.type === 'candle_history') {
      const candles = parsed.data as CandleData[];
      loggers.ws.info(`Candle History Detected! Count: ${candles?.length || 0}`);
      if (candles && candles.length > 0) {
        const symbol = candles[0].symbol || 'UNKNOWN';
        loggers.ws.info(`History/Bulk Captured: ${candles.length} candles for ${symbol}`);
        this.historyCallbacks.forEach((cb) => cb(candles));
      }
    }
    // 개별 candle_data/price_update는 historyCallbacks로 전달하지 않음.
    // 개별 캔들이 AutoMiner의 pendingRequest를 소비하면
    // 실제 벌크 히스토리 응답이 무시되는 문제를 방지.

    const priceUpdate = parsed ? this.parser.extractPrice(parsed.raw ?? parsed) : null;
    if (priceUpdate) {
      this.priceUpdateCallbacks.forEach((cb) =>
        cb({ ...priceUpdate, timestamp: priceUpdate.timestamp || timestamp }),
      );
    }
  }

  onPriceUpdate(callback: PriceUpdateCallback): () => void {
    this.priceUpdateCallbacks.push(callback);
    return () => {
      const i = this.priceUpdateCallbacks.indexOf(callback);
      if (i > -1) this.priceUpdateCallbacks.splice(i, 1);
    };
  }

  onHistoryReceived(callback: HistoryCallback): () => void {
    this.historyCallbacks.push(callback);
    return () => {
      const i = this.historyCallbacks.indexOf(callback);
      if (i > -1) this.historyCallbacks.splice(i, 1);
    };
  }

  onMessage(callback: MessageCallback): () => void {
    this.messageCallbacks.push(callback);
    return () => {
      const i = this.messageCallbacks.indexOf(callback);
      if (i > -1) this.messageCallbacks.splice(i, 1);
    };
  }

  onConnectionChange(callback: ConnectionCallback): () => void {
    this.connectionCallbacks.push(callback);
    return () => {
      const i = this.connectionCallbacks.indexOf(callback);
      if (i > -1) this.connectionCallbacks.splice(i, 1);
    };
  }

  getStatus() {
    return {
      isListening: this.isListening,
      analysisMode: this.analysisMode,
    };
  }

  /**
   * [PO-17] WebSocket을 통해 직접 메시지 전송 (Bridge 경유)
   */
  send(payload: any, urlPart?: string): void {
    // [#47] targetOrigin을 명시하여 의도한 페이지에서만 수신 가능하도록
    window.postMessage(
      {
        source: 'pq-content',
        type: 'ws-send',
        payload,
        urlPart,
      },
      window.location.origin,
    );
  }

  /**
   * [Fix 5] 수신 WS 메시지에서 asset ID를 자동 추적
   * 전략 A: 파싱된 price_update (updateStream 등)의 symbol 필드
   * 전략 B: 원본 raw 텍스트의 "asset":"..." 필드 (changeSymbol, 히스토리 응답 등)
   */
  private trackAssetFromMessage(parsed: any, data: WebSocketMessage): void {
    // 전략 A: 파싱된 price_update 결과의 symbol 추적
    // updateStream 이벤트가 파싱되면 confidence 0.99의 price_update가 됨
    if (parsed?.type === 'price_update' && parsed.data) {
      const symbol = (parsed.data as any).symbol;
      if (symbol && symbol !== 'CURRENT' && symbol !== 'UNKNOWN') {
        const assetId = String(symbol);
        if (assetId !== this.lastAssetId) {
          this.lastAssetId = assetId;
          loggers.ws.debug(`Asset ID tracked (stream): ${assetId}`);
        }
      }
    }

    // 전략 B: 원본 텍스트에서 "asset":"#XXX" 패턴 감지
    // changeSymbol, subscribeMessage, updateHistoryNewFast 등의 응답에 포함
    if (data.text && typeof data.text === 'string') {
      const assetMatch = data.text.match(/"asset"\s*:\s*"([^"]+)"/);
      if (assetMatch) {
        const assetId = assetMatch[1];
        if (assetId !== this.lastAssetId) {
          this.lastAssetId = assetId;
          loggers.ws.debug(`Asset ID tracked (raw): ${assetId}`);
        }
      }
    }
  }

  getActiveAssetId(): string | null {
    return this.lastAssetId;
  }
}

export function getWebSocketInterceptor(): WebSocketInterceptor {
  return WebSocketInterceptor.getInstance();
}
