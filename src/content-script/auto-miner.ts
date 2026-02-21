import { PayoutMonitor } from './payout-monitor';
import { getWebSocketInterceptor } from './websocket-interceptor';
import { loggers } from '../lib/logger';
import type { CandleData } from './websocket-types';

const log = loggers.miner;

// ============================================================
// 벌크 히스토리 수집 설정
// ============================================================

interface BulkMiningConfig {
  offsetSeconds: number; // 한 요청당 과거 범위 (초). 300000 = 3.5일 = 5000개 1분봉
  period: number; // 캔들 주기 (60 = 1분봉)
  maxDaysBack: number; // 최대 수집 일수
  requestDelayMs: number; // 응답 후 다음 요청까지 딜레이 (ms)
  minPayout: number; // 채굴 대상 최소 페이아웃(%)
  targetSymbol?: string; // 고정 수집 심볼(미지정 시 기존 payout 기반 순회)
  targetSymbols?: string[]; // 고정 수집 심볼 목록(미지정 시 기존 payout 기반 순회)
}

interface AssetMiningProgress {
  asset: string;
  totalCandles: number;
  oldestTimestamp: number; // 가장 오래된 캔들 시점 (초)
  newestTimestamp: number; // 가장 새로운 캔들 시점 (초)
  requestCount: number;
  isComplete: boolean;
  assetId?: string; // 현재 자산에 대해 확정된 WS asset ID
  fixedSeedTimestamp?: number; // 고정 심볼 모드에서 재시작 기준점 (초)
}

interface MiningState {
  isActive: boolean;
  currentAsset: string | null;
  completedAssets: Set<string>;
  failedAssets: Set<string>;
  consecutiveUnavailable: number;
  payoutWaitAttempts: number;
  config: BulkMiningConfig;
  progress: Map<string, AssetMiningProgress>;
  // 응답 기반 제어
  pendingRequest: boolean;
  retryCount: number;
  startedAt: number; // 채굴 시작 시간 (ms)
  assetIdCache: Map<string, string>; // asset name -> ws asset ID 캐시
}

const DEFAULT_CONFIG: BulkMiningConfig = {
  offsetSeconds: 300000, // 3.5일 = 약 5000개 1분봉 (#61)
  period: 60, // 1분봉
  maxDaysBack: 60, // 최대 60일 (#141 상향)
  requestDelayMs: 500, // 응답 후 500ms 대기
  minPayout: 92, // 기본 92% 이상 페이아웃 자산만 채굴
  targetSymbol: undefined,
  targetSymbols: undefined,
};

const MAX_RETRIES = 3;
const MAX_SWITCH_RETRIES = 2; // 자산 전환 재시도 횟수
const CONSECUTIVE_UNAVAILABLE_THRESHOLD = 5; // 연속 N개 unavailable 시 일시 중단 (3→5 상향)
const MARKET_CLOSED_WAIT_MS = 5 * 60 * 1000; // 시장 닫힘 판단 시 5분 대기
const PAYOUT_WAIT_INTERVAL_MS = 5000; // 페이아웃 데이터 대기 주기
const PAYOUT_MAX_WAIT_ATTEMPTS = 12; // 최대 대기 횟수 (5s × 12 = 60s)
const RESPONSE_TIMEOUT_MS = 60000; // 60초 응답 타임아웃 (#141 offset 확대 대비)

const minerState: MiningState = {
  isActive: false,
  currentAsset: null,
  completedAssets: new Set(),
  failedAssets: new Set(),
  consecutiveUnavailable: 0,
  payoutWaitAttempts: 0,
  config: { ...DEFAULT_CONFIG },
  progress: new Map(),
  pendingRequest: false,
  retryCount: 0,
  startedAt: 0,
  assetIdCache: new Map(),
};

let rotationTimeout: ReturnType<typeof setTimeout> | null = null;
let responseTimeout: ReturnType<typeof setTimeout> | null = null;
let statusPushInterval: ReturnType<typeof setInterval> | null = null;
let payoutMonitorRef: PayoutMonitor | null = null;

const LOCAL_COLLECTOR_URLS = ['http://localhost:3001', 'http://127.0.0.1:3001'];

