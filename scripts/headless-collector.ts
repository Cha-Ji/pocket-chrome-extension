/**
 * Headless Collector — Playwright 기반 자동 데이터 수집 오케스트레이터 (#141)
 *
 * Extension을 로드한 Chromium 브라우저로 PO 데모 페이지에 접속하여
 * AutoMiner를 통해 캔들 데이터를 수집 서버(localhost:3001)로 전송합니다.
 *
 * 4시간 주기 또는 메모리 임계값 초과 시 graceful restart를 수행하여
 * 24시간 이상 안정적으로 수집할 수 있습니다.
 *
 * 환경변수:
 *   HEADLESS       - "false"이면 GUI 모드 (기본: true)
 *   OFFSET         - offset 초 단위 (기본: 300000)
 *   MAX_DAYS       - 수집 기간 일 (기본: 90)
 *   REQUEST_DELAY  - 요청 딜레이 ms (기본: 200)
 *   PROFILE_DIR    - Chrome 프로필 경로 (기본: ~/.pocket-quant/chrome-profile/)
 *   PO_URL         - PO 페이지 URL
 *   LOGIN_TIMEOUT  - 로그인 대기 타임아웃 ms (기본: 120000)
 *   COLLECTOR_URL  - 수집 서버 URL (기본: http://localhost:3001)
 *   MAX_MEMORY_MB  - 메모리 임계값 MB (기본: 1500)
 *   SESSION_HOURS  - 세션 최대 시간 (기본: 4)
 *   MONITOR_INTERVAL - 모니터링 간격 초 (기본: 30)
 *   MIN_PAYOUT     - 최소 페이아웃 % (기본: 50, 비OTC 포함)
 *   ONLY_OTC       - "true"이면 OTC만 수집 (기본: false)
 *   INSTANCE_ID    - 인스턴스 번호 0-based (병렬 수집용)
 *   NUM_INSTANCES  - 총 인스턴스 수 (병렬 수집용)
 *
 * 사용법:
 *   npm run collect:headless
 *   npm run collect:visible
 *   OFFSET=600000 MAX_DAYS=90 npm run collect:headless
 */

import { chromium, type BrowserContext, type Page, type CDPSession } from '@playwright/test';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ── 설정 ────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const EXTENSION_PATH = path.join(PROJECT_ROOT, 'dist');

// 영구 프로필 디렉토리 — 세션(쿠키) 유지용
const DEFAULT_PROFILE_DIR = path.join(os.homedir(), '.pocket-quant', 'chrome-profile');

const CONFIG = {
  headless: process.env.HEADLESS !== 'false',
  offset: parseInt(process.env.OFFSET || '300000', 10),
  maxDays: parseInt(process.env.MAX_DAYS || '90', 10),
  requestDelay: parseInt(process.env.REQUEST_DELAY || '200', 10),
  profileDir: process.env.PROFILE_DIR || DEFAULT_PROFILE_DIR,
  poUrl: process.env.PO_URL || 'https://pocketoption.com/en/cabinet/quick-high-low/',
  collectorUrl: process.env.COLLECTOR_URL || 'http://localhost:3001',
  maxMemoryMB: parseInt(process.env.MAX_MEMORY_MB || '1500', 10),
  sessionHours: parseFloat(process.env.SESSION_HOURS || '4'),
  monitorInterval: parseInt(process.env.MONITOR_INTERVAL || '30', 10),
  loginTimeoutMs: parseInt(process.env.LOGIN_TIMEOUT || '120000', 10),
  // 비OTC 수집 활성화: 기본값 변경 (onlyOTC=false, minPayout=50)
  minPayout: parseInt(process.env.MIN_PAYOUT || '50', 10),
  onlyOTC: process.env.ONLY_OTC === 'true', // 기본: false (비OTC 포함)
  // 멀티 인스턴스 파티셔닝
  instanceId: process.env.INSTANCE_ID !== undefined ? parseInt(process.env.INSTANCE_ID, 10) : undefined,
  numInstances: process.env.NUM_INSTANCES !== undefined ? parseInt(process.env.NUM_INSTANCES, 10) : undefined,
};

