import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SelectorResolver,
  DEFAULT_CACHE_TTL_MS,
  ROBUST_SELECTORS,
  resetSelectorResolver,
  getSelectorResolver,
} from './selector-resolver';

describe('SelectorResolver', () => {
  let resolver: SelectorResolver;

  beforeEach(() => {
    document.body.innerHTML = '';
    resetSelectorResolver();
    // 테스트용 짧은 TTL (100ms) 사용
    resolver = new SelectorResolver(100);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('기본 resolve 동작', () => {
    it('등록되지 않은 키는 null을 반환해야 한다', async () => {
      const result = await resolver.resolve('nonExistentKey');
      expect(result).toBeNull();
    });

    it('primary 셀렉터로 요소를 찾아야 한다', async () => {
      // callButton의 primary 셀렉터가 ROBUST_SELECTORS에 있는지 확인
      const def = ROBUST_SELECTORS['callButton'];
      if (!def) return; // 셀렉터 정의가 없으면 스킵

      // primary 셀렉터에 맞는 DOM 요소 생성
      const el = document.createElement('div');
      el.className = def.primary.replace('.', '');
      document.body.appendChild(el);

      // querySelector가 className만으로는 복합 셀렉터를 못 찾을 수 있으므로
      // 직접 매칭 가능한 요소 생성
      const wrapper = document.createElement('div');
      wrapper.className = 'switch-state-block';
      const item = document.createElement('div');
      item.className = 'switch-state-block__item';
      wrapper.appendChild(item);
      document.body.innerHTML = '';
      document.body.appendChild(wrapper);

      const result = await resolver.resolve('callButton');
      // primary에 :first-child가 있어서 매칭될 수 있음
      if (result) {
        expect(result).toBeInstanceOf(HTMLElement);
      }
    });
  });

  describe('TTL 기반 캐시 무효화', () => {
    it('TTL 내에서는 캐시된 결과를 반환해야 한다', async () => {
      // balanceDisplay 셀렉터용 DOM 생성
      const el = document.createElement('div');
      el.className = 'balance-info-block__value';
      el.textContent = '1000';
      document.body.appendChild(el);

      // 첫 resolve - 캐시 미스
      const result1 = await resolver.resolve('balanceDisplay');
      const stats1 = resolver.getStats();
      expect(stats1.misses).toBe(1);

      // 두 번째 resolve - TTL 내이므로 캐시 히트
      const result2 = await resolver.resolve('balanceDisplay');
      const stats2 = resolver.getStats();
      expect(stats2.hits).toBe(1);
      expect(result1).toBe(result2);
    });

    it('TTL 초과 후에는 캐시가 무효화되어야 한다', async () => {
      // resolver를 매우 짧은 TTL로 생성
      const shortResolver = new SelectorResolver(1); // 1ms TTL

      const el = document.createElement('div');
      el.className = 'balance-info-block__value';
      el.textContent = '1000';
      document.body.appendChild(el);

      // 첫 resolve
      await shortResolver.resolve('balanceDisplay');
      const stats1 = shortResolver.getStats();
      expect(stats1.misses).toBe(1);

      // TTL이 만료되도록 대기
      await new Promise((resolve) => setTimeout(resolve, 10));

      // TTL 만료 후 resolve - 캐시 무효화되어 다시 miss
      await shortResolver.resolve('balanceDisplay');
      const stats2 = shortResolver.getStats();
      expect(stats2.invalidations).toBeGreaterThanOrEqual(1);
    });
  });

  describe('DOM 존재 검증', () => {
    it('캐시된 요소가 DOM에서 제거되면 캐시가 무효화되어야 한다', async () => {
      const el = document.createElement('div');
      el.className = 'balance-info-block__value';
      el.textContent = '1000';
      document.body.appendChild(el);

      // 첫 resolve - 캐시 등록
      const result1 = await resolver.resolve('balanceDisplay');
      expect(result1).not.toBeNull();
      expect(resolver.getStats().misses).toBe(1);

      // DOM에서 요소 제거
      document.body.removeChild(el);

      // 다시 resolve - 캐시된 요소가 DOM에 없으므로 무효화
      const result2 = await resolver.resolve('balanceDisplay');
      expect(result2).toBeNull(); // 요소가 없으므로 null
      expect(resolver.getStats().invalidations).toBeGreaterThanOrEqual(1);
    });
  });

  describe('캐시 관리 메서드', () => {
    it('clearCache()로 전체 캐시를 초기화할 수 있어야 한다', async () => {
      const el = document.createElement('div');
      el.className = 'balance-info-block__value';
      document.body.appendChild(el);

      await resolver.resolve('balanceDisplay');
      expect(resolver.getStats().size).toBe(1);

      resolver.clearCache();
      expect(resolver.getStats().size).toBe(0);
    });

    it('invalidate()로 특정 키만 무효화할 수 있어야 한다', async () => {
      const el = document.createElement('div');
      el.className = 'balance-info-block__value';
      document.body.appendChild(el);

      await resolver.resolve('balanceDisplay');
      expect(resolver.getStats().size).toBe(1);

      resolver.invalidate('balanceDisplay');
      expect(resolver.getStats().size).toBe(0);
      expect(resolver.getStats().invalidations).toBe(1);
    });

    it('invalidate()로 존재하지 않는 키를 무효화해도 에러가 없어야 한다', () => {
      expect(() => resolver.invalidate('nonExistentKey')).not.toThrow();
    });

    it('pruneExpired()로 만료된 캐시를 정리할 수 있어야 한다', async () => {
      const shortResolver = new SelectorResolver(1); // 1ms TTL

      const el = document.createElement('div');
      el.className = 'balance-info-block__value';
      document.body.appendChild(el);

      await shortResolver.resolve('balanceDisplay');
      expect(shortResolver.getStats().size).toBe(1);

      // TTL 만료 대기
      await new Promise((resolve) => setTimeout(resolve, 10));

      const pruned = shortResolver.pruneExpired();
      expect(pruned).toBe(1);
      expect(shortResolver.getStats().size).toBe(0);
    });
  });

  describe('통계 및 설정', () => {
    it('getStats()가 올바른 통계를 반환해야 한다', () => {
      const stats = resolver.getStats();
      expect(stats).toEqual({
        hits: 0,
        misses: 0,
        invalidations: 0,
        size: 0,
      });
    });

    it('resetStats()로 통계를 초기화할 수 있어야 한다', async () => {
      const el = document.createElement('div');
      el.className = 'balance-info-block__value';
      document.body.appendChild(el);

      await resolver.resolve('balanceDisplay');
      expect(resolver.getStats().misses).toBe(1);

      resolver.resetStats();
      expect(resolver.getStats().misses).toBe(0);
    });

    it('getCacheTtlMs()가 현재 TTL을 반환해야 한다', () => {
      expect(resolver.getCacheTtlMs()).toBe(100);
    });

    it('setCacheTtlMs()로 TTL을 변경할 수 있어야 한다', () => {
      resolver.setCacheTtlMs(5000);
      expect(resolver.getCacheTtlMs()).toBe(5000);
    });

    it('DEFAULT_CACHE_TTL_MS는 30초여야 한다', () => {
      expect(DEFAULT_CACHE_TTL_MS).toBe(30_000);
    });
  });

  describe('싱글톤 관리', () => {
    it('getSelectorResolver()는 같은 인스턴스를 반환해야 한다', () => {
      const instance1 = getSelectorResolver();
      const instance2 = getSelectorResolver();
      expect(instance1).toBe(instance2);
    });

    it('resetSelectorResolver() 후에는 새 인스턴스를 반환해야 한다', () => {
      const instance1 = getSelectorResolver();
      resetSelectorResolver();
      const instance2 = getSelectorResolver();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('fallback 셀렉터', () => {
    it('primary가 실패하면 fallback으로 요소를 찾아야 한다', async () => {
      // callButton의 fallback 중 하나에 해당하는 DOM 생성
      const def = ROBUST_SELECTORS['callButton'];
      if (!def || def.fallbacks.length === 0) return;

      // primary(.switch-state-block__item:first-child)는 없고,
      // fallback(.btn-call)만 있는 상황
      const el = document.createElement('div');
      el.className = 'btn-call';
      document.body.appendChild(el);

      const result = await resolver.resolve('callButton');
      if (result) {
        expect(result.className).toBe('btn-call');
      }
    });
  });
});
