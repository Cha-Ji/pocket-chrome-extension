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
 *   PROFILE_DIR    - Chrome 프로필 경로 (세션 유지용)
 *   PO_URL         - PO 페이지 URL
 *   COLLECTOR_URL  - 수집 서버 URL (기본: http://localhost:3001)
 *   MAX_MEMORY_MB  - 메모리 임계값 MB (기본: 1500)
 *   SESSION_HOURS  - 세션 최대 시간 (기본: 4)
 *   MONITOR_INTERVAL - 모니터링 간격 초 (기본: 30)
 *
 * 사용법:
 *   npm run collect:headless
 *   npm run collect:visible
 *   OFFSET=600000 MAX_DAYS=90 npm run collect:headless
 */

import { chromium, type BrowserContext, type Page, type CDPSession } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// ── 설정 ────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const EXTENSION_PATH = path.join(PROJECT_ROOT, 'dist');

const CONFIG = {
  headless: process.env.HEADLESS !== 'false',
  offset: parseInt(process.env.OFFSET || '300000', 10),
  maxDays: parseInt(process.env.MAX_DAYS || '90', 10),
  requestDelay: parseInt(process.env.REQUEST_DELAY || '200', 10),
  profileDir: process.env.PROFILE_DIR || '',
  poUrl: process.env.PO_URL || 'https://pocketoption.com/en/cabinet/demo-quick-high-low/',
  collectorUrl: process.env.COLLECTOR_URL || 'http://localhost:3001',
  maxMemoryMB: parseInt(process.env.MAX_MEMORY_MB || '1500', 10),
  sessionHours: parseFloat(process.env.SESSION_HOURS || '4'),
  monitorInterval: parseInt(process.env.MONITOR_INTERVAL || '30', 10),
};

// ── 유틸리티 ────────────────────────────────────────────

function log(msg: string): void {
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
  console.log(`[${ts}] ${msg}`);
}

function logError(msg: string): void {
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
  console.error(`[${ts}] ❌ ${msg}`);
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
  const args = [
    `--disable-extensions-except=${EXTENSION_PATH}`,
    `--load-extension=${EXTENSION_PATH}`,
    '--no-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--disable-gpu',
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

// ── AutoMiner 제어 (page.evaluate) ──────────────────────

async function sendExtensionMessage(page: Page, message: any): Promise<any> {
  return page.evaluate(async (msg) => {
    return new Promise<any>((resolve) => {
      chrome.runtime.sendMessage(msg, (res: any) => resolve(res));
    });
  }, message);
}

async function configureMiner(page: Page): Promise<void> {
  const config = {
    maxDaysBack: CONFIG.maxDays,
    offsetSeconds: CONFIG.offset,
    requestDelayMs: CONFIG.requestDelay,
  };
  const result = await sendExtensionMessage(page, {
    type: 'SET_MINER_CONFIG',
    payload: config,
  });
  log(`Miner config set: maxDays=${CONFIG.maxDays}, offset=${CONFIG.offset}, delay=${CONFIG.requestDelay}ms → ${JSON.stringify(result)}`);
}

async function startMiner(page: Page): Promise<void> {
  const result = await sendExtensionMessage(page, { type: 'START_AUTO_MINER' });
  log(`Miner started: ${JSON.stringify(result)}`);
}

async function stopMiner(page: Page): Promise<void> {
  const result = await sendExtensionMessage(page, { type: 'STOP_AUTO_MINER' });
  log(`Miner stopped: ${JSON.stringify(result)}`);
}

async function getMinerStatus(page: Page): Promise<any> {
  return sendExtensionMessage(page, { type: 'GET_MINER_STATUS' });
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

    // 3. PO 데모 페이지 이동
    page = context.pages()[0] || await context.newPage();
    cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');

    log(`PO 페이지 이동: ${CONFIG.poUrl}`);
    await page.goto(CONFIG.poUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    // Extension 초기화 대기 (트레이딩 패널 렌더링까지)
    log('Extension 초기화 대기 중...');
    await page.waitForTimeout(10_000);

    // 4. Miner 설정 + 시작
    await configureMiner(page);
    await startMiner(page);

    // 5. 모니터링 루프
    let lastStatus: any = null;
    const monitorMs = CONFIG.monitorInterval * 1000;

    while (true) {
      await page.waitForTimeout(monitorMs);

      // 세션 시간 체크
      const elapsed = Date.now() - sessionStart;
      if (elapsed >= sessionMaxMs) {
        log(`⏰ 세션 시간 ${CONFIG.sessionHours}시간 초과 → graceful restart`);
        await stopMiner(page);
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
        lastStatus = await getMinerStatus(page);
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
        await stopMiner(page);
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
  log('='.repeat(60));
  log('Headless Collector 시작');
  log(`설정: maxDays=${CONFIG.maxDays}, offset=${CONFIG.offset}, delay=${CONFIG.requestDelay}ms`);
  log(`메모리 임계값: ${CONFIG.maxMemoryMB}MB, 세션: ${CONFIG.sessionHours}시간`);
  log(`headless: ${CONFIG.headless} (Extension은 항상 headed 모드 필요)`);
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