// ── 유틸리티 ────────────────────────────────────────────

const INSTANCE_TAG = CONFIG.instanceId !== undefined ? `[I${CONFIG.instanceId}]` : '';

function log(msg: string): void {
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
  console.log(`[${ts}]${INSTANCE_TAG} ${msg}`);
}

function logError(msg: string): void {
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
  console.error(`[${ts}]${INSTANCE_TAG} ❌ ${msg}`);
}

async function checkCollectorHealth(): Promise<{ ok: boolean; totalCandles: number }> {
  try {
    const res = await fetch(`${CONFIG.collectorUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ok: false, totalCandles: 0 };
    const body = await res.json();
    return { ok: true, totalCandles: body.totalCandles ?? 0 };
  } catch {
    return { ok: false, totalCandles: 0 };
  }
}

async function getCandleStats(): Promise<Array<{ symbol: string; count: number; days: number }>> {
  try {
    const res = await fetch(`${CONFIG.collectorUrl}/api/candles/stats`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

// ── 브라우저 관리 ───────────────────────────────────────

async function launchBrowser(): Promise<{ context: BrowserContext; extensionId: string }> {
  const isXvfb = process.env.XVFB_MODE === '1';
  const args = [
    `--disable-extensions-except=${EXTENSION_PATH}`,
    `--load-extension=${EXTENSION_PATH}`,
    '--no-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    // Xvfb(X11) 환경에서 Wayland 대신 X11 백엔드 강제
    ...(isXvfb ? ['--ozone-platform=x11'] : []),
  ];

  // headless + extension: Chromium의 new headless는 extension 미지원
  // headless: false + Xvfb/WSLg 사용 또는 실제 GUI
  const context = await chromium.launchPersistentContext(CONFIG.profileDir, {
    headless: false, // Extension은 headless에서 동작하지 않음
    args,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  });

  // Extension ID 감지
  let background = context.serviceWorkers()[0];
  if (!background) {
    background = await context.waitForEvent('serviceworker', { timeout: 15_000 });
  }
  const extensionId = background.url().split('/')[2];
  log(`Extension loaded: ${extensionId}`);

  return { context, extensionId };
}

// ── CDP 메모리 모니터링 ─────────────────────────────────

async function getMemoryUsageMB(cdp: CDPSession): Promise<number> {
  try {
    const result = await cdp.send('Performance.getMetrics');
    const heapMetric = result.metrics.find((m: any) => m.name === 'JSHeapUsedSize');
    if (heapMetric) {
      return Math.round(heapMetric.value / 1024 / 1024);
    }
  } catch {
    // CDP 세션이 닫혔을 수 있음
  }
  return 0;
}

// ── AutoMiner 제어 (Extension 페이지 경유) ──────────────

// Extension의 Side Panel 페이지를 열어서 chrome.runtime.sendMessage 호출
// (PO 페이지의 Main World에서는 chrome.runtime 접근 불가)
let extPage: Page | null = null;

async function getExtensionPage(context: BrowserContext, extensionId: string): Promise<Page> {
  if (extPage && !extPage.isClosed()) return extPage;
  extPage = await context.newPage();
  await extPage.goto(`chrome-extension://${extensionId}/src/side-panel/index.html`, {
    waitUntil: 'domcontentloaded',
  });
  log('Extension 메시지 채널 (Side Panel 페이지) 열림');
  return extPage;
}

async function sendExtensionMessage(context: BrowserContext, extensionId: string, message: any): Promise<any> {
  const ep = await getExtensionPage(context, extensionId);
  return ep.evaluate(async (msg) => {
    return new Promise<any>((resolve, reject) => {
      // Miner/Memory 메시지는 Content Script에서 처리 → 탭으로 직접 전송
      chrome.tabs.query({ url: '*://pocketoption.com/*' }, (tabs) => {
        const tab = tabs[0];
        if (!tab?.id) {
          reject(new Error('PO 탭을 찾을 수 없음'));
          return;
        }
        chrome.tabs.sendMessage(tab.id, msg, (res: any) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(res);
        });
      });
    });
  }, message);
}

