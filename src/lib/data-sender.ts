// ============================================================
// Data Sender (to Local Collector)
// ============================================================
// 역할: 수집된 캔들을 로컬 서버로 전송
// ============================================================

import { loggers } from './logger';

const log = loggers.dataSender;
const SERVER_URL = 'http://localhost:3001';

/**
 * NOTE:
 * - 초기 구현은 DEV 모드에서만 로컬 collector(localhost:3001)로 전송하도록 가드가 있었음.
 * - 현재는 실사용에서도 수집/모니터링이 필요하므로 production 빌드에서도 전송을 허용한다.
 * - 로컬 서버가 꺼져있으면 네트워크 에러로만 처리되고 기능은 자동으로 degrade 된다.
 */

// ============================================================
// Retry Classification
// ============================================================

/** HTTP status codes that indicate a transient failure worth retrying */
const RETRIABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

/** Error messages (substring match) from server that indicate transient issues */
const RETRIABLE_ERROR_PATTERNS = ['database is locked', 'SQLITE_BUSY', 'ECONNRESET', 'ETIMEDOUT'];

/**
 * Determine whether an HTTP error response should be retried.
 *
 * - 408/429/5xx → retriable (server-side transient)
 * - "database is locked" in body → retriable (SQLite contention)
 * - 400/401/403/404 → non-retriable (client error)
 */
export function isRetriableStatus(status: number, responseBody?: string): boolean {
  if (RETRIABLE_STATUS_CODES.has(status)) return true;
  if (responseBody) {
    const lower = responseBody.toLowerCase();
    return RETRIABLE_ERROR_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
  }
  return false;
}

/**
 * Compute exponential backoff with jitter.
 * Formula: baseMs * 2^attempt + random(0, baseMs/2)
 */
export function backoffWithJitter(attempt: number, baseMs = 1000): number {
  const exponential = baseMs * Math.pow(2, attempt);
  const jitter = Math.random() * (baseMs / 2);
  return Math.floor(exponential + jitter);
}

// ============================================================
// Failed Chunk Queue
// ============================================================

const MAX_RETRY_QUEUE_SIZE = 5;

/** 청크 당 최대 캔들 수 — 서버 body 파싱/메모리 부담 방지 */
export const BULK_CHUNK_SIZE = 500;

interface QueuedChunk {
  bodyStr: string;
  symbol: string;
  candleCount: number;
  queuedAt: number;
}

const retryQueue: QueuedChunk[] = [];

/** DataSender 전송 통계 */
export interface DataSenderStats {
  serverOnline: boolean;
  lastHealthCheck: number;
  bulkSendCount: number;
  bulkSuccessCount: number;
  bulkFailCount: number;
  bulkRetryCount: number;
  bulkTotalCandles: number;
  lastBulkSendAt: number;
  realtimeSendCount: number;
  realtimeSuccessCount: number;
  realtimeFailCount: number;
  retryQueueSize: number;
  retryQueueDropped: number;
}

const senderStats = {
  serverOnline: false,
  lastHealthCheck: 0,
  bulkSendCount: 0,
  bulkSuccessCount: 0,
  bulkFailCount: 0,
  bulkRetryCount: 0,
  bulkTotalCandles: 0,
  lastBulkSendAt: 0,
  realtimeSendCount: 0,
  realtimeSuccessCount: 0,
  realtimeFailCount: 0,
  retryQueueDropped: 0,
};

