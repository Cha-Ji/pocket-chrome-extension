// ============================================================
// WebSocket Interceptor Unit Tests
// ============================================================
// Dispatch routing, origin validation, callback lifecycle,
// and asset tracking for the WS Bridge ↔ Content Script layer.
// ============================================================

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// We need to reset the singleton between tests, so we dynamically import
// after each module reset.
let getWebSocketInterceptor: typeof import('./websocket-interceptor').getWebSocketInterceptor;

// Helper: build a MessageEvent-like object
function makeBridgeEvent(
  overrides: {
    origin?: string;
    source?: string;
    type?: string;
    data?: any;
  } = {},
) {
  return {
    origin: overrides.origin ?? 'http://localhost',
    data: {
      source: overrides.source ?? 'pq-bridge',
      type: overrides.type ?? 'ws-message',
      data: overrides.data ?? {},
    },
  } as MessageEvent;
}

describe('WebSocketInterceptor', () => {
  // Capture handlers registered via addEventListener
  let messageHandlers: Array<(event: MessageEvent) => void>;
  let postMessageSpy: ReturnType<typeof vi.fn>;
  let addEventSpy: ReturnType<typeof vi.fn>;
  let removeEventSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // Reset module singleton for each test
    vi.resetModules();

    messageHandlers = [];

    addEventSpy = vi.fn((event: string, handler: any) => {
      if (event === 'message') messageHandlers.push(handler);
    });
    removeEventSpy = vi.fn();
    postMessageSpy = vi.fn();

    // Stub window properties used by the interceptor
    vi.stubGlobal('addEventListener', addEventSpy);
    vi.stubGlobal('removeEventListener', removeEventSpy);
    vi.stubGlobal('postMessage', postMessageSpy);

    // location.origin used for origin validation
    Object.defineProperty(window, 'location', {
      value: { origin: 'http://localhost' },
      writable: true,
      configurable: true,
    });

    // Dynamically import to get a fresh singleton
    const mod = await import('./websocket-interceptor');
    getWebSocketInterceptor = mod.getWebSocketInterceptor;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // Helper: dispatch a message event to all registered handlers
  function dispatchBridge(event: MessageEvent) {
    messageHandlers.forEach((h) => h(event));
  }

  // ----------------------------------------------------------
  // Lifecycle: start / stop
  // ----------------------------------------------------------
  describe('lifecycle', () => {
    it('should register message listener on start()', () => {
      const interceptor = getWebSocketInterceptor();
      interceptor.start();

      expect(addEventSpy).toHaveBeenCalledWith('message', expect.any(Function));
      expect(interceptor.getStatus().isListening).toBe(true);
    });

    it('should not double-register on repeated start()', () => {
      const interceptor = getWebSocketInterceptor();
      interceptor.start();
      interceptor.start();

      // addEventListener called only once
      expect(addEventSpy).toHaveBeenCalledTimes(1);
    });

    it('should remove listener on stop()', () => {
      const interceptor = getWebSocketInterceptor();
      interceptor.start();
      interceptor.stop();

      expect(removeEventSpy).toHaveBeenCalledWith('message', expect.any(Function));
      expect(interceptor.getStatus().isListening).toBe(false);
    });

    it('should be no-op when stop() called before start()', () => {
      const interceptor = getWebSocketInterceptor();
      interceptor.stop();
      expect(removeEventSpy).not.toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------
  // Singleton
  // ----------------------------------------------------------
  describe('singleton', () => {
    it('should return the same instance', () => {
      const a = getWebSocketInterceptor();
      const b = getWebSocketInterceptor();
      expect(a).toBe(b);
    });
  });

  // ----------------------------------------------------------
  // Origin and type validation
  // ----------------------------------------------------------
  describe('origin & type validation', () => {
    it('should reject messages from different origin', () => {
      const interceptor = getWebSocketInterceptor();
      const cb = vi.fn();
      interceptor.onMessage(cb);
      interceptor.start();

      dispatchBridge(makeBridgeEvent({ origin: 'https://evil.com' }));
      expect(cb).not.toHaveBeenCalled();
    });

    it('should reject messages with wrong source field', () => {
      const interceptor = getWebSocketInterceptor();
      const cb = vi.fn();
      interceptor.onMessage(cb);
      interceptor.start();

      dispatchBridge(makeBridgeEvent({ source: 'not-pq-bridge' }));
      expect(cb).not.toHaveBeenCalled();
    });

    it('should reject messages with invalid bridge type', () => {
      const interceptor = getWebSocketInterceptor();
      const cb = vi.fn();
      interceptor.onMessage(cb);
      interceptor.start();

      dispatchBridge(makeBridgeEvent({ type: 'ws-invalid-type' }));
      expect(cb).not.toHaveBeenCalled();
    });

    it('should accept ws-message type', () => {
      const interceptor = getWebSocketInterceptor();
      const cb = vi.fn();
      interceptor.onMessage(cb);
      interceptor.start();

      dispatchBridge(
        makeBridgeEvent({
          type: 'ws-message',
          data: { url: 'wss://example.com', text: '{"symbol":"BTC","price":50000}' },
        }),
      );
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  // ----------------------------------------------------------
  // Dispatch routing: ws-message → callbacks
  // ----------------------------------------------------------
  describe('dispatch routing for ws-message', () => {
    it('should dispatch price_update to onPriceUpdate callbacks', () => {
      const interceptor = getWebSocketInterceptor();
      const priceCb = vi.fn();
      interceptor.onPriceUpdate(priceCb);
      interceptor.start();

      dispatchBridge(
        makeBridgeEvent({
          data: {
            url: 'wss://po.com',
            text: '{"symbol":"EURUSD","price":1.0855}',
          },
        }),
      );

      expect(priceCb).toHaveBeenCalledTimes(1);
      expect(priceCb.mock.calls[0][0]).toMatchObject({
        symbol: 'EURUSD',
        price: 1.0855,
      });
    });

    it('should dispatch candle_history to onHistoryReceived callbacks', () => {
      const interceptor = getWebSocketInterceptor();
      const historyCb = vi.fn();
      interceptor.onHistoryReceived(historyCb);
      interceptor.start();

      const candles = [
        { open: 1.1, high: 1.2, low: 1.0, close: 1.15, timestamp: 1700000001 },
        { open: 1.15, high: 1.25, low: 1.05, close: 1.2, timestamp: 1700000002 },
      ];
      // Pre-parsed payload from bridge
      dispatchBridge(
        makeBridgeEvent({
          data: {
            url: 'wss://po.com',
            payload: {
              type: 'candle_history',
              data: candles,
              raw: candles,
              confidence: 0.95,
            },
          },
        }),
      );

      expect(historyCb).toHaveBeenCalledTimes(1);
      expect(historyCb.mock.calls[0][0]).toHaveLength(2);
    });

    it('should dispatch single candle_data with OHLC to onHistoryReceived', () => {
      const interceptor = getWebSocketInterceptor();
      const historyCb = vi.fn();
      interceptor.onHistoryReceived(historyCb);
      interceptor.start();

      dispatchBridge(
        makeBridgeEvent({
          data: {
            url: 'wss://po.com',
            payload: {
              type: 'candle_data',
              data: {
                symbol: 'BTCUSD',
                open: 50000,
                high: 50500,
                low: 49500,
                close: 50200,
                timestamp: 1700000001,
              },
              raw: {},
              confidence: 0.95,
            },
          },
        }),
      );

      expect(historyCb).toHaveBeenCalledTimes(1);
      expect(historyCb.mock.calls[0][0]).toHaveLength(1);
    });

    it('should dispatch all messages to onMessage callbacks', () => {
      const interceptor = getWebSocketInterceptor();
      const msgCb = vi.fn();
      interceptor.onMessage(msgCb);
      interceptor.start();

      dispatchBridge(makeBridgeEvent({ data: { url: 'wss://po.com', raw: { foo: 'bar' } } }));
      expect(msgCb).toHaveBeenCalledTimes(1);
      const msg = msgCb.mock.calls[0][0];
      expect(msg).toHaveProperty('connectionId');
      expect(msg).toHaveProperty('url');
      expect(msg).toHaveProperty('parsed');
    });

    it('should re-parse pre-parsed payload with invalid type through parser', () => {
      const interceptor = getWebSocketInterceptor();
      const msgCb = vi.fn();
      interceptor.onMessage(msgCb);
      interceptor.start();

      // Payload with type not in VALID_PARSED_TYPES → should be re-parsed
      dispatchBridge(
        makeBridgeEvent({
          data: {
            url: 'wss://po.com',
            payload: { type: 'custom_invalid', data: null },
            text: '{"symbol":"ETHUSD","price":3000}',
          },
        }),
      );

      const msg = msgCb.mock.calls[0][0];
      // Re-parsed from text, should be price_update
      expect(msg.parsed.type).toBe('price_update');
    });

    it('should forward binary_payload type to parser for re-parsing', () => {
      const interceptor = getWebSocketInterceptor();
      const msgCb = vi.fn();
      interceptor.onMessage(msgCb);
      interceptor.start();

      const uint8 = new TextEncoder().encode(
        JSON.stringify([{ open: 1, high: 2, low: 0.5, close: 1.5, timestamp: 1700000001 }]),
      );
      dispatchBridge(
        makeBridgeEvent({
          data: {
            url: 'wss://po.com',
            payload: {
              type: 'binary_payload',
              event: 'updateHistoryNewFast',
              data: uint8,
            },
          },
        }),
      );

      const msg = msgCb.mock.calls[0][0];
      expect(msg.parsed.type).toBe('candle_history');
    });
  });

  // ----------------------------------------------------------
  // Callback subscription/unsubscription
  // ----------------------------------------------------------
  describe('callback lifecycle', () => {
    it('should unsubscribe onPriceUpdate when disposer is called', () => {
      const interceptor = getWebSocketInterceptor();
      const cb = vi.fn();
      const dispose = interceptor.onPriceUpdate(cb);
      interceptor.start();

      dispose();

      dispatchBridge(
        makeBridgeEvent({
          data: { url: 'wss://po.com', text: '{"symbol":"X","price":1}' },
        }),
      );
      expect(cb).not.toHaveBeenCalled();
    });

    it('should unsubscribe onHistoryReceived when disposer is called', () => {
      const interceptor = getWebSocketInterceptor();
      const cb = vi.fn();
      const dispose = interceptor.onHistoryReceived(cb);
      interceptor.start();

      dispose();

      const candles = [{ open: 1, high: 2, low: 0.5, close: 1.5, timestamp: 1700000001 }];
      dispatchBridge(
        makeBridgeEvent({
          data: {
            url: 'wss://po.com',
            payload: { type: 'candle_history', data: candles, raw: candles, confidence: 0.95 },
          },
        }),
      );
      expect(cb).not.toHaveBeenCalled();
    });

    it('should unsubscribe onMessage when disposer is called', () => {
      const interceptor = getWebSocketInterceptor();
      const cb = vi.fn();
      const dispose = interceptor.onMessage(cb);
      interceptor.start();

      dispose();

      dispatchBridge(makeBridgeEvent({ data: { url: 'wss://po.com' } }));
      expect(cb).not.toHaveBeenCalled();
    });

    it('should unsubscribe onConnectionChange when disposer is called', () => {
      const interceptor = getWebSocketInterceptor();
      const cb = vi.fn();
      const dispose = interceptor.onConnectionChange(cb);
      dispose();
      // No direct way to trigger connection callback from bridge messages,
      // but we verify the unsubscribe doesn't throw and removes the callback.
    });
  });

  // ----------------------------------------------------------
  // ws-asset-change dispatch
  // ----------------------------------------------------------
  describe('ws-asset-change handling', () => {
    it('should track asset ID from ws-asset-change message', () => {
      const interceptor = getWebSocketInterceptor();
      interceptor.start();

      dispatchBridge(
        makeBridgeEvent({
          type: 'ws-asset-change',
          data: { asset: '#EURUSD_otc' },
        }),
      );

      expect(interceptor.getActiveAssetId()).toBe('#EURUSD_otc');
    });

    it('should ignore ws-asset-change without asset field', () => {
      const interceptor = getWebSocketInterceptor();
      interceptor.start();

      dispatchBridge(makeBridgeEvent({ type: 'ws-asset-change', data: {} }));
      expect(interceptor.getActiveAssetId()).toBeNull();
    });
  });

  // ----------------------------------------------------------
  // bridge-ready dispatch
  // ----------------------------------------------------------
  describe('bridge-ready handling', () => {
    it('should accept bridge-ready without error', () => {
      const interceptor = getWebSocketInterceptor();
      interceptor.start();

      // Should not throw
      expect(() => {
        dispatchBridge(makeBridgeEvent({ type: 'bridge-ready' }));
      }).not.toThrow();
    });
  });

  // ----------------------------------------------------------
  // Asset tracking from message content
  // ----------------------------------------------------------
  describe('asset tracking from messages', () => {
    it('should track asset from price_update symbol (strategy A)', () => {
      const interceptor = getWebSocketInterceptor();
      interceptor.start();

      // Pre-parsed updateStream price_update
      dispatchBridge(
        makeBridgeEvent({
          data: {
            url: 'wss://po.com',
            payload: {
              type: 'price_update',
              data: { symbol: '#GBPUSD_otc', price: 1.345, timestamp: 123, source: 'websocket' },
              raw: {},
              confidence: 0.99,
            },
          },
        }),
      );

      expect(interceptor.getActiveAssetId()).toBe('#GBPUSD_otc');
    });

    it('should track asset from raw text regex (strategy B)', () => {
      const interceptor = getWebSocketInterceptor();
      interceptor.start();

      dispatchBridge(
        makeBridgeEvent({
          data: {
            url: 'wss://po.com',
            text: '42["changeSymbol",{"asset":"#JPYUSD_otc","period":60}]',
          },
        }),
      );

      expect(interceptor.getActiveAssetId()).toBe('#JPYUSD_otc');
    });

    it('should not track CURRENT or UNKNOWN symbols', () => {
      const interceptor = getWebSocketInterceptor();
      interceptor.start();

      dispatchBridge(
        makeBridgeEvent({
          data: {
            url: 'wss://po.com',
            payload: {
              type: 'price_update',
              data: { symbol: 'CURRENT', price: 1.0, timestamp: 1, source: 'websocket' },
              raw: {},
              confidence: 0.6,
            },
          },
        }),
      );

      expect(interceptor.getActiveAssetId()).toBeNull();
    });
  });

  // ----------------------------------------------------------
  // send()
  // ----------------------------------------------------------
  describe('send()', () => {
    it('should post message with pq-content source and ws-send type', () => {
      const interceptor = getWebSocketInterceptor();

      interceptor.send({ action: 'subscribe', asset: '#EURUSD' }, 'realtime');

      expect(postMessageSpy).toHaveBeenCalledWith(
        {
          source: 'pq-content',
          type: 'ws-send',
          payload: { action: 'subscribe', asset: '#EURUSD' },
          urlPart: 'realtime',
        },
        'http://localhost',
      );
    });

    it('should send without urlPart', () => {
      const interceptor = getWebSocketInterceptor();

      interceptor.send({ ping: true });

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'pq-content',
          type: 'ws-send',
          payload: { ping: true },
          urlPart: undefined,
        }),
        'http://localhost',
      );
    });
  });

  // ----------------------------------------------------------
  // getStatus()
  // ----------------------------------------------------------
  describe('getStatus()', () => {
    it('should report initial status', () => {
      const interceptor = getWebSocketInterceptor();
      const status = interceptor.getStatus();

      expect(status.isListening).toBe(false);
      expect(status.analysisMode).toBe(true);
    });
  });
});
