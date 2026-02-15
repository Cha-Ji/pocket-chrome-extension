// ============================================================
// Pocket Option Executor - IExecutor 구현
// ============================================================
// 기존 TradeExecutor의 DOM 조작 로직을 IExecutor 인터페이스로 래핑.
// ============================================================

import type { Direction } from '../../../types';
import type { IExecutor, TradeExecutionResult } from '../../interfaces';
import { createLogger } from '../../../logger';
import { PO_DEMO_SELECTORS, PO_PAYOUT_SELECTORS, PO_SELECTOR_FALLBACKS } from './selectors';

const logger = createLogger('Executor');

/** 캐시 엔트리: 셀렉터 + 캐시 시각 */
interface SelectorCacheEntry {
  selector: string;
  cachedAt: number;
}

/** Executor 셀렉터 캐시 TTL (밀리초) - 30초 */
const EXECUTOR_CACHE_TTL_MS = 30_000;

export class PocketOptionExecutor implements IExecutor {
  private selectorCache: Map<string, SelectorCacheEntry> = new Map();

  async execute(direction: Direction, amount: number): Promise<TradeExecutionResult> {
    try {
      // 금액 설정
      await this.setAmount(amount);

      // 버튼 찾기
      const buttonKey = direction === 'CALL' ? 'callButton' : 'putButton';
      const button = this.resolveElement(buttonKey);
      if (!button) {
        return {
          success: false,
          error: `${direction} button not found`,
        };
      }

      // 클릭 실행
      this.simulateClick(button);

      return {
        success: true,
        direction,
        amount,
        executedAt: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async setAmount(amount: number): Promise<void> {
    const input = document.querySelector(PO_DEMO_SELECTORS.amountInput) as HTMLInputElement;
    if (!input) return;

    input.value = amount.toString();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async setExpiration(seconds: number): Promise<void> {
    // Pocket Option의 만기 설정은 UI 클릭 기반
    // 현재는 수동 설정 필요 - 향후 DOM 자동화 추가 가능
    console.warn(`[PO-Executor] setExpiration(${seconds}s) - manual setup required`);
  }

  async getBalance(): Promise<number | null> {
    const el = this.resolveElement('balanceDisplay');
    if (!el) return null;

    const text = el.textContent?.trim() || '';
    const cleaned = text.replace(/[^0-9.]/g, '');
    const balance = parseFloat(cleaned);
    return isNaN(balance) ? null : balance;
  }

  async switchAsset(assetName: string): Promise<boolean> {
    const normalizedTarget = assetName.replace(/\s+/g, ' ').trim().toLowerCase();

    // 현재 이미 해당 자산인지 확인
    const currentEl = document.querySelector(PO_PAYOUT_SELECTORS.pairTrigger);
    if (currentEl?.textContent?.toLowerCase().includes(normalizedTarget)) {
      return true;
    }

    // 자산 목록 열기
    const trigger = (document.querySelector('.pair-number-wrap') ||
      document.querySelector(PO_PAYOUT_SELECTORS.pairTrigger)) as HTMLElement;
    if (trigger) this.simulateClick(trigger);

    await this.wait(1500);

    // 자산 찾기
    const items = document.querySelectorAll(PO_PAYOUT_SELECTORS.assetItem);
    for (const item of items) {
      const label = item.querySelector(PO_PAYOUT_SELECTORS.assetLabel);
      const text = (label?.textContent || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

      if (text === normalizedTarget) {
        const link = (item.querySelector('.alist__link') as HTMLElement) || (item as HTMLElement);
        this.simulateClick(link);
        await this.wait(2000);

        // 전환 확인
        const afterEl = document.querySelector(PO_PAYOUT_SELECTORS.pairTrigger);
        return afterEl?.textContent?.toLowerCase().includes(normalizedTarget) ?? false;
      }
    }

    return false;
  }

  async canTrade(): Promise<boolean> {
    const callBtn = this.resolveElement('callButton');
    const putBtn = this.resolveElement('putButton');
    return callBtn !== null && putBtn !== null;
  }

  // ============================================================
  // Private helpers
  // ============================================================

  private resolveElement(key: string): HTMLElement | null {
    const now = Date.now();

    // 캐시 확인 (TTL + DOM 존재 검증)
    const cached = this.selectorCache.get(key);
    if (cached) {
      const ttlExpired = now - cached.cachedAt > EXECUTOR_CACHE_TTL_MS;
      if (!ttlExpired) {
        const el = document.querySelector(cached.selector) as HTMLElement;
        if (el) return el;
        // DOM에서 요소 제거됨 - 캐시 무효화
        logger.debug(`캐시된 요소 DOM에서 제거됨: ${key}`);
      } else {
        logger.debug(`캐시 TTL 만료: ${key}`);
      }
      this.selectorCache.delete(key);
    }

    // fallback 체인
    const fallbacks = PO_SELECTOR_FALLBACKS[key];
    if (fallbacks) {
      for (const sel of fallbacks) {
        const el = document.querySelector(sel) as HTMLElement;
        if (el) {
          this.selectorCache.set(key, { selector: sel, cachedAt: now });
          return el;
        }
      }
    }

    // 기본 셀렉터
    const defaultSel = (PO_DEMO_SELECTORS as unknown as Record<string, string>)[key];
    if (defaultSel) {
      const el = document.querySelector(defaultSel) as HTMLElement;
      if (el) {
        this.selectorCache.set(key, { selector: defaultSel, cachedAt: now });
        return el;
      }
    }

    logger.warn(`모든 셀렉터 실패: ${key}`);
    return null;
  }

  private simulateClick(element: Element): void {
    element.dispatchEvent(
      new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true,
      }),
    );
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
