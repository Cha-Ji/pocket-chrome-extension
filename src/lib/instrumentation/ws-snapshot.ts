// ============================================================
// WebSocket Snapshot — Capture message schemas (no raw values)
// ============================================================
// Records *shape* of WS messages: key names, value types, array
// lengths.  Never stores actual values (prices, tokens, IDs).
// Maintains a capped ring buffer in memory only.
// ============================================================

import type { PocketOptionEnvironment } from './env-detect';

/** Schema representation of a single value */
export type SchemaNode =
  | { type: 'string'; length: number }
  | { type: 'number' }
  | { type: 'boolean' }
  | { type: 'null' }
  | { type: 'array'; length: number; itemSchema?: SchemaNode }
  | { type: 'object'; keys: string[] }
  | { type: 'binary'; byteLength: number }
  | { type: 'unknown' };

/** A single captured message schema entry */
export interface WSSchemaEntry {
  timestamp: number;
  /** Socket.IO event name if detected, else null */
  eventName: string | null;
  /** Whether this was a text or binary frame */
  frameType: 'text' | 'binary' | 'unknown';
  /** Top-level schema of the parsed payload */
  schema: SchemaNode;
  /** Raw byte length / string length (for sizing analysis) */
  frameSize: number;
}

/** Aggregated WS snapshot for export */
export interface WSSnapshotResult {
  environment: PocketOptionEnvironment;
  timestamp: number;
  /** Total messages captured in this session */
  totalCaptured: number;
  /** Unique event names seen */
  eventNames: string[];
  /** Frequency count by event name */
  eventFrequency: Record<string, number>;
  /** Frame type distribution */
  frameTypeDistribution: { text: number; binary: number; unknown: number };
  /** Representative schema per event name (first seen) */
  schemaByEvent: Record<string, SchemaNode>;
  /** Most recent N entries (for detailed inspection) */
  recentEntries: WSSchemaEntry[];
}

/** Max entries in ring buffer */
const MAX_ENTRIES = 200;

/** Max recent entries in export */
const MAX_RECENT_EXPORT = 30;

/**
 * Extract a schema node from an arbitrary value.
 * Recursion depth is capped to prevent stack overflow on deep structures.
 */
export function extractSchema(value: unknown, depth: number = 0): SchemaNode {
  if (depth > 5) return { type: 'unknown' };

  if (value === null || value === undefined) {
    return { type: 'null' };
  }

  if (typeof value === 'string') {
    return { type: 'string', length: value.length };
  }

  if (typeof value === 'number') {
    return { type: 'number' };
  }

  if (typeof value === 'boolean') {
    return { type: 'boolean' };
  }

  if (value instanceof ArrayBuffer) {
    return { type: 'binary', byteLength: value.byteLength };
  }

  if (ArrayBuffer.isView(value)) {
    return { type: 'binary', byteLength: value.byteLength };
  }

  if (Array.isArray(value)) {
    const itemSchema = value.length > 0 ? extractSchema(value[0], depth + 1) : undefined;
    return { type: 'array', length: value.length, itemSchema };
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return { type: 'object', keys };
  }

  return { type: 'unknown' };
}

/**
 * Try to extract a Socket.IO event name from raw text.
 * Socket.IO messages look like: `42["eventName", ...]`
 */
function extractEventName(text: string | null | undefined): string | null {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/^\d+\["([^"]+)"/);
  return match ? match[1] : null;
}

/**
 * WebSocket schema collector.
 * - Call `record()` for each WS message (from the interceptor callback)
 * - Call `snapshot()` to get the aggregated result
 * - Call `clear()` to reset
 */
export class WSSchemaCollector {
  private entries: WSSchemaEntry[] = [];
  private eventFreq: Map<string, number> = new Map();
  private firstSchemaByEvent: Map<string, SchemaNode> = new Map();
  private frameTypeCounts = { text: 0, binary: 0, unknown: 0 };
  private totalCaptured = 0;

  /**
   * Record a WS message. Only the *schema* is stored.
   * @param parsed - The already-parsed payload (from WebSocketParser or raw JSON.parse)
   * @param rawText - The original text frame (used to extract Socket.IO event name)
   * @param rawSize - Byte length of the original frame
   * @param frameType - Whether text or binary
   */
  record(
    parsed: unknown,
    rawText: string | null | undefined,
    rawSize: number,
    frameType: 'text' | 'binary' | 'unknown' = 'unknown',
  ): void {
    this.totalCaptured++;

    const eventName = extractEventName(rawText);
    const schema = extractSchema(parsed);

    const entry: WSSchemaEntry = {
      timestamp: Date.now(),
      eventName,
      frameType,
      schema,
      frameSize: rawSize,
    };

    // Ring buffer
    if (this.entries.length >= MAX_ENTRIES) {
      this.entries.shift();
    }
    this.entries.push(entry);

    // Frequency tracking
    const evKey = eventName ?? '__unknown__';
    this.eventFreq.set(evKey, (this.eventFreq.get(evKey) ?? 0) + 1);

    // First-seen schema per event
    if (!this.firstSchemaByEvent.has(evKey)) {
      this.firstSchemaByEvent.set(evKey, schema);
    }

    // Frame type distribution
    this.frameTypeCounts[frameType]++;
  }

  /** Build the aggregated snapshot for export. */
  snapshot(environment: PocketOptionEnvironment): WSSnapshotResult {
    const eventNames = Array.from(this.eventFreq.keys())
      .filter((k) => k !== '__unknown__')
      .sort();

    const eventFrequency: Record<string, number> = {};
    for (const [k, v] of this.eventFreq) {
      eventFrequency[k] = v;
    }

    const schemaByEvent: Record<string, SchemaNode> = {};
    for (const [k, v] of this.firstSchemaByEvent) {
      schemaByEvent[k] = v;
    }

    const recentEntries = this.entries.slice(-MAX_RECENT_EXPORT);

    return {
      environment,
      timestamp: Date.now(),
      totalCaptured: this.totalCaptured,
      eventNames,
      eventFrequency,
      frameTypeDistribution: { ...this.frameTypeCounts },
      schemaByEvent,
      recentEntries,
    };
  }

  /** Clear all collected data. */
  clear(): void {
    this.entries = [];
    this.eventFreq.clear();
    this.firstSchemaByEvent.clear();
    this.frameTypeCounts = { text: 0, binary: 0, unknown: 0 };
    this.totalCaptured = 0;
  }

  /** Number of entries currently in the ring buffer. */
  get size(): number {
    return this.entries.length;
  }
}
