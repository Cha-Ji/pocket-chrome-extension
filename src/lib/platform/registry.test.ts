import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlatformRegistry } from './registry';
import type {
  IPlatformAdapter,
  IPlatformDetector,
  IDataSource,
  IExecutor,
  ISafetyGuard,
} from './interfaces';

// ============================================================
// Mock Helpers
// ============================================================

function createMockAdapter(platformId: string, platformName: string): IPlatformAdapter {
  return {
    platformId,
    platformName,
    dataSource: {} as IDataSource,
    executor: {} as IExecutor,
    safety: {} as ISafetyGuard,
    isReady: false,
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
  };
}

function createMockDetector(
  platformId: string,
  score: number,
  adapter?: IPlatformAdapter,
): IPlatformDetector {
  return {
    platformId,
    detect: vi.fn().mockReturnValue(score),
    createAdapter: vi.fn().mockReturnValue(adapter ?? createMockAdapter(platformId, platformId)),
  };
}

// ============================================================
// Tests
// ============================================================

describe('PlatformRegistry', () => {
  let registry: PlatformRegistry;

  beforeEach(() => {
    registry = new PlatformRegistry();
  });

  describe('register / unregister', () => {
    it('should register a detector', () => {
      const detector = createMockDetector('test-platform', 1);
      registry.register(detector);

      expect(registry.getRegisteredPlatforms()).toContain('test-platform');
    });

    it('should prevent duplicate registration', () => {
      const detector = createMockDetector('test-platform', 1);
      registry.register(detector);
      registry.register(detector); // 중복

      expect(registry.getRegisteredPlatforms()).toHaveLength(1);
    });

    it('should unregister a detector', () => {
      const detector = createMockDetector('test-platform', 1);
      registry.register(detector);
      registry.unregister('test-platform');

      expect(registry.getRegisteredPlatforms()).toHaveLength(0);
    });
  });

  describe('detect', () => {
    it('should return null when no detectors registered', () => {
      const result = registry.detect('https://example.com', document);
      expect(result).toBeNull();
    });

    it('should return null when no detector matches', () => {
      const detector = createMockDetector('test', 0);
      registry.register(detector);

      const result = registry.detect('https://example.com', document);
      expect(result).toBeNull();
    });

    it('should return adapter for matching detector', () => {
      const adapter = createMockAdapter('test', 'Test Platform');
      const detector = createMockDetector('test', 0.8, adapter);
      registry.register(detector);

      const result = registry.detect('https://example.com', document);
      expect(result).toBe(adapter);
    });

    it('should pick detector with highest score', () => {
      const lowAdapter = createMockAdapter('low', 'Low');
      const highAdapter = createMockAdapter('high', 'High');
      const lowDetector = createMockDetector('low', 0.3, lowAdapter);
      const highDetector = createMockDetector('high', 0.9, highAdapter);

      registry.register(lowDetector);
      registry.register(highDetector);

      const result = registry.detect('https://example.com', document);
      expect(result).toBe(highAdapter);
    });
  });

  describe('detectAndInitialize', () => {
    it('should detect, create, and initialize adapter', async () => {
      const adapter = createMockAdapter('test', 'Test');
      const detector = createMockDetector('test', 1, adapter);
      registry.register(detector);

      const result = await registry.detectAndInitialize('https://example.com', document);

      expect(result).toBe(adapter);
      expect(adapter.initialize).toHaveBeenCalled();
      expect(registry.getActiveAdapter()).toBe(adapter);
    });

    it('should dispose previous adapter before initializing new one', async () => {
      const adapter1 = createMockAdapter('test1', 'Test1');
      const adapter2 = createMockAdapter('test2', 'Test2');

      const detector1 = createMockDetector('test1', 1, adapter1);
      registry.register(detector1);
      await registry.detectAndInitialize('https://site1.com', document);

      // 새 감지기 등록 (더 높은 점수)
      registry.unregister('test1');
      const detector2 = createMockDetector('test2', 1, adapter2);
      registry.register(detector2);
      await registry.detectAndInitialize('https://site2.com', document);

      expect(adapter1.dispose).toHaveBeenCalled();
      expect(registry.getActiveAdapter()).toBe(adapter2);
    });

    it('should return null when no platform detected', async () => {
      const result = await registry.detectAndInitialize('https://unknown.com', document);
      expect(result).toBeNull();
    });

    it('should return null when initialization fails', async () => {
      const adapter = createMockAdapter('test', 'Test');
      (adapter.initialize as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Init failed'));
      const detector = createMockDetector('test', 1, adapter);
      registry.register(detector);

      const result = await registry.detectAndInitialize('https://example.com', document);

      expect(result).toBeNull();
      expect(registry.getActiveAdapter()).toBeNull();
    });
  });

  describe('dispose', () => {
    it('should dispose active adapter', async () => {
      const adapter = createMockAdapter('test', 'Test');
      const detector = createMockDetector('test', 1, adapter);
      registry.register(detector);
      await registry.detectAndInitialize('https://example.com', document);

      registry.dispose();

      expect(adapter.dispose).toHaveBeenCalled();
      expect(registry.getActiveAdapter()).toBeNull();
    });

    it('should handle dispose when no active adapter', () => {
      expect(() => registry.dispose()).not.toThrow();
    });
  });
});
