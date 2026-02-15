import { describe, it, expect } from 'vitest';
import { Result, Success, Failure } from '../result';
import { POError } from '../po-error';
import { ErrorCode } from '../error-codes';

describe('Result', () => {
  describe('ok / err', () => {
    it('should create success result', () => {
      const result = Result.ok(42);

      expect(result.success).toBe(true);
      expect((result as Success<number>).data).toBe(42);
    });

    it('should create failure result', () => {
      const error = new POError({ code: ErrorCode.UNKNOWN });
      const result = Result.err(error);

      expect(result.success).toBe(false);
      expect((result as Failure).error).toBe(error);
    });
  });

  describe('fail', () => {
    it('should create failure with POError', () => {
      const result = Result.fail(ErrorCode.VALIDATION_REQUIRED, 'Field is required', {
        module: 'lib',
        function: 'validate',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe(ErrorCode.VALIDATION_REQUIRED);
      expect(result.error.message).toBe('Field is required');
    });
  });

  describe('isOk / isErr', () => {
    it('should type guard success', () => {
      const result: Result<number> = Result.ok(42);

      if (Result.isOk(result)) {
        // TypeScript should know result.data exists
        expect(result.data).toBe(42);
      } else {
        throw new Error('Should not reach here');
      }
    });

    it('should type guard failure', () => {
      const error = new POError({ code: ErrorCode.UNKNOWN });
      const result: Result<number> = Result.err(error);

      if (Result.isErr(result)) {
        // TypeScript should know result.error exists
        expect(result.error).toBe(error);
      } else {
        throw new Error('Should not reach here');
      }
    });
  });

  describe('map', () => {
    it('should map success value', () => {
      const result = Result.ok(5);
      const mapped = Result.map(result, (x) => x * 2);

      expect(Result.isOk(mapped)).toBe(true);
      expect((mapped as Success<number>).data).toBe(10);
    });

    it('should pass through failure', () => {
      const error = new POError({ code: ErrorCode.UNKNOWN });
      const result: Result<number> = Result.err(error);
      const mapped = Result.map(result, (x) => x * 2);

      expect(Result.isErr(mapped)).toBe(true);
      expect((mapped as Failure).error).toBe(error);
    });
  });

  describe('flatMap', () => {
    it('should chain success results', () => {
      const result = Result.ok(5);
      const chained = Result.flatMap(result, (x) =>
        x > 0 ? Result.ok(x * 2) : Result.fail(ErrorCode.VALIDATION_RANGE, 'Must be positive'),
      );

      expect(Result.isOk(chained)).toBe(true);
      expect((chained as Success<number>).data).toBe(10);
    });

    it('should short-circuit on failure', () => {
      const result = Result.ok(-5);
      const chained = Result.flatMap(result, (x) =>
        x > 0 ? Result.ok(x * 2) : Result.fail(ErrorCode.VALIDATION_RANGE, 'Must be positive'),
      );

      expect(Result.isErr(chained)).toBe(true);
      expect((chained as Failure).error.code).toBe(ErrorCode.VALIDATION_RANGE);
    });

    it('should pass through initial failure', () => {
      const error = new POError({ code: ErrorCode.UNKNOWN });
      const result: Result<number> = Result.err(error);
      const chained = Result.flatMap(result, (x) => Result.ok(x * 2));

      expect(Result.isErr(chained)).toBe(true);
      expect((chained as Failure).error).toBe(error);
    });
  });

  describe('mapErr', () => {
    it('should map error', () => {
      const result: Result<number, string> = Result.err('original error');
      const mapped = Result.mapErr(result, (e) => `Wrapped: ${e}`);

      expect(Result.isErr(mapped)).toBe(true);
      expect((mapped as Failure<string>).error).toBe('Wrapped: original error');
    });

    it('should pass through success', () => {
      const result: Result<number, string> = Result.ok(42);
      const mapped = Result.mapErr(result, (e) => `Wrapped: ${e}`);

      expect(Result.isOk(mapped)).toBe(true);
      expect((mapped as Success<number>).data).toBe(42);
    });
  });

  describe('unwrap / unwrapOr / unwrapOrElse', () => {
    it('should unwrap success value', () => {
      const result = Result.ok(42);
      expect(Result.unwrap(result)).toBe(42);
    });

    it('should throw on unwrap failure', () => {
      const error = new POError({ code: ErrorCode.UNKNOWN });
      const result: Result<number> = Result.err(error);

      expect(() => Result.unwrap(result)).toThrow(error);
    });

    it('should return default value on failure', () => {
      const error = new POError({ code: ErrorCode.UNKNOWN });
      const result: Result<number> = Result.err(error);

      expect(Result.unwrapOr(result, 0)).toBe(0);
    });

    it('should return success value over default', () => {
      const result = Result.ok(42);
      expect(Result.unwrapOr(result, 0)).toBe(42);
    });

    it('should compute default with function', () => {
      const error = new POError({ code: ErrorCode.UNKNOWN });
      const result: Result<number> = Result.err(error);

      expect(Result.unwrapOrElse(result, (e) => e.message.length)).toBe(error.message.length);
    });
  });

  describe('onOk / onErr', () => {
    it('should call callback on success', () => {
      const result = Result.ok(42);
      let called = false;

      Result.onOk(result, (data) => {
        called = true;
        expect(data).toBe(42);
      });

      expect(called).toBe(true);
    });

    it('should not call onOk on failure', () => {
      const result: Result<number> = Result.err(new POError({ code: ErrorCode.UNKNOWN }));
      let called = false;

      Result.onOk(result, () => {
        called = true;
      });

      expect(called).toBe(false);
    });

    it('should call callback on failure', () => {
      const error = new POError({ code: ErrorCode.UNKNOWN });
      const result: Result<number> = Result.err(error);
      let called = false;

      Result.onErr(result, (e) => {
        called = true;
        expect(e).toBe(error);
      });

      expect(called).toBe(true);
    });
  });

  describe('all', () => {
    it('should combine all successes', () => {
      const results = [Result.ok(1), Result.ok(2), Result.ok(3)] as const;
      const combined = Result.all(results);

      expect(Result.isOk(combined)).toBe(true);
      expect((combined as Success<readonly [number, number, number]>).data).toEqual([1, 2, 3]);
    });

    it('should return first failure', () => {
      const error = new POError({ code: ErrorCode.UNKNOWN, message: 'first error' });
      const results: [Result<number>, Result<number>, Result<number>] = [
        Result.ok(1),
        Result.err(error),
        Result.ok(3),
      ];
      const combined = Result.all(results);

      expect(Result.isErr(combined)).toBe(true);
      expect((combined as Failure).error).toBe(error);
    });
  });

  describe('fromPromise', () => {
    it('should wrap resolved promise', async () => {
      const result = await Result.fromPromise(Promise.resolve(42));

      expect(Result.isOk(result)).toBe(true);
      expect((result as Success<number>).data).toBe(42);
    });

    it('should wrap rejected promise', async () => {
      const result = await Result.fromPromise(Promise.reject(new Error('test error')), {
        module: 'lib',
        function: 'test',
      });

      expect(Result.isErr(result)).toBe(true);
      expect((result as Failure).error.message).toBe('test error');
    });
  });

  describe('fromNullable', () => {
    it('should create success for non-null value', () => {
      const result = Result.fromNullable(42, new POError({ code: ErrorCode.VALIDATION_REQUIRED }));

      expect(Result.isOk(result)).toBe(true);
      expect((result as Success<number>).data).toBe(42);
    });

    it('should create failure for null', () => {
      const error = new POError({ code: ErrorCode.VALIDATION_REQUIRED });
      const result = Result.fromNullable(null, error);

      expect(Result.isErr(result)).toBe(true);
      expect((result as Failure).error).toBe(error);
    });

    it('should create failure for undefined', () => {
      const error = new POError({ code: ErrorCode.VALIDATION_REQUIRED });
      const result = Result.fromNullable(undefined, error);

      expect(Result.isErr(result)).toBe(true);
    });
  });

  describe('fromLegacy / toLegacy', () => {
    it('should convert from legacy success format', () => {
      const legacy = { success: true, data: 42 };
      const result = Result.fromLegacy(legacy);

      expect(Result.isOk(result)).toBe(true);
      expect((result as Success<number>).data).toBe(42);
    });

    it('should convert from legacy failure format', () => {
      const legacy = { success: false, error: 'Something went wrong' };
      const result = Result.fromLegacy<number>(legacy);

      expect(Result.isErr(result)).toBe(true);
      expect((result as Failure).error.message).toBe('Something went wrong');
    });

    it('should convert to legacy success format', () => {
      const result = Result.ok(42);
      const legacy = Result.toLegacy(result);

      expect(legacy).toEqual({ success: true, data: 42 });
    });

    it('should convert to legacy failure format', () => {
      const result: Result<number> = Result.err(
        new POError({ code: ErrorCode.UNKNOWN, message: 'test error' }),
      );
      const legacy = Result.toLegacy(result);

      expect(legacy).toEqual({ success: false, error: 'test error' });
    });
  });

  describe('tryCatch', () => {
    it('should catch synchronous success', () => {
      const result = Result.tryCatch(() => 42);

      expect(Result.isOk(result)).toBe(true);
      expect((result as Success<number>).data).toBe(42);
    });

    it('should catch synchronous error', () => {
      const result = Result.tryCatch(
        () => {
          throw new Error('sync error');
        },
        { module: 'lib', function: 'test' },
      );

      expect(Result.isErr(result)).toBe(true);
      expect((result as Failure).error.message).toBe('sync error');
    });
  });
});
