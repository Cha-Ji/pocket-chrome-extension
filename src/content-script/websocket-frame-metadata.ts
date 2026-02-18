// ============================================================
// WebSocket Frame Metadata — 프레임 타입 분류 + 바이트 크기 계산
// ============================================================
// PR #111 codex 피드백: ArrayBuffer/Blob 바이너리 프레임이 text로
// 분류되거나 frameSize가 payload.length(문자 수) 기반으로 부정확해지는
// 문제를 해결하기 위한 유틸리티.
//
// real env(실거래) WebSocket은 demo와 달리 바이너리 프레임을 더 많이
// 사용할 수 있으므로, 정확한 분류와 바이트 단위 크기 기록이 필수.
// ============================================================

import type { FrameMetadata, FrameType } from './websocket-types';
export type { FrameMetadata, FrameType };

/**
 * classifyFrame 입력 인터페이스
 * Main World bridge에서 전달된 데이터를 기반으로 프레임을 분류한다.
 */
export interface ClassifyFrameInput {
  /** Main World bridge에서 전달된 원본 데이터 */
  raw: unknown;
  /** bridge가 보고한 원본 데이터 타입 ("string" | "arraybuffer" | "blob" | ...) */
  dataType?: string;
  /** bridge가 Main World에서 미리 계산한 바이트 크기 */
  dataSize?: number;
  /** 디코딩된 텍스트 (string 프레임의 경우) */
  text?: string | null;
}

/** 바이너리 preview 기능 플래그 — 프라이버시/용량 관점에서 기본 OFF */
const ENABLE_BINARY_PREVIEW = false;
/** preview 최대 바이트 수 */
const BINARY_PREVIEW_BYTES = 64;

/**
 * WebSocket 프레임의 타입과 바이트 크기를 분류한다.
 *
 * 분류 우선순위:
 * 1. 런타임 instanceof (가장 정확)
 * 2. bridge dataType 문자열 fallback
 *
 * 크기 우선순위:
 * 1. bridge dataSize (Main World에서 원본 데이터 기준 계산 — 가장 정확)
 * 2. 런타임 byteLength / size
 * 3. TextEncoder UTF-8 변환
 * 4. string.length fallback (ASCII 한정 정확)
 *
 * @returns FrameMetadata (frameSizeBytes 단위: 바이트)
 */
export function classifyFrame(input: ClassifyFrameInput): FrameMetadata {
  const { raw, dataType, dataSize, text } = input;

  const frameType = resolveFrameType(raw, dataType);
  const frameSizeBytes = resolveFrameSize(raw, dataType, dataSize, text);

  const metadata: FrameMetadata = { frameType, frameSizeBytes };

  // 바이너리 preview: 기본 OFF, feature flag로 활성화 가능
  if (ENABLE_BINARY_PREVIEW && frameType === 'binary' && raw instanceof ArrayBuffer) {
    metadata.binaryPreview = new Uint8Array(raw.slice(0, BINARY_PREVIEW_BYTES));
  }

  return metadata;
}

/**
 * 프레임 타입 분류
 * - string → 'text'
 * - ArrayBuffer / Uint8Array / BufferSource → 'binary'
 * - Blob → 'binary'
 * - 기타 → 'unknown'
 */
function resolveFrameType(raw: unknown, dataType?: string): FrameType {
  // 1. 런타임 instanceof 기반 분류 (가장 정확)
  if (typeof raw === 'string') return 'text';
  if (raw instanceof ArrayBuffer) return 'binary';
  if (raw instanceof Uint8Array) return 'binary';
  if (typeof Blob !== 'undefined' && raw instanceof Blob) return 'binary';
  // ArrayBufferView 등 기타 BufferSource (DataView, Float32Array 등)
  if (raw != null && typeof (raw as any).byteLength === 'number') return 'binary';

  // 2. bridge에서 전달된 dataType 문자열 기반 fallback
  if (dataType === 'string') return 'text';
  if (dataType === 'arraybuffer' || dataType === 'blob') return 'binary';

  return 'unknown';
}

/**
 * 프레임 크기를 바이트 단위로 계산
 *
 * 모든 반환값은 바이트(byte) 단위이다.
 * - text: UTF-8 인코딩 기준 바이트 수 (TextEncoder 사용)
 * - binary: byteLength 또는 size (Blob)
 */
function resolveFrameSize(
  raw: unknown,
  _dataType?: string,
  dataSize?: number,
  text?: string | null,
): number {
  // 1. bridge가 Main World에서 미리 계산한 크기 (가장 정확)
  if (typeof dataSize === 'number' && dataSize >= 0) return dataSize;

  // 2. 런타임 타입 기반 크기 계산
  if (typeof raw === 'string') {
    return utf8ByteLength(raw);
  }
  if (raw instanceof ArrayBuffer) return raw.byteLength;
  if (raw instanceof Uint8Array) return raw.byteLength;
  if (typeof Blob !== 'undefined' && raw instanceof Blob) return raw.size;
  if (raw != null && typeof (raw as any).byteLength === 'number') {
    return (raw as any).byteLength;
  }

  // 3. text 필드에서 크기 추정
  if (typeof text === 'string') {
    return utf8ByteLength(text);
  }

  return 0;
}

/** UTF-8 바이트 길이 계산 (TextEncoder 가용 시 사용, 아니면 문자 수 fallback) */
function utf8ByteLength(str: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str).byteLength;
  }
  // fallback: ASCII 문자열의 경우 문자 수 = 바이트 수
  return str.length;
}