/** Loose candle shape accepted by DataSender (symbol or ticker) */
export interface CandleLike {
  symbol?: string;
  ticker?: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export const DataSender = {
  /**
   * 서버 상태 확인
   */
  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${SERVER_URL}/health`);
      senderStats.serverOnline = res.ok;
      senderStats.lastHealthCheck = Date.now();
      return res.ok;
    } catch {
      senderStats.serverOnline = false;
      senderStats.lastHealthCheck = Date.now();
      return false;
    }
  },

  /**
   * 실시간 캔들 전송
   */
  async sendCandle(candle: CandleLike): Promise<void> {
    senderStats.realtimeSendCount++;
    try {
      const payload = {
        symbol: candle.symbol || candle.ticker || 'UNKNOWN',
        interval: '1m',
        timestamp: candle.timestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume || 0,
        source: 'realtime',
      };

      log.debug(`Sending candle: ${payload.symbol} @ ${payload.timestamp}`);

      const response = await fetch(`${SERVER_URL}/api/candle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        senderStats.realtimeSuccessCount++;
      } else {
        senderStats.realtimeFailCount++;
        const errorText = await response.text();
        log.error(`Server error (${response.status}): ${errorText}`);
      }
    } catch (error: unknown) {
      senderStats.realtimeFailCount++;
      log.error(`Network error: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  /**
   * 과거 데이터 Bulk 전송 (with retry for transient failures)
   *
   * Retry policy:
   *  - Network errors (fetch throw): always retry
   *  - HTTP 408/429/5xx: retry (server transient)
   *  - "database is locked" in body: retry (SQLite contention)
   *  - HTTP 400/401/403/404: non-retriable (client error, fail immediately)
   *  - Backoff: exponential with jitter
   *  - On final failure: queue chunk for later retry (bounded queue)
   */
  async sendHistory(candles: CandleLike[], maxRetries = 3): Promise<void> {
    if (candles.length === 0) return;

    const firstCandle = candles[0];
    const symbol = firstCandle.symbol || firstCandle.ticker || 'UNKNOWN';
    log.data(`Attempting bulk send: ${candles.length} candles for ${symbol}`);

    const mapped = candles
      .map((c) => ({
        symbol: (c.symbol || c.ticker || symbol).toUpperCase().replace(/\s+/g, '-'),
        interval: '1m',
        timestamp: Number(c.timestamp),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: Number(c.volume || 0),
        source: 'history',
      }))
      .filter(
        (c) =>
          c.symbol &&
          c.symbol !== 'UNKNOWN' &&
          !isNaN(c.timestamp) &&
          c.timestamp > 0 &&
          !isNaN(c.open) &&
          !isNaN(c.high) &&
          !isNaN(c.low) &&
          !isNaN(c.close),
      );

    if (mapped.length === 0) {
      log.fail(
        `All ${candles.length} candles filtered out during validation. Sample: ${JSON.stringify(candles[0])}`,
      );
      return;
    }

    if (mapped.length !== candles.length) {
      log.data(
        `Filtered: ${candles.length} → ${mapped.length} candles (${candles.length - mapped.length} invalid)`,
      );
    }

    // 청크 분할: BULK_CHUNK_SIZE 초과 시 순차 전송
    const chunks: typeof mapped[] = [];
    for (let i = 0; i < mapped.length; i += BULK_CHUNK_SIZE) {
      chunks.push(mapped.slice(i, i + BULK_CHUNK_SIZE));
    }

    const sym = mapped[0].symbol;
    log.data(
      `Sending ${mapped.length} candles for ${sym} in ${chunks.length} chunk(s) to ${SERVER_URL}/api/candles/bulk`,
    );

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      senderStats.bulkSendCount++;

      const bodyStr = JSON.stringify({ candles: chunk });
      if (chunks.length > 1) {
        log.data(
          `Chunk ${ci + 1}/${chunks.length}: ${chunk.length} candles (${(bodyStr.length / 1024).toFixed(1)}KB)`,
        );
      }

      const sent = await this._sendWithRetry(bodyStr, sym, chunk.length, maxRetries);

      if (!sent) {
        this._enqueueForRetry(bodyStr, sym, chunk.length);
      }
    }
  },

  /**
   * Internal: send with retry loop (handles both network and HTTP transient errors)
   * Returns true if the send ultimately succeeded.
   *
   * bulkRetryCount semantics: incremented exactly once per retry attempt
   * (i.e., for each attempt > 0). No double-counting on success path.
   */
  async _sendWithRetry(
    bodyStr: string,
    symbol: string,
    _candleCount: number,
    maxRetries: number,
  ): Promise<boolean> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Count each retry attempt exactly once (attempt 0 is the initial try)
      if (attempt > 0) {
        senderStats.bulkRetryCount++;
      }

      try {
        const response = await fetch(`${SERVER_URL}/api/candles/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: bodyStr,
        });

        if (response.ok) {
          const result = await response.json();
          senderStats.bulkSuccessCount++;
          senderStats.bulkTotalCandles += result.count;
          senderStats.lastBulkSendAt = Date.now();
          log.success(`Bulk saved: ${result.count} candles (symbol: ${symbol})`);
          return true;
        }

        // HTTP error — check if retriable
        const errorText = await response.text();

        if (isRetriableStatus(response.status, errorText) && attempt < maxRetries) {
          const waitMs = backoffWithJitter(attempt);
          log.data(
            `Bulk send retriable HTTP ${response.status} (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${waitMs}ms...`,
          );
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }

        // Non-retriable HTTP error or last attempt
        log.fail(`Bulk send failed (HTTP ${response.status}): ${errorText}`);
        senderStats.bulkFailCount++;
        return false;
      } catch (error: unknown) {
        // Network error — always retriable
        if (attempt < maxRetries) {
          const waitMs = backoffWithJitter(attempt);
          log.data(
            `Bulk send network error (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${waitMs}ms...`,
          );
          await new Promise((r) => setTimeout(r, waitMs));
        } else {
          senderStats.bulkFailCount++;
          log.fail(
            `Bulk send network error after ${maxRetries + 1} attempts: ${error instanceof Error ? error.message : String(error)}`,
          );
          return false;
        }
      }
    }
    return false;
  },

  /**
   * Internal: enqueue a failed chunk for later retry.
   * Bounded by MAX_RETRY_QUEUE_SIZE; oldest chunks are dropped.
   */
  _enqueueForRetry(bodyStr: string, symbol: string, candleCount: number): void {
    if (retryQueue.length >= MAX_RETRY_QUEUE_SIZE) {
      retryQueue.shift(); // drop oldest
      senderStats.retryQueueDropped++;
      log.data(`Retry queue full (max ${MAX_RETRY_QUEUE_SIZE}), dropped oldest chunk`);
    }
    retryQueue.push({ bodyStr, symbol, candleCount, queuedAt: Date.now() });
  },

  /**
   * Drain the retry queue: attempt to re-send all queued chunks.
   * Returns count of successfully sent chunks.
   */
  async drainRetryQueue(maxRetries = 2): Promise<number> {
    if (retryQueue.length === 0) return 0;

    let sent = 0;
    const chunks = retryQueue.splice(0); // take all

    for (const chunk of chunks) {
      const ok = await this._sendWithRetry(
        chunk.bodyStr,
        chunk.symbol,
        chunk.candleCount,
        maxRetries,
      );
      if (ok) {
        sent++;
      } else {
        // Re-enqueue failed chunk (if still within limits)
        this._enqueueForRetry(chunk.bodyStr, chunk.symbol, chunk.candleCount);
      }
    }

    return sent;
  },

  /** 전송 통계 스냅샷 반환 */
  getStats(): DataSenderStats {
    return {
      ...senderStats,
      retryQueueSize: retryQueue.length,
    };
  },

  /** Reset stats and retry queue (for testing only) */
  _resetForTesting(): void {
    senderStats.serverOnline = false;
    senderStats.lastHealthCheck = 0;
    senderStats.bulkSendCount = 0;
    senderStats.bulkSuccessCount = 0;
    senderStats.bulkFailCount = 0;
    senderStats.bulkRetryCount = 0;
    senderStats.bulkTotalCandles = 0;
    senderStats.lastBulkSendAt = 0;
    senderStats.realtimeSendCount = 0;
    senderStats.realtimeSuccessCount = 0;
    senderStats.realtimeFailCount = 0;
    senderStats.retryQueueDropped = 0;
    retryQueue.length = 0;
  },
};
