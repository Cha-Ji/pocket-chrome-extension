import { describe, it, expect, vi, afterEach } from 'vitest';
import { POError, ErrorCode, ErrorSeverity, errorHandler } from './index';

describe('errors module', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POError message defaults to error code message when not provided', () => {
    const error = new POError({
      code: ErrorCode.UNKNOWN,
      context: { module: 'test', function: 'test' },
    });

    expect(error.message).toBeTruthy();
    expect(error.code).toBe(ErrorCode.UNKNOWN);
  });

  it('POError.from wraps unknown values with defaults', () => {
    const error = POError.from('Boom', { module: 'test', function: 'test' }, ErrorCode.UNKNOWN);

    expect(error).toBeInstanceOf(POError);
    expect(error.code).toBe(ErrorCode.UNKNOWN);
    expect(error.message).toBe('Boom');
  });

  it('errorHandler.handle processes errors and logs them', () => {
    const testError = new Error('Failed');
    const error = errorHandler.handle(testError, { module: 'test', function: 'test' });

    expect(error).toBeInstanceOf(POError);
    expect(error.message).toContain('Failed');

    const stats = errorHandler.getStats();
    expect(stats.total).toBeGreaterThan(0);
  });
});