function normalizeTargetSymbol(symbol: string | undefined): string | undefined {
  const normalized = normalizeCollectorSymbol(symbol || '');
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeTargetSymbols(value: string[] | string | undefined): string[] {
  const rawItems = Array.isArray(value) ? value : (value ?? '').split(',');
  const normalized = rawItems
    .map((v) => normalizeTargetSymbol(v))
    .filter((v): v is string => typeof v === 'string' && v.length > 0);
  return [...new Set(normalized)];
}

function getConfiguredTargetSymbols(): string[] {
  const explicitList = normalizeTargetSymbols(minerState.config.targetSymbols);
  if (explicitList.length > 0) return explicitList;

  const single = normalizeTargetSymbol(minerState.config.targetSymbol);
  return single ? [single] : [];
}

function isTargetSymbol(assetName: string): boolean {
  const normalized = normalizeTargetSymbol(assetName);
  if (!normalized) return false;
  const list = getConfiguredTargetSymbols();
  return list.includes(normalized);
}

function normalizeCollectorSymbol(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/#/g, '')
    .replace(/[^A-Z0-9-]/g, '');
}

function normalizeCollectorTimestamp(value: unknown): number {
  if (typeof value === 'string') value = Number(value);
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return value > 9_999_999_999 ? Math.floor(value / 1000) : Math.floor(value);
}

async function fetchCollectorSeedTimestamp(symbol: string): Promise<number> {
  const targetSymbol = normalizeCollectorSymbol(symbol);
  if (!targetSymbol) return 0;

  for (const baseUrl of LOCAL_COLLECTOR_URLS) {
    try {
      const endpoint = `${baseUrl}/api/candles/stats`;
      const signal = (AbortSignal as any).timeout
        ? (AbortSignal as any).timeout(4_000)
        : undefined;
      const res = await fetch(`${endpoint}?symbol=${encodeURIComponent(targetSymbol)}`, { signal });

      if (!res.ok) continue;
      const stats = (await res.json()) as unknown;
      if (!Array.isArray(stats)) continue;

      const match = stats.find((row: { symbol?: unknown; newest?: unknown }) => {
        if (!row || typeof row !== 'object' || typeof row.symbol !== 'string') return false;
        return normalizeCollectorSymbol(row.symbol) === targetSymbol;
      });

      if (match) {
        return normalizeCollectorTimestamp(match.newest);
      }
    } catch {
      // ignore and try next endpoint
    }
  }

  return 0;
}

// ============================================================
// 자산 ID 결정 헬퍼
// ============================================================

const ASSET_NAME_STOP_WORDS = new Set([
  'OTC',
  'INC',
  'LTD',
  'PLC',
  'CORP',
  'CORPORATION',
  'COMPANY',
  'CO',
  'HOLDINGS',
  'HOLDING',
  'TECHNOLOGIES',
  'TECHNOLOGY',
]);

const ASSET_ID_MATCH_THRESHOLD = 0.55;

function toAssetCacheKey(assetName: string): string {
  return assetName.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
}

function normalizeAssetIdForMatch(assetId: string): string {
  return assetId
    .toUpperCase()
    .replace(/^#/, '')
    .replace(/[_-]OTC$/i, '')
    .replace(/[^A-Z0-9]/g, '');
}

function normalizeAssetNameTokens(assetName: string): string[] {
  return assetName
    .toUpperCase()
    .replace(/\u00a0/g, ' ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !ASSET_NAME_STOP_WORDS.has(t));
}

function makeBigrams(text: string): Set<string> {
  if (text.length < 2) return new Set([text]);
  const out = new Set<string>();
  for (let i = 0; i < text.length - 1; i++) {
    out.add(text.slice(i, i + 2));
  }
  return out;
}

function diceCoefficient(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aBigrams = makeBigrams(a);
  const bBigrams = makeBigrams(b);
  let overlap = 0;
  for (const g of aBigrams) {
    if (bBigrams.has(g)) overlap++;
  }
  return (2 * overlap) / (aBigrams.size + bBigrams.size);
}

function commonPrefixLength(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  let i = 0;
  while (i < len && a[i] === b[i]) i++;
  return i;
}

function scoreAssetIdForAssetName(assetId: string, assetName: string): number {
  const id = normalizeAssetIdForMatch(assetId);
  if (!id) return 0;
  const tokens = normalizeAssetNameTokens(assetName);
  if (tokens.length === 0) return 0;

  let best = 0;
  for (const token of tokens) {
    if (!token) continue;
    if (id === token || id.includes(token) || token.includes(id)) {
      best = Math.max(best, 1);
      continue;
    }
    const dice = diceCoefficient(id, token);
    const prefixBoost = Math.min(commonPrefixLength(id, token), 4) * 0.1;
    best = Math.max(best, Math.min(1, dice + prefixBoost));
  }
  return best;
}

function pickBestAssetId(
  targetAssetName: string,
  candidates: string[],
): { assetId: string; score: number } | null {
  let best: { assetId: string; score: number } | null = null;
  for (const candidate of candidates) {
    const score = scoreAssetIdForAssetName(candidate, targetAssetName);
    if (!best || score > best.score) {
      best = { assetId: candidate, score };
    }
  }
  return best;
}

function resolveAssetId(targetAssetName?: string): string {
  const interceptor = getWebSocketInterceptor();
  const assetName = targetAssetName || minerState.currentAsset || '';

  if (assetName) {
    const cacheKey = toAssetCacheKey(assetName);
    const cached = minerState.assetIdCache.get(cacheKey);
    if (cached) {
      log.info(`📋 Asset ID (CACHE): ${cached}`);
      return cached;
    }

    const recent = interceptor.getRecentAssetIds(30_000);
    const matched = pickBestAssetId(assetName, recent);
    if (matched && matched.score >= ASSET_ID_MATCH_THRESHOLD) {
      minerState.assetIdCache.set(cacheKey, matched.assetId);
      log.info(`📋 Asset ID (WS matched): ${matched.assetId} (score=${matched.score.toFixed(2)})`);
      return matched.assetId;
    }
  }

  // WS 메시지에서 캡처된 최신값(보수적 fallback)
  const trackedId = interceptor.getActiveAssetId();
  if (trackedId) {
    if (assetName) {
      const trackedScore = scoreAssetIdForAssetName(trackedId, assetName);
      if (trackedScore >= ASSET_ID_MATCH_THRESHOLD) {
        log.info(`📋 Asset ID (WS tracked): ${trackedId}`);
        return trackedId;
      }
      log.warn(
        `⚠️ WS tracked asset ID mismatch (asset=${assetName}, id=${trackedId}, score=${trackedScore.toFixed(2)})`,
      );
    } else {
      log.info(`📋 Asset ID (WS tracked): ${trackedId}`);
      return trackedId;
    }
  }

  // DOM에서 asset ID 추출
  const domId = extractAssetIdFromDOM();
  if (domId) {
    log.info(`📋 Asset ID (DOM): ${domId}`);
    return domId;
  }

  // 이름 기반 fallback (정확하지 않을 수 있음)
  const fallbackId = assetName
    .toUpperCase()
    .replace(/\s+OTC$/i, '_otc')
    .replace(/\s+/g, '_');
  const result = fallbackId.startsWith('#') ? fallbackId : '#' + fallbackId;
  log.warn(
    `⚠️ Asset ID (FALLBACK - 부정확할 수 있음): ${result}. 수신 WS 메시지에서 asset ID가 아직 캡처되지 않았습니다.`,
  );
  return result;
}

/**
 * [Fix 5] 자산 전환 후 WS 수신 메시지에서 asset ID가 캡처될 때까지 대기
 * 최근 후보 중 "현재 목표 자산명"과 가장 잘 맞는 ID를 선택한다.
 */
async function waitForAssetId(
  targetAssetName: string,
  timeoutMs = 6000,
  intervalMs = 500,
): Promise<string | null> {
  const interceptor = getWebSocketInterceptor();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const matched = pickBestAssetId(targetAssetName, interceptor.getRecentAssetIds(20_000));
    if (matched && matched.score >= ASSET_ID_MATCH_THRESHOLD) {
      return matched.assetId;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  const finalMatch = pickBestAssetId(targetAssetName, interceptor.getRecentAssetIds(90_000));
  if (finalMatch && finalMatch.score >= 0.45) {
    return finalMatch.assetId;
  }
  return null;
}

/** DOM에서 PO의 실제 asset ID를 추출 시도 */
function extractAssetIdFromDOM(): string | null {
  // 방법 1: 차트 영역의 data 속성
  const chartEl = document.querySelector(
    '.chart-item[data-id], .chart-item[data-asset], [data-active-asset]',
  );
  if (chartEl) {
    const id =
      chartEl.getAttribute('data-id') ||
      chartEl.getAttribute('data-asset') ||
      chartEl.getAttribute('data-active-asset');
    if (id) return id;
  }

  // 방법 2: URL 파라미터에서 asset ID 추출
  const urlParams = new URLSearchParams(window.location.search);
  const urlAsset = urlParams.get('asset') || urlParams.get('symbol');
  if (urlAsset) return urlAsset.startsWith('#') ? urlAsset : '#' + urlAsset;

  // 방법 3: PO의 전역 상태에서 추출 (window 객체)
  try {
    const win = window as any;
    if (win.__pocketOptionState?.activeAsset) return win.__pocketOptionState.activeAsset;
    if (win.CURRENT_ASSET) return win.CURRENT_ASSET;
  } catch {
    /* ignore */
  }

  return null;
}

// ============================================================
// AutoMiner 모듈
// ============================================================

export const AutoMiner = {
  init(monitor: PayoutMonitor) {
    payoutMonitorRef = monitor;
    log.info('Initialized (Bulk History Mode)');
  },

  // ── 시작/중지 ──────────────────────────────────────────

  start() {
    log.info('🚀 Starting Bulk History Mining...');
    minerState.isActive = true;
    minerState.completedAssets.clear();
    minerState.failedAssets.clear();
    minerState.consecutiveUnavailable = 0;
    minerState.payoutWaitAttempts = 0;
    minerState.progress.clear();
    minerState.startedAt = Date.now();

    // Push status to side panel every 2s while mining
    if (statusPushInterval) clearInterval(statusPushInterval);
    statusPushInterval = setInterval(() => this.pushStatus(), 2000);
    this.pushStatus();

    this.scanAndMineNext();
  },

  stop() {
    log.info('⏹ Stopping mining...');
    minerState.isActive = false;
    minerState.pendingRequest = false;
    minerState.retryCount = 0;
    this.clearTimers();

    // Stop status push and send final state
    if (statusPushInterval) {
      clearInterval(statusPushInterval);
      statusPushInterval = null;
    }
    this.pushStatus();
  },

  /** Push current miner status to background for side panel relay. */
  pushStatus() {
    try {
      chrome.runtime
        .sendMessage({
          type: 'MINER_STATUS_PUSH',
          payload: this.getStatus(),
        })
        .catch(() => {});
    } catch {
      /* extension context may be lost */
    }
  },

  // ── 설정 변경 ──────────────────────────────────────────

  updateConfig(partial: Partial<BulkMiningConfig>) {
    if (typeof partial.offsetSeconds === 'number' && Number.isFinite(partial.offsetSeconds)) {
      minerState.config.offsetSeconds = Math.max(3600, Math.floor(partial.offsetSeconds));
    }
    if (typeof partial.period === 'number' && Number.isFinite(partial.period)) {
      minerState.config.period = Math.max(60, Math.floor(partial.period));
    }
    if (typeof partial.maxDaysBack === 'number' && Number.isFinite(partial.maxDaysBack)) {
      minerState.config.maxDaysBack = Math.max(1, Math.floor(partial.maxDaysBack));
    }
    if (typeof partial.requestDelayMs === 'number' && Number.isFinite(partial.requestDelayMs)) {
      minerState.config.requestDelayMs = Math.max(100, Math.floor(partial.requestDelayMs));
    }
    if (typeof partial.minPayout === 'number' && Number.isFinite(partial.minPayout)) {
      minerState.config.minPayout = Math.min(100, Math.max(0, partial.minPayout));
    }
    if ('targetSymbols' in partial) {
      const list = normalizeTargetSymbols(partial.targetSymbols as string | string[] | undefined);
      minerState.config.targetSymbols = list.length > 0 ? list : undefined;
      if (list.length > 0) {
        minerState.config.targetSymbol = undefined;
      }
    }
    if ('targetSymbol' in partial) {
      const single = normalizeTargetSymbol(partial.targetSymbol);
      minerState.config.targetSymbol = single;
      if (single) {
        if (!minerState.config.targetSymbols?.includes(single)) {
          minerState.config.targetSymbols = undefined;
        }
      } else if (!minerState.config.targetSymbols?.length) {
        minerState.config.targetSymbols = undefined;
      }
    }
    log.info(
      `Config updated: offset=${minerState.config.offsetSeconds}s, maxDays=${minerState.config.maxDaysBack}, delay=${minerState.config.requestDelayMs}ms, minPayout=${minerState.config.minPayout}%, targetSymbol=${minerState.config.targetSymbol || 'auto'}, targetSymbols=${minerState.config.targetSymbols?.join(',') || 'none'}`,
    );
  },

  getConfig() {
    return { ...minerState.config };
  },

  // ── 자산 스캔 및 순회 ──────────────────────────────────

  scanAndMineNext() {
    if (!minerState.isActive || !payoutMonitorRef) return;

    const fixedSymbols = getConfiguredTargetSymbols();

    // 고정 심볼 모드: payout 필터를 우회하고 대상 심볼만 순회 채굴
    if (fixedSymbols.length > 0) {
      const nextTarget = fixedSymbols.find((symbol) => !minerState.completedAssets.has(symbol));
      const targetToMine =
        nextTarget ||
        (() => {
          minerState.completedAssets.clear();
          return fixedSymbols[0];
        })();

      if (targetToMine) {
        log.info(`🎯 Fixed target mode enabled: ${targetToMine}`);
        void this.mineAsset(targetToMine);
      }
      return;
    }

    // 자동 순회 모드(payout 필터): 기존 동작 유지
    // 페이아웃 데이터 로딩 가드 — 데이터 없으면 적극적으로 수집 시도
    if (payoutMonitorRef.getAllAssets().length === 0) {
      minerState.payoutWaitAttempts++;
      if (minerState.payoutWaitAttempts > PAYOUT_MAX_WAIT_ATTEMPTS) {
        log.warn('❌ 페이아웃 데이터 60초 대기 초과, 마이닝 중단');
        this.stop();
        return;
      }
      log.info(
        `⏳ 페이아웃 데이터 수집 시도... (${minerState.payoutWaitAttempts}/${PAYOUT_MAX_WAIT_ATTEMPTS})`,
      );
      // 모니터에 강제 수집 요청 후 재확인
      payoutMonitorRef.fetchPayoutsForce().then(() => {
        if (!minerState.isActive) return;
        rotationTimeout = setTimeout(() => this.scanAndMineNext(), PAYOUT_WAIT_INTERVAL_MS);
      });
      return;
    }
    minerState.payoutWaitAttempts = 0;

    const availableAssets = payoutMonitorRef
      .getAvailableAssets()
      .filter((asset) => asset.payout >= minerState.config.minPayout)
      .map((asset) => asset.name);

    log.info(
      `Found ${availableAssets.length} available assets. Completed: ${minerState.completedAssets.size}`,
    );
    const nextAsset = availableAssets.find((asset) => !minerState.completedAssets.has(asset));

    if (!nextAsset) {
      log.info('✅ All assets mined! Waiting 1 min before next round...');
      minerState.completedAssets.clear();
      rotationTimeout = setTimeout(() => this.scanAndMineNext(), 60_000);
      return;
    }

    log.info(`⛏️ Next Target: ${nextAsset}`);
    void this.mineAsset(nextAsset);
  },

  async mineAsset(assetName: string) {
    // 이전 자산의 잔류 ID가 다음 자산 요청에 섞이지 않도록 초기화
    getWebSocketInterceptor().clearAssetTracking();
    const isFixedMode = isTargetSymbol(assetName);

    let switched = false;
    for (let attempt = 1; attempt <= MAX_SWITCH_RETRIES; attempt++) {
      switched = (await payoutMonitorRef?.switchAsset(assetName)) ?? false;
      if (switched) break;
      // unavailable로 감지된 자산은 재시도 없이 즉시 스킵
      if (payoutMonitorRef?.isAssetUnavailable(assetName)) {
        break;
      }
      if (attempt < MAX_SWITCH_RETRIES) {
        log.warn(
          `Switch attempt ${attempt}/${MAX_SWITCH_RETRIES} failed for ${assetName}, retrying in 3s...`,
        );
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    if (!switched) {
      // 실제 unavailable(asset-inactive)인 경우와 기술적 전환 실패를 구분
      const isActuallyUnavailable = payoutMonitorRef?.isAssetUnavailable(assetName) ?? false;

      if (isActuallyUnavailable) {
        log.warn(`⛔ ${assetName} is unavailable, skipping...`);
        minerState.consecutiveUnavailable++;
      } else {
        log.warn(`❌ Failed to switch to ${assetName} (technical failure), skipping...`);
        // 기술적 실패는 consecutiveUnavailable 카운터에 반영하지 않음
      }

      minerState.failedAssets.add(assetName);
      minerState.completedAssets.add(assetName);

      // 연속 N개 자산이 실제로 이용 불가 → OTC 시장 닫힘으로 판단, 5분 대기
      if (minerState.consecutiveUnavailable >= CONSECUTIVE_UNAVAILABLE_THRESHOLD) {
        log.warn(
          `🌙 연속 ${minerState.consecutiveUnavailable}개 자산 이용 불가 — OTC 시장이 닫혀있는 것으로 판단, ${MARKET_CLOSED_WAIT_MS / 60000}분 후 재시도`,
        );
        minerState.completedAssets.clear();
        minerState.failedAssets.clear();
        minerState.consecutiveUnavailable = 0;
        rotationTimeout = setTimeout(() => this.scanAndMineNext(), MARKET_CLOSED_WAIT_MS);
        return;
      }

      this.scanAndMineNext();
      return;
    }

    // 전환 성공 시 연속 실패 카운터 리셋
    minerState.consecutiveUnavailable = 0;
    minerState.currentAsset = assetName;
    minerState.retryCount = 0;

    // [Fix 5] 자산 전환 후 WS 수신 메시지에서 asset ID가 캡처될 때까지 대기
    // 최근 후보 중 target과 가장 잘 맞는 ID를 선택
    log.info(`⏳ 자산 로딩 및 WS asset ID 캡처 대기 중...`);
    const capturedId = await waitForAssetId(assetName, 6000, 500);
    if (capturedId) {
      log.info(`✅ WS asset ID 캡처 성공: ${capturedId}`);
    } else {
      log.warn(`⚠️ WS asset ID 캡처 실패, fallback 사용 예정`);
      // 추가 1초 대기 후 마지막 기회
      await new Promise((r) => setTimeout(r, 1000));
    }

    // 진행 상태 초기화
    if (!minerState.progress.has(assetName)) {
      minerState.progress.set(assetName, {
        asset: assetName,
        totalCandles: 0,
        oldestTimestamp: 0,
        newestTimestamp: 0,
        requestCount: 0,
        isComplete: false,
        assetId: undefined,
      });
    }
    const progress = minerState.progress.get(assetName);
    if (progress) {
      progress.isComplete = false;

      if (isFixedMode) {
        const seed = await fetchCollectorSeedTimestamp(assetName);
        progress.fixedSeedTimestamp = seed;
        progress.requestCount = 0;
        progress.oldestTimestamp = 0;
        if (seed > 0) {
          progress.newestTimestamp = seed;
        }
      } else {
        progress.fixedSeedTimestamp = undefined;
      }

      if (capturedId) {
        progress.assetId = capturedId;
        minerState.assetIdCache.set(toAssetCacheKey(assetName), capturedId);
      } else {
        const cached = minerState.assetIdCache.get(toAssetCacheKey(assetName));
        if (cached) {
          progress.assetId = cached;
          log.info(`📋 Asset ID (CACHE reuse): ${cached}`);
        }
      }
    }

    // 첫 요청 시작 (응답 기반 연쇄 요청)
    this.requestNextChunk();
  },

  // ── 응답 기반 연쇄 요청 ────────────────────────────────

  requestNextChunk() {
    if (!minerState.isActive || !minerState.currentAsset) return;

    const progress = minerState.progress.get(minerState.currentAsset);
    if (!progress) return;

    const { config } = minerState;
    const assetId = progress.assetId || resolveAssetId(minerState.currentAsset);
    progress.assetId = assetId;
    if (minerState.currentAsset) {
      minerState.assetIdCache.set(toAssetCacheKey(minerState.currentAsset), assetId);
    }

    const fixedMode = Boolean(progress.fixedSeedTimestamp);
    // 시간 기준점:
    // - 과거 구간이 이미 진행 중이면 oldestTimestamp 기준으로 계속 후퇴
    // - 고정 모드에서는 최신 시점(newestTimestamp)에서 시작해 이어쓰기 효율을 높임
    // - 최초 요청은 현재 시각
    const timeBase =
      progress.oldestTimestamp > 0
        ? progress.oldestTimestamp
        : fixedMode && progress.newestTimestamp > 0
          ? progress.newestTimestamp
          : Math.floor(Date.now() / 1000);

    // 최대 과거 한도 체크
    const maxPast = Math.floor(Date.now() / 1000) - config.maxDaysBack * 86400;
    if (timeBase <= maxPast) {
      log.info(`📊 ${minerState.currentAsset}: 최대 ${config.maxDaysBack}일 도달, 자산 완료`);
      progress.isComplete = true;
      minerState.completedAssets.add(minerState.currentAsset);
      this.scanAndMineNext();
      return;
    }

    const index = timeBase * 100 + Math.floor(Math.random() * 100);
    const interceptor = getWebSocketInterceptor();

    log.info(
      `📤 ${assetId} | time=${new Date(timeBase * 1000).toISOString().slice(0, 16)} | offset=${config.offsetSeconds}s | req#${progress.requestCount + 1}`,
    );

    interceptor.send(
      `42["loadHistoryPeriod",{"asset":"${assetId}","index":${index},"time":${timeBase},"offset":${config.offsetSeconds},"period":${config.period}}]`,
    );

    minerState.pendingRequest = true;
    progress.requestCount++;

    // 응답 타임아웃 설정
    this.startResponseTimeout();
  },

  // ── 히스토리 응답 수신 (index.ts에서 호출) ─────────────

  onHistoryResponse(candles: CandleData[]) {
    if (!minerState.isActive || !minerState.currentAsset) return;
    if (!minerState.pendingRequest) return; // 내가 요청한 것이 아니면 무시

    minerState.pendingRequest = false;
    minerState.retryCount = 0;
    this.clearResponseTimeout();

    const progress = minerState.progress.get(minerState.currentAsset);
    if (!progress) return;

    const symbolFromResponse = candles?.[0]?.symbol;
    if (
      symbolFromResponse &&
      symbolFromResponse !== 'CURRENT' &&
      symbolFromResponse !== 'UNKNOWN'
    ) {
      progress.assetId = String(symbolFromResponse);
      minerState.assetIdCache.set(toAssetCacheKey(minerState.currentAsset), progress.assetId);
    }

    // 빈 응답 또는 극소량 → 해당 자산 데이터 끝
    if (!candles || candles.length < 10) {
      log.info(
        `📊 ${minerState.currentAsset}: 데이터 끝 도달 (받은 캔들: ${candles?.length || 0}), 총 ${progress.totalCandles}개 수집 완료`,
      );
      progress.isComplete = true;
      minerState.completedAssets.add(minerState.currentAsset);
      this.scanAndMineNext();
      return;
    }

    // 진행 상태 업데이트
    progress.totalCandles += candles.length;

    const timestamps = candles
      .map((c) => {
        const ts = Number(c.timestamp);
        // 밀리초인 경우 초 단위로 변환
        return ts > 9999999999 ? Math.floor(ts / 1000) : ts;
      })
      .filter((ts) => ts > 0);

    if (timestamps.length > 0) {
      const oldestInBatch = Math.min(...timestamps);
      const newestInBatch = Math.max(...timestamps);
      if (progress.oldestTimestamp === 0 || oldestInBatch < progress.oldestTimestamp) {
        progress.oldestTimestamp = oldestInBatch;
      }
      if (progress.newestTimestamp === 0 || newestInBatch > progress.newestTimestamp) {
        progress.newestTimestamp = newestInBatch;
      }
    }

    const daysCollected =
      progress.newestTimestamp > 0 && progress.oldestTimestamp > 0
        ? ((progress.newestTimestamp - progress.oldestTimestamp) / 86400).toFixed(1)
        : '0';

    if (progress.fixedSeedTimestamp && progress.oldestTimestamp <= progress.fixedSeedTimestamp) {
      log.info(
        `📊 ${minerState.currentAsset}: Fixed seed overlap reached (seed=${progress.fixedSeedTimestamp}), 완료 처리`,
      );
      progress.isComplete = true;
      minerState.completedAssets.add(minerState.currentAsset);
      this.scanAndMineNext();
      return;
    }

    log.info(
      `✅ ${minerState.currentAsset}: +${candles.length} (총 ${progress.totalCandles}개, ${daysCollected}일)`,
    );

    // 다음 청크 요청 (딜레이 후)
    rotationTimeout = setTimeout(() => {
      this.requestNextChunk();
    }, minerState.config.requestDelayMs);
  },

  // ── 응답 타임아웃 ──────────────────────────────────────

  startResponseTimeout() {
    this.clearResponseTimeout();
    responseTimeout = setTimeout(() => {
      if (!minerState.pendingRequest || !minerState.isActive) return;

      minerState.retryCount++;
      minerState.pendingRequest = false;

      if (minerState.retryCount >= MAX_RETRIES) {
        log.warn(`⚠️ ${minerState.currentAsset}: ${MAX_RETRIES}회 타임아웃, 다음 자산으로 이동`);
        if (minerState.currentAsset) {
          minerState.completedAssets.add(minerState.currentAsset);
        }
        minerState.retryCount = 0;
        this.scanAndMineNext();
      } else {
        log.warn(
          `⏱️ ${minerState.currentAsset}: 응답 타임아웃 (${minerState.retryCount}/${MAX_RETRIES}), 재시도...`,
        );
        this.requestNextChunk();
      }
    }, RESPONSE_TIMEOUT_MS);
  },

  clearResponseTimeout() {
    if (responseTimeout) {
      clearTimeout(responseTimeout);
      responseTimeout = null;
    }
  },

  clearTimers() {
    if (rotationTimeout) {
      clearTimeout(rotationTimeout);
      rotationTimeout = null;
    }
    this.clearResponseTimeout();
  },

  // ── 상태 조회 ──────────────────────────────────────────

  getStatus() {
    const assetProgress = Array.from(minerState.progress.values()).map((p) => ({
      asset: p.asset,
      totalCandles: p.totalCandles,
      daysCollected:
        p.newestTimestamp > 0 && p.oldestTimestamp > 0
          ? Math.round(((p.newestTimestamp - p.oldestTimestamp) / 86400) * 10) / 10
          : 0,
      isComplete: p.isComplete,
      requestCount: p.requestCount,
    }));

    const overallCandles = assetProgress.reduce((sum, p) => sum + p.totalCandles, 0);
    const elapsedSeconds =
      minerState.startedAt > 0 ? Math.round((Date.now() - minerState.startedAt) / 1000) : 0;

    return {
      isActive: minerState.isActive,
      current: minerState.currentAsset,
      completed: minerState.completedAssets.size - minerState.failedAssets.size,
      failed: minerState.failedAssets.size,
      total: minerState.completedAssets.size,
      assetProgress,
      overallCandles,
      elapsedSeconds,
      candlesPerSecond: elapsedSeconds > 0 ? Math.round(overallCandles / elapsedSeconds) : 0,
      config: { ...minerState.config },
    };
  },
};
