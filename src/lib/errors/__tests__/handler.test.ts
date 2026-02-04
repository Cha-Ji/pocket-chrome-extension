import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createErrorHandler, ErrorHandlerConfig } from '../handler';
import { POError } from '../po-error';
import { ErrorCode, ErrorSeverity } from '../error-codes';

describe('ErrorHandler', () => {
  let errorHandler: ReturnType<typeof createErrorHandler>;

  beforeEach(() => {
    errorHandler = createErrorHandler({ consoleLogging: false });
  });

  describe('handle', () => {
    it('should normalize unknown error to POError', () => {
      const result = errorHandler.handle(
        new Error('test error'),
        { module: 'lib', function: 'test' }
      );

      expect(result).toBeInstanceOf(POError);
      expect(result.message).toBe('test error');
      expect(result.context.module).toBe('lib');
    });

    it('should return same POError if already POError', () => {
      const original = new POError({
        code: ErrorCode.TRADE_EXECUTION_FAILED,
        message: 'original',
      });

      const result = errorHandler.handle(original);

      expect(result.message).toBe('original');
      expect(result.code).toBe(ErrorCode.TRADE_EXECUTION_FAILED);
    });

    it('should add error to history', () => {
      errorHandler.handle(new Error('error 1'));
      errorHandler.handle(new Error('error 2'));

      const history = errorHandler.getHistory();

      expect(history).toHaveLength(2);
      expect(history[0].error.message).toBe('error 2'); // Most recent first
      expect(history[1].error.message).toBe('error 1');
    });

    it('should use provided error code', () => {
      const result = errorHandler.handle(
        new Error('test'),
        { module: 'lib', function: 'test' },
        ErrorCode.NETWORK_TIMEOUT
      );

      expect(result.code).toBe(ErrorCode.NETWORK_TIMEOUT);
    });
  });

  describe('logError', () => {
    it('should log POError directly', () => {
      const error = new POError({
        code: ErrorCode.DB_WRITE_FAILED,
        message: 'DB error',
      });

      const entry = errorHandler.logError(error);

      expect(entry.error.code).toBe(ErrorCode.DB_WRITE_FAILED);
      expect(entry.handled).toBe(true);
    });
  });

  describe('history management', () => {
    it('should limit history size', () => {
      const handler = createErrorHandler({
        maxHistory: 3,
        consoleLogging: false,
      });

      for (let i = 0; i < 5; i++) {
        handler.handle(new Error(`error ${i}`));
      }

      const history = handler.getHistory();

      expect(history).toHaveLength(3);
      expect(history[0].error.message).toBe('error 4');
      expect(history[2].error.message).toBe('error 2');
    });

    it('should get history by code', () => {
      errorHandler.handle(new Error('e1'), undefined, ErrorCode.NETWORK_TIMEOUT);
      errorHandler.handle(new Error('e2'), undefined, ErrorCode.DB_WRITE_FAILED);
      errorHandler.handle(new Error('e3'), undefined, ErrorCode.NETWORK_TIMEOUT);

      const filtered = errorHandler.getHistoryByCode(ErrorCode.NETWORK_TIMEOUT);

      expect(filtered).toHaveLength(2);
      expect(filtered.every((e) => e.error.code === ErrorCode.NETWORK_TIMEOUT)).toBe(true);
    });

    it('should get history by module', () => {
      errorHandler.handle(new Error('e1'), { module: 'background', function: 'f1' });
      errorHandler.handle(new Error('e2'), { module: 'content-script', function: 'f2' });
      errorHandler.handle(new Error('e3'), { module: 'background', function: 'f3' });

      const filtered = errorHandler.getHistoryByModule('background');

      expect(filtered).toHaveLength(2);
    });

    it('should clear history', () => {
      errorHandler.handle(new Error('e1'));
      errorHandler.handle(new Error('e2'));

      errorHandler.clearHistory();

      expect(errorHandler.getHistory()).toHaveLength(0);
    });
  });

  describe('listeners', () => {
    it('should notify listeners on error', () => {
      const listener = vi.fn();
      errorHandler.onError(listener);

      const error = errorHandler.handle(new Error('test'));

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(error, expect.any(Object));
    });

    it('should allow unsubscribing', () => {
      const listener = vi.fn();
      const unsubscribe = errorHandler.onError(listener);

      errorHandler.handle(new Error('test 1'));
      unsubscribe();
      errorHandler.handle(new Error('test 2'));

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should handle listener errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const badListener = vi.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });
      const goodListener = vi.fn();

      errorHandler.onError(badListener);
      errorHandler.onError(goodListener);

      errorHandler.handle(new Error('test'));

      expect(badListener).toHaveBeenCalled();
      expect(goodListener).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('getStats', () => {
    it('should return error statistics', () => {
      errorHandler.handle(new Error('e1'), { module: 'background', function: 'f1' }, ErrorCode.NETWORK_TIMEOUT);
      errorHandler.handle(new Error('e2'), { module: 'background', function: 'f2' }, ErrorCode.NETWORK_TIMEOUT);
      errorHandler.handle(new Error('e3'), { module: 'content-script', function: 'f3' }, ErrorCode.DB_WRITE_FAILED);

      const stats = errorHandler.getStats();

      expect(stats.total).toBe(3);
      expect(stats.byCode[ErrorCode.NETWORK_TIMEOUT]).toBe(2);
      expect(stats.byCode[ErrorCode.DB_WRITE_FAILED]).toBe(1);
      expect(stats.byModule['background']).toBe(2);
      expect(stats.byModule['content-script']).toBe(1);
      expect(stats.lastErrorAt).toBeDefined();
    });

    it('should count by severity', () => {
      // TRADE_NOT_DEMO is CRITICAL
      errorHandler.handle(new POError({ code: ErrorCode.TRADE_NOT_DEMO }));
      // DB_NOT_FOUND is INFO
      errorHandler.handle(new POError({ code: ErrorCode.DB_NOT_FOUND }));
      errorHandler.handle(new POError({ code: ErrorCode.DB_NOT_FOUND }));

      const stats = errorHandler.getStats();

      expect(stats.bySeverity[ErrorSeverity.CRITICAL]).toBe(1);
      expect(stats.bySeverity[ErrorSeverity.INFO]).toBe(2);
    });
  });

  describe('configure', () => {
    it('should update configuration', () => {
      const handler = createErrorHandler();

      handler.configure({ maxHistory: 50 });

      expect(handler.getConfig().maxHistory).toBe(50);
    });

    it('should preserve unspecified config values', () => {
      const handler = createErrorHandler({
        maxHistory: 200,
        consoleLogging: true,
      });

      handler.configure({ maxHistory: 50 });

      const config = handler.getConfig();
      expect(config.maxHistory).toBe(50);
      expect(config.consoleLogging).toBe(true);
    });
  });
});
