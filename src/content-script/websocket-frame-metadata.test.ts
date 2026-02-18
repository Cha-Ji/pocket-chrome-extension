// ============================================================
// WebSocket Frame Metadata Unit Tests
// ============================================================
// classifyFrame()의 프레임 타입 분류와 바이트 크기 계산을 검증한다.
// string / ArrayBuffer / Uint8Array / Blob / BufferSource 각각에 대해
// frameType과 frameSizeBytes가 기대대로 기록되는지 테스트.
// ============================================================

import { describe, it, expect } from 'vitest';
import { classifyFrame } from './websocket-frame-metadata';

describe('classifyFrame', () => {
  // ──────────────────────────────────────────────────────────
  // frameType classification
  // ──────────────────────────────────────────────────────────

  describe('frameType classification', () => {
    it('string raw → text', () => {
      const result = classifyFrame({ raw: 'hello world' });
      expect(result.frameType).toBe('text');
    });

    it('ArrayBuffer raw → binary', () => {
      const buf = new ArrayBuffer(16);
      const result = classifyFrame({ raw: buf });
      expect(result.frameType).toBe('binary');
    });

    it('Uint8Array raw → binary', () => {
      const arr = new Uint8Array([0x01, 0x02, 0x03]);
      const result = classifyFrame({ raw: arr });
      expect(result.frameType).toBe('binary');
    });

    it('Blob raw → binary', () => {
      const blob = new Blob(['test data']);
      const result = classifyFrame({ raw: blob });
      expect(result.frameType).toBe('binary');
    });

    it('DataView (BufferSource) raw → binary', () => {
      const dv = new DataView(new ArrayBuffer(8));
      const result = classifyFrame({ raw: dv });
      expect(result.frameType).toBe('binary');
    });

    it('null raw with dataType=string → text (bridge fallback)', () => {
      const result = classifyFrame({ raw: null, dataType: 'string' });
      expect(result.frameType).toBe('text');
    });

    it('null raw with dataType=arraybuffer → binary (bridge fallback)', () => {
      const result = classifyFrame({ raw: null, dataType: 'arraybuffer' });
      expect(result.frameType).toBe('binary');
    });

    it('null raw with dataType=blob → binary (bridge fallback)', () => {
      const result = classifyFrame({ raw: null, dataType: 'blob' });
      expect(result.frameType).toBe('binary');
    });

    it('number raw → unknown', () => {
      const result = classifyFrame({ raw: 42 });
      expect(result.frameType).toBe('unknown');
    });

    it('null raw without dataType → unknown', () => {
      const result = classifyFrame({ raw: null });
      expect(result.frameType).toBe('unknown');
    });

    it('undefined raw without dataType → unknown', () => {
      const result = classifyFrame({ raw: undefined });
      expect(result.frameType).toBe('unknown');
    });

    it('object raw (not buffer) without dataType → unknown', () => {
      const result = classifyFrame({ raw: { foo: 'bar' } });
      expect(result.frameType).toBe('unknown');
    });
  });

  // ──────────────────────────────────────────────────────────
  // frameSizeBytes
  // ──────────────────────────────────────────────────────────

  describe('frameSizeBytes', () => {
    it('string: UTF-8 byte length for ASCII', () => {
      const result = classifyFrame({ raw: 'hello' });
      expect(result.frameSizeBytes).toBe(5);
    });

    it('string: UTF-8 byte length for multi-byte chars', () => {
      // '한글' = 2 chars, 6 bytes in UTF-8 (3 bytes per Korean char)
      const result = classifyFrame({ raw: '한글' });
      expect(result.frameSizeBytes).toBe(6);
    });

    it('string: empty string → 0 bytes', () => {
      const result = classifyFrame({ raw: '' });
      expect(result.frameSizeBytes).toBe(0);
    });

    it('ArrayBuffer: byteLength', () => {
      const buf = new ArrayBuffer(256);
      const result = classifyFrame({ raw: buf });
      expect(result.frameSizeBytes).toBe(256);
    });

    it('ArrayBuffer: zero-length', () => {
      const buf = new ArrayBuffer(0);
      const result = classifyFrame({ raw: buf });
      expect(result.frameSizeBytes).toBe(0);
    });

    it('Uint8Array: byteLength', () => {
      const arr = new Uint8Array(128);
      const result = classifyFrame({ raw: arr });
      expect(result.frameSizeBytes).toBe(128);
    });

    it('Blob: size', () => {
      const blob = new Blob(['test data']);
      const result = classifyFrame({ raw: blob });
      expect(result.frameSizeBytes).toBe(9); // "test data" = 9 bytes
    });

    it('DataView: byteLength', () => {
      const dv = new DataView(new ArrayBuffer(32));
      const result = classifyFrame({ raw: dv });
      expect(result.frameSizeBytes).toBe(32);
    });

    it('prefers bridge dataSize over runtime calculation', () => {
      // Even though raw is 'hello' (5 bytes), bridge says 42
      const result = classifyFrame({ raw: 'hello', dataSize: 42 });
      expect(result.frameSizeBytes).toBe(42);
    });

    it('bridge dataSize=0 is respected (not skipped)', () => {
      const result = classifyFrame({ raw: 'hello', dataSize: 0 });
      expect(result.frameSizeBytes).toBe(0);
    });

    it('falls back to text field when raw is null', () => {
      const result = classifyFrame({ raw: null, text: 'hello' });
      expect(result.frameSizeBytes).toBe(5);
    });

    it('text fallback with multi-byte chars', () => {
      const result = classifyFrame({ raw: null, text: '한글' });
      expect(result.frameSizeBytes).toBe(6);
    });

    it('returns 0 when nothing is resolvable', () => {
      const result = classifyFrame({ raw: null });
      expect(result.frameSizeBytes).toBe(0);
    });

    it('returns 0 for unknown type without dataSize', () => {
      const result = classifyFrame({ raw: 42 });
      expect(result.frameSizeBytes).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────
  // binaryPreview (default OFF)
  // ──────────────────────────────────────────────────────────

  describe('binaryPreview', () => {
    it('is undefined by default (feature flag OFF)', () => {
      const buf = new ArrayBuffer(100);
      const result = classifyFrame({ raw: buf });
      expect(result.binaryPreview).toBeUndefined();
    });

    it('is undefined for text frames regardless of flag', () => {
      const result = classifyFrame({ raw: 'hello' });
      expect(result.binaryPreview).toBeUndefined();
    });

    it('is undefined for Blob frames (default OFF)', () => {
      const blob = new Blob([new Uint8Array(200)]);
      const result = classifyFrame({ raw: blob });
      expect(result.binaryPreview).toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────────────────
  // Real-world-like scenarios
  // ──────────────────────────────────────────────────────────

  describe('realistic scenarios', () => {
    it('Socket.IO text message (typical demo env)', () => {
      const socketIOMsg = '42["updateStream",[[\"#EURUSD_otc\",1708300800,1.08540]]]';
      const result = classifyFrame({ raw: socketIOMsg, dataType: 'string' });
      expect(result.frameType).toBe('text');
      expect(result.frameSizeBytes).toBe(new TextEncoder().encode(socketIOMsg).byteLength);
    });

    it('binary ArrayBuffer with bridge dataSize (typical real env)', () => {
      const buf = new ArrayBuffer(1024);
      const result = classifyFrame({
        raw: buf,
        dataType: 'arraybuffer',
        dataSize: 1024,
      });
      expect(result.frameType).toBe('binary');
      expect(result.frameSizeBytes).toBe(1024);
    });

    it('Blob from real env WebSocket with bridge dataSize', () => {
      const blob = new Blob([new Uint8Array(512)]);
      const result = classifyFrame({
        raw: blob,
        dataType: 'blob',
        dataSize: 512,
      });
      expect(result.frameType).toBe('binary');
      expect(result.frameSizeBytes).toBe(512);
    });

    it('null raw with bridge metadata only (structured clone edge case)', () => {
      // When postMessage structured clone fails to transfer raw data
      const result = classifyFrame({
        raw: null,
        dataType: 'arraybuffer',
        dataSize: 2048,
        text: null,
      });
      expect(result.frameType).toBe('binary');
      expect(result.frameSizeBytes).toBe(2048);
    });
  });
});