async function configureMiner(context: BrowserContext, extensionId: string): Promise<void> {
  const config: Record<string, unknown> = {
    maxDaysBack: CONFIG.maxDays,
    offsetSeconds: CONFIG.offset,
    requestDelayMs: CONFIG.requestDelay,
    minPayout: CONFIG.minPayout,
    onlyOTC: CONFIG.onlyOTC,
  };
  // 인스턴스 파티셔닝 (설정된 경우만)
  if (CONFIG.instanceId !== undefined && CONFIG.numInstances !== undefined) {
    config.instanceId = CONFIG.instanceId;
    config.numInstances = CONFIG.numInstances;
  }
  const result = await sendExtensionMessage(context, extensionId, {
    type: 'SET_MINER_CONFIG',
    payload: config,
  });
  log(`Miner config set: maxDays=${CONFIG.maxDays}, offset=${CONFIG.offset}, delay=${CONFIG.requestDelay}ms, minPayout=${CONFIG.minPayout}, onlyOTC=${CONFIG.onlyOTC}` +
    (CONFIG.instanceId !== undefined ? `, instance=${CONFIG.instanceId}/${CONFIG.numInstances}` : '') +
    ` → ${JSON.stringify(result)}`);
}

async function startMiner(context: BrowserContext, extensionId: string): Promise<void> {
  const result = await sendExtensionMessage(context, extensionId, { type: 'START_AUTO_MINER' });
  log(`Miner started: ${JSON.stringify(result)}`);
}

async function stopMiner(context: BrowserContext, extensionId: string): Promise<void> {
  const result = await sendExtensionMessage(context, extensionId, { type: 'STOP_AUTO_MINER' });
  log(`Miner stopped: ${JSON.stringify(result)}`);
}

async function getMinerStatus(context: BrowserContext, extensionId: string): Promise<any> {
  return sendExtensionMessage(context, extensionId, { type: 'GET_MINER_STATUS' });
}

// ── 단일 수집 세션 ─────────────────────────────────────

interface SessionResult {
  reason: 'memory' | 'timeout' | 'crash' | 'error' | 'complete';
  duration: number;
  candlesCollected: number;
}

