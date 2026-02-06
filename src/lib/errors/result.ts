import { POError } from './po-error';
import { ErrorCode } from './error-codes';
import type { ErrorContext } from './po-error';

/**
 * 성공 결과
 */
export interface Success<T> {
  readonly success: true;
  readonly data: T;
}

/**
 * 실패 결과
 */
export interface Failure<E = POError> {
  readonly success: false;
  readonly error: E;
}

/**
 * Result 타입 - 성공 또는 실패를 명시적으로 표현
 *
 * 기존 `{ success: boolean; error?: string }` 패턴을 대체하여
 * 타입 안전성과 에러 처리 일관성을 높임
 *
 * @example
 * ```typescript
 * async function fetchUser(id: string): Promise<Result<User>> {
 *   try {
 *     const user = await api.getUser(id);
 *     return Result.ok(user);
 *   } catch (e) {
 *     return Result.err(POError.from(e, { module: 'lib', function: 'fetchUser' }));
 *   }
 * }
 *
 * // 사용
 * const result = await fetchUser('123');
 * if (result.success) {
 *   console.log(result.data.name);
 * } else {
 *   console.error(result.error.toReadableString());
 * }
 * ```
 */
export type Result<T, E = POError> = Success<T> | Failure<E>;

/**
 * Result 유틸리티 함수들
 */
export const Result = {
  /**
   * 성공 Result 생성
   */
  ok: <T>(data: T): Success<T> => ({ success: true, data }),

  /**
   * 실패 Result 생성
   */
  err: <E = POError>(error: E): Failure<E> => ({ success: false, error }),

  /**
   * POError로 실패 Result 생성 (편의 함수)
   */
  fail: (
    code: ErrorCode,
    message: string,
    context?: Partial<ErrorContext>
  ): Failure<POError> =>
    Result.err(new POError({ code, message, context })),

  /**
   * Result가 성공인지 확인 (타입 가드)
   */
  isOk: <T, E>(result: Result<T, E>): result is Success<T> => result.success,

  /**
   * Result가 실패인지 확인 (타입 가드)
   */
  isErr: <T, E>(result: Result<T, E>): result is Failure<E> => !result.success,

  /**
   * 성공 값에 함수 적용 (map)
   */
  map: <T, U, E>(result: Result<T, E>, fn: (data: T) => U): Result<U, E> => {
    if (result.success) {
      return Result.ok(fn(result.data));
    }
    return result;
  },

  /**
   * 성공 값에 Result 반환 함수 적용 (flatMap/chain)
   */
  flatMap: <T, U, E>(
    result: Result<T, E>,
    fn: (data: T) => Result<U, E>
  ): Result<U, E> => {
    if (result.success) {
      return fn(result.data);
    }
    return result;
  },

  /**
   * 에러에 함수 적용 (mapErr)
   */
  mapErr: <T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> => {
    if (!result.success) {
      return Result.err(fn(result.error));
    }
    return result;
  },

  /**
   * 성공 값 추출 (실패 시 예외 발생)
   */
  unwrap: <T, E>(result: Result<T, E>): T => {
    if (result.success) {
      return result.data;
    }
    throw result.error;
  },

  /**
   * 성공 값 추출 또는 기본값 반환
   */
  unwrapOr: <T, E>(result: Result<T, E>, defaultValue: T): T => {
    if (result.success) {
      return result.data;
    }
    return defaultValue;
  },

  /**
   * 성공 값 추출 또는 함수로 기본값 생성
   */
  unwrapOrElse: <T, E>(result: Result<T, E>, fn: (error: E) => T): T => {
    if (result.success) {
      return result.data;
    }
    return fn(result.error);
  },

  /**
   * 에러 추출 (성공 시 undefined)
   */
  unwrapErr: <T, E>(result: Result<T, E>): E | undefined => {
    if (!result.success) {
      return result.error;
    }
    return undefined;
  },

  /**
   * 성공 시 콜백 실행
   */
  onOk: <T, E>(result: Result<T, E>, fn: (data: T) => void): Result<T, E> => {
    if (result.success) {
      fn(result.data);
    }
    return result;
  },

  /**
   * 실패 시 콜백 실행
   */
  onErr: <T, E>(result: Result<T, E>, fn: (error: E) => void): Result<T, E> => {
    if (!result.success) {
      fn(result.error);
    }
    return result;
  },

  /**
   * 여러 Result를 하나로 결합 (모두 성공해야 성공)
   */
  all: <T extends readonly unknown[], E>(
    results: { [K in keyof T]: Result<T[K], E> }
  ): Result<T, E> => {
    const data: unknown[] = [];
    for (const result of results) {
      if (!result.success) {
        return result;
      }
      data.push(result.data);
    }
    return Result.ok(data as unknown as T);
  },

  /**
   * Promise<Result>를 Result<Promise>로 변환하지 않고
   * async/await과 함께 사용하기 위한 유틸리티
   */
  fromPromise: async <T>(
    promise: Promise<T>,
    context?: Partial<ErrorContext>
  ): Promise<Result<T>> => {
    try {
      const data = await promise;
      return Result.ok(data);
    } catch (e) {
      return Result.err(POError.from(e, context));
    }
  },

  /**
   * nullable 값을 Result로 변환
   */
  fromNullable: <T>(
    value: T | null | undefined,
    error: POError
  ): Result<T> => {
    if (value === null || value === undefined) {
      return Result.err(error);
    }
    return Result.ok(value);
  },

  /**
   * 기존 { success: boolean; error?: string } 패턴에서 변환
   */
  fromLegacy: <T>(
    legacy: { success: boolean; data?: T; error?: string },
    context?: Partial<ErrorContext>
  ): Result<T> => {
    if (legacy.success && legacy.data !== undefined) {
      return Result.ok(legacy.data);
    }
    return Result.err(
      new POError({
        code: ErrorCode.UNKNOWN,
        message: legacy.error ?? 'Unknown error',
        context,
      })
    );
  },

  /**
   * Result를 기존 { success: boolean; error?: string } 패턴으로 변환
   */
  toLegacy: <T>(result: Result<T>): { success: boolean; data?: T; error?: string } => {
    if (result.success) {
      return { success: true, data: result.data };
    }
    return {
      success: false,
      error: result.error instanceof POError ? result.error.message : String(result.error),
    };
  },

  /**
   * 조건이 참이면 성공, 거짓이면 실패
   */
  fromPredicate: <T>(
    value: T,
    predicate: (value: T) => boolean,
    error: POError
  ): Result<T> => {
    if (predicate(value)) {
      return Result.ok(value);
    }
    return Result.err(error);
  },

  /**
   * try-catch 래퍼
   */
  tryCatch: <T>(fn: () => T, context?: Partial<ErrorContext>): Result<T> => {
    try {
      return Result.ok(fn());
    } catch (e) {
      return Result.err(POError.from(e, context));
    }
  },
};

/**
 * AsyncResult 타입 (편의 타입)
 */
export type AsyncResult<T, E = POError> = Promise<Result<T, E>>;