async function runSession(sessionNum: number): Promise<SessionResult> {
  const sessionStart = Date.now();
  const sessionMaxMs = CONFIG.sessionHours * 3600 * 1000;
  let candlesStart = 0;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let cdp: CDPSession | null = null;

  try {
    // 1. 수집 서버 헬스체크
    const health = await checkCollectorHealth();
    if (!health.ok) {
      logError('수집 서버(localhost:3001) 미실행. `npm run collector` 먼저 실행하세요.');
      return { reason: 'error', duration: 0, candlesCollected: 0 };
    }
    candlesStart = health.totalCandles;
    log(`세션 #${sessionNum} 시작 | 서버 캔들: ${candlesStart.toLocaleString()}`);

    // 2. 브라우저 + Extension 로드
    const browser = await launchBrowser();
    context = browser.context;
    const extensionId = browser.extensionId;

    // 3. PO 데모 페이지 이동
    page = context.pages()[0] || await context.newPage();
    cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');

    log(`PO 페이지 이동: ${CONFIG.poUrl}`);
    await page.goto(CONFIG.poUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    // 트레이딩 패널 렌더링 대기 (로그인 상태 확인)
    // polling 방식: 페이지 네비게이션(리다이렉트/2FA 등)이 발생해도 안정적으로 대기
    log('트레이딩 패널 대기 중...');
    const tradingPanelSelector = '.btn-call, .btn-put';
    const loginDeadline = Date.now() + CONFIG.loginTimeoutMs;
    let loggedIn = false;
    let lastLogSec = 0;
    while (Date.now() < loginDeadline) {
      try {
        const el = await page.waitForSelector(tradingPanelSelector, { timeout: 10_000 });
        if (el) { loggedIn = true; break; }
      } catch {
        // 페이지 네비게이션 또는 셀렉터 미발견 — 계속 폴링
        // waitForSelector가 즉시 실패할 수 있으므로 명시적 대기
        await new Promise((r) => setTimeout(r, 3_000));
      }
      const remainSec = Math.round((loginDeadline - Date.now()) / 1000);
      const elapsed = Math.round((CONFIG.loginTimeoutMs - remainSec * 1000) / 1000);
      if (remainSec > 0 && elapsed - lastLogSec >= 30) {
        lastLogSec = elapsed;
        log(`로그인 대기 중... (남은 시간: ${remainSec}초, URL: ${page.url()})`);
      }
    }
    if (loggedIn) {
      log('트레이딩 패널 감지 — 로그인 확인됨');
    } else {
      const currentUrl = page.url();
      logError(`트레이딩 패널 미감지 (${CONFIG.loginTimeoutMs / 1000}초 타임아웃)`);
      logError(`현재 URL: ${currentUrl}`);
      logError('PO 로그인이 필요합니다. 아래 순서대로 진행하세요:');
      logError('  1. GUI 모드로 실행: npm run collect:visible');
      logError('  2. 브라우저에서 PO 계정 로그인');
      logError('  3. 로그인 완료 후 Ctrl+C로 종료');
      logError('  4. 다시 실행: npm run collect:xvfb');
      logError(`  (프로필 저장 경로: ${CONFIG.profileDir})`);
      return { reason: 'error', duration: Date.now() - sessionStart, candlesCollected: 0 };
    }

    // PO 페이지 콘솔 로그 캡처 (Content Script / WS 디버깅용)
    page.on('console', (msg) => {
      const text = msg.text();
      // Extension 관련 로그 캡처 (PO- prefix 또는 주요 키워드)
      if (text.includes('[PO') || text.includes('PO-')
          || text.includes('📤') || text.includes('✅') || text.includes('⛏')
          || text.includes('DataSender') || text.includes('History')
          || text.includes('bridge') || text.includes('WebSocket')
          || text.includes('pq-')) {
        log(`[page] ${text.slice(0, 300)}`);
      }
    });

    // Extension 초기화 대기 (Content Script가 DOM 파싱 시작할 시간)
    log('Extension 초기화 대기 중...');
    await page.waitForTimeout(5_000);

    // Xvfb 환경 감지 — 렌더링 불필요하므로 메모리 최적화 자동 적용
    // XVFB_MODE=1은 xvfb-collect.sh에서 설정됨 (:0 WSLg와 구별)
    if (process.env.XVFB_MODE === '1') {
      await sendExtensionMessage(context, extensionId, {
        type: 'SET_MEMORY_CONFIG',
        payload: { chartHidden: true, autoReloadEnabled: true, reloadIntervalMinutes: 120 },
      });
      log('Xvfb 모드: 차트 숨김 + 자동 리로드(2h) 활성화');
    }

    // 4. Miner 설정 + 시작
    await configureMiner(context, extensionId);
    await startMiner(context, extensionId);

    // 5. 모니터링 루프
    let lastStatus: any = null;
    const monitorMs = CONFIG.monitorInterval * 1000;

    while (true) {
      await page.waitForTimeout(monitorMs);

      // 세션 시간 체크
      const elapsed = Date.now() - sessionStart;
      if (elapsed >= sessionMaxMs) {
        log(`⏰ 세션 시간 ${CONFIG.sessionHours}시간 초과 → graceful restart`);
        await stopMiner(context, extensionId);
        const currentHealth = await checkCollectorHealth();
        return {
          reason: 'timeout',
          duration: elapsed,
          candlesCollected: currentHealth.totalCandles - candlesStart,
        };
      }

      // 메모리 체크
      const memMB = await getMemoryUsageMB(cdp);

      // Miner 상태 조회
      try {
        lastStatus = await getMinerStatus(context, extensionId);
      } catch (e) {
        logError(`Miner 상태 조회 실패 (page crash?): ${e}`);
        return {
          reason: 'crash',
          duration: Date.now() - sessionStart,
          candlesCollected: 0,
        };
      }

      const elapsedMin = Math.round(elapsed / 60000);
      const overallCandles = lastStatus?.overallCandles ?? 0;
      const current = lastStatus?.current ?? 'N/A';
      const completed = lastStatus?.completed ?? 0;
      const failed = lastStatus?.failed ?? 0;
      const cps = lastStatus?.candlesPerSecond ?? 0;

      log(
        `[${elapsedMin}m] 메모리: ${memMB}MB | 현재: ${current} | 완료: ${completed} 실패: ${failed} | 캔들: ${overallCandles.toLocaleString()} (${cps}/s)`,
      );

      // 메모리 임계값 초과
      if (memMB > CONFIG.maxMemoryMB) {
        log(`⚠️ 메모리 ${memMB}MB > ${CONFIG.maxMemoryMB}MB → graceful restart`);
        await stopMiner(context, extensionId);
        const currentHealth = await checkCollectorHealth();
        return {
          reason: 'memory',
          duration: elapsed,
          candlesCollected: currentHealth.totalCandles - candlesStart,
        };
      }

      // Miner 비활성 (모든 자산 완료 후 대기)
      if (lastStatus && !lastStatus.isActive && overallCandles > 0) {
        log('✅ Miner 자산 순회 완료 (다음 라운드 대기 중)');
        // 1라운드 완료 후 계속 수집할지 결정
        // 현재는 계속 대기하여 다음 라운드 수집 진행
      }
    }
  } catch (e) {
    logError(`세션 에러: ${e}`);
    return {
      reason: 'error',
      duration: Date.now() - sessionStart,
      candlesCollected: 0,
    };
  } finally {
    // 정리
    extPage = null;
    if (cdp) {
      try { await cdp.detach(); } catch { /* ignore */ }
    }
    if (context) {
      try { await context.close(); } catch { /* ignore */ }
    }
  }
}

// ── 메인 루프 ───────────────────────────────────────────

async function main(): Promise<void> {
  // 프로필 디렉토리 자동 생성
  if (CONFIG.profileDir && !fs.existsSync(CONFIG.profileDir)) {
    fs.mkdirSync(CONFIG.profileDir, { recursive: true });
    log(`프로필 디렉토리 생성: ${CONFIG.profileDir}`);
  }

  log('='.repeat(60));
  log('Headless Collector 시작');
  log(`설정: maxDays=${CONFIG.maxDays}, offset=${CONFIG.offset}, delay=${CONFIG.requestDelay}ms`);
  log(`필터: minPayout=${CONFIG.minPayout}, onlyOTC=${CONFIG.onlyOTC}`);
  if (CONFIG.instanceId !== undefined) {
    log(`인스턴스: ${CONFIG.instanceId}/${CONFIG.numInstances}`);
  }
  log(`메모리 임계값: ${CONFIG.maxMemoryMB}MB, 세션: ${CONFIG.sessionHours}시간`);
  log(`headless: ${CONFIG.headless} (Extension은 항상 headed 모드 필요)`);
  log(`DISPLAY: ${process.env.DISPLAY || '(없음 — GUI 필요)'}`);
  log(`프로필: ${CONFIG.profileDir || '(임시)'}`);
  log('='.repeat(60));

  let sessionNum = 1;

  // 무한 재시작 루프
  while (true) {
    const result = await runSession(sessionNum);
    const durationMin = Math.round(result.duration / 60000);

    log('─'.repeat(40));
    log(`세션 #${sessionNum} 종료: ${result.reason} (${durationMin}분, +${result.candlesCollected.toLocaleString()} 캔들)`);

    // 서버 통계 출력
    const stats = await getCandleStats();
    if (stats.length > 0) {
      log(`서버 통계 (${stats.length}개 자산):`);
      for (const s of stats.slice(0, 10)) {
        log(`  ${s.symbol}: ${s.count.toLocaleString()} 캔들, ${s.days}일`);
      }
      if (stats.length > 10) log(`  ... 외 ${stats.length - 10}개`);
    }
    log('─'.repeat(40));

    if (result.reason === 'error') {
      log('에러 발생 — 30초 대기 후 재시작');
      await new Promise((r) => setTimeout(r, 30_000));
    } else {
      log('5초 대기 후 다음 세션 시작...');
      await new Promise((r) => setTimeout(r, 5_000));
    }

    sessionNum++;
  }
}

// ── 진입점 ──────────────────────────────────────────────

main().catch((e) => {
  logError(`치명적 에러: ${e}`);
  process.exit(1);
});
