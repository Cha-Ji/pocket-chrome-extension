import { POError, ErrorContext } from './po-error';
import { ErrorCode } from './error-codes';
import { Result, AsyncResult } from './result';
import { errorHandler } from './handler';

/**
 * 비동기 함수를 Result로 래핑
 *
 * @example
 * ```typescript
 * const result = await tryCatchAsync(
 *   () => fetchData(),
 *   { module: 'lib', function: 'fetchData' }
 * );
 *
 * if (result.success) {
 *   console.log(result.data);
 * } else {
 *   console.error(result.error.toReadableString());
 * }
 * ```
 */
export async function tryCatchAsync<T>(
  fn: () => Promise<T>,
  context: Partial<ErrorContext>,
  code?: ErrorCode,
): AsyncResult<T> {
  try {
    const data = await fn();
    return Result.ok(data);
  } catch (error) {
    const poError = errorHandler.handle(error, context, code);
    return Result.err(poError);
  }
}

/**
 * 동기 함수를 Result로 래핑
 *
 * @example
 * ```typescript
 * const result = tryCatch(
 *   () => JSON.parse(jsonString),
 *   { module: 'lib', function: 'parseJson' }
 * );
 * ```
 */
export function tryCatch<T>(
  fn: () => T,
  context: Partial<ErrorContext>,
  code?: ErrorCode,
): Result<T> {
  try {
    const data = fn();
    return Result.ok(data);
  } catch (error) {
    const poError = errorHandler.handle(error, context, code);
    return Result.err(poError);
  }
}

/**
 * null/undefined 체크 (타입 가드)
 * 값이 없으면 POError throw
 *
 * @example
 * ```typescript
 * const button = document.querySelector('.call-btn');
 * assertDefined(
 *   button,
 *   'CALL 버튼을 찾을 수 없습니다',
 *   { module: 'content-script', function: 'clickCallButton' }
 * );
 * // 이 시점에서 button은 non-null
 * button.click();
 * ```
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message: string,
  context: Partial<ErrorContext>,
  code: ErrorCode = ErrorCode.VALIDATION_REQUIRED,
): asserts value is T {
  if (value === null || value === undefined) {
    throw new POError({ code, message, context });
  }
}

/**
 * 조건 검증 (타입 가드)
 * 조건이 false면 POError throw
 *
 * @example
 * ```typescript
 * assert(
 *   balance >= amount,
 *   '잔액이 부족합니다',
 *   { module: 'content-script', function: 'executeTrade' },
 *   ErrorCode.TRADE_INSUFFICIENT_BALANCE
 * );
 * ```
 */
export function assert(
  condition: boolean,
  message: string,
  context: Partial<ErrorContext>,
  code: ErrorCode = ErrorCode.VALIDATION_REQUIRED,
): asserts condition {
  if (!condition) {
    throw new POError({ code, message, context });
  }
}

/**
 * DOM 요소 조회 (없으면 에러)
 *
 * @example
 * ```typescript
 * const button = queryElement<HTMLButtonElement>(
 *   '.call-btn',
 *   { module: 'content-script', function: 'getCallButton' }
 * );
 * button.click();
 * ```
 */
export function queryElement<T extends Element>(
  selector: string,
  context: Partial<ErrorContext>,
  parent: ParentNode = document,
): T {
  const element = parent.querySelector<T>(selector);
  if (!element) {
    throw new POError({
      code: ErrorCode.DOM_ELEMENT_NOT_FOUND,
      message: `요소를 찾을 수 없습니다: ${selector}`,
      context: { ...context, extra: { selector } },
    });
  }
  return element;
}

/**
 * DOM 요소 조회 (Result 반환)
 *
 * @example
 * ```typescript
 * const result = queryElementSafe<HTMLButtonElement>(
 *   '.call-btn',
 *   { module: 'content-script', function: 'getCallButton' }
 * );
 *
 * if (result.success) {
 *   result.data.click();
 * }
 * ```
 */
export function queryElementSafe<T extends Element>(
  selector: string,
  context: Partial<ErrorContext>,
  parent: ParentNode = document,
): Result<T> {
  const element = parent.querySelector<T>(selector);
  if (!element) {
    return Result.err(
      new POError({
        code: ErrorCode.DOM_ELEMENT_NOT_FOUND,
        message: `요소를 찾을 수 없습니다: ${selector}`,
        context: { ...context, extra: { selector } },
      }),
    );
  }
  return Result.ok(element);
}

/**
 * 재시도 래퍼 (지수 백오프)
 *
 * @example
 * ```typescript
 * const result = await retry(
 *   () => fetch('/api/data'),
 *   {
 *     maxAttempts: 3,
 *     baseDelay: 1000,
 *     context: { module: 'lib', function: 'fetchData' }
 *   }
 * );
 * ```
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelay?: number;
    maxDelay?: number;
    context: Partial<ErrorContext>;
    code?: ErrorCode;
    shouldRetry?: (error: POError, attempt: number) => boolean;
  },
): AsyncResult<T> {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    context,
    code,
    shouldRetry = () => true,
  } = options;

  let lastError: POError | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const data = await fn();
      return Result.ok(data);
    } catch (error) {
      lastError = POError.from(error, context, code);
      lastError.setExtra({ attempt, maxAttempts });

      // 마지막 시도이거나 재시도 불가능한 에러면 종료
      if (attempt === maxAttempts || !shouldRetry(lastError, attempt)) {
        break;
      }

      // 지수 백오프 대기
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
      await sleep(delay);
    }
  }

  errorHandler.logError(lastError!);
  return Result.err(lastError!);
}

/**
 * sleep 유틸리티
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 타임아웃 래퍼
 *
 * @example
 * ```typescript
 * const result = await withTimeout(
 *   fetchData(),
 *   5000,
 *   { module: 'lib', function: 'fetchData' }
 * );
 * ```
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  context: Partial<ErrorContext>,
): AsyncResult<T> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new POError({
          code: ErrorCode.NETWORK_TIMEOUT,
          message: `작업이 ${timeoutMs}ms 내에 완료되지 않았습니다`,
          context,
        }),
      );
    }, timeoutMs);
  });

  try {
    const data = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return Result.ok(data);
  } catch (error) {
    clearTimeout(timeoutId!);
    const poError = POError.from(error, context);
    return Result.err(poError);
  }
}

/**
 * 에러 경로 추가 래퍼
 * catch 블록에서 re-throw 시 사용
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (e) {
 *   throw rethrowWithPath(e, 'background.handleMessage');
 * }
 * ```
 */
export function rethrowWithPath(error: unknown, location: string): POError {
  const poError = POError.from(error);
  poError.addPath(location);
  return poError;
}

/**
 * 에러 무시 래퍼 (선택적 작업용)
 * 에러가 발생해도 계속 진행해야 하는 경우
 *
 * @example
 * ```typescript
 * // 사이드 패널에 메시지 전송 (열려있지 않으면 무시)
 * await ignoreError(
 *   () => chrome.runtime.sendMessage({ type: 'UPDATE' }),
 *   { module: 'background', function: 'notifySidePanel' }
 * );
 * ```
 */
export async function ignoreError<T>(
  fn: () => Promise<T>,
  context: Partial<ErrorContext>,
  options?: { logLevel?: 'none' | 'warn' | 'error' },
): Promise<T | undefined> {
  const logLevel = options?.logLevel ?? 'warn';

  try {
    return await fn();
  } catch (error) {
    if (logLevel !== 'none') {
      const poError = POError.from(error, context);
      if (logLevel === 'error') {
        console.error('[ignoreError]', poError.toShortString());
      } else {
        console.warn('[ignoreError]', poError.toShortString());
      }
    }
    return undefined;
  }
}

/**
 * 동기 함수의 에러 무시
 */
export function ignoreErrorSync<T>(
  fn: () => T,
  context: Partial<ErrorContext>,
  options?: { logLevel?: 'none' | 'warn' | 'error' },
): T | undefined {
  const logLevel = options?.logLevel ?? 'warn';

  try {
    return fn();
  } catch (error) {
    if (logLevel !== 'none') {
      const poError = POError.from(error, context);
      if (logLevel === 'error') {
        console.error('[ignoreErrorSync]', poError.toShortString());
      } else {
        console.warn('[ignoreErrorSync]', poError.toShortString());
      }
    }
    return undefined;
  }
}

/**
 * 다중 작업 실행 (하나가 실패해도 나머지 계속)
 *
 * @example
 * ```typescript
 * const results = await executeAll([
 *   () => saveToDb(data),
 *   () => sendNotification(data),
 *   () => updateCache(data),
 * ], { module: 'background', function: 'processData' });
 *
 * console.log(`성공: ${results.successes.length}, 실패: ${results.failures.length}`);
 * ```
 */
export async function executeAll<T>(
  tasks: Array<() => Promise<T>>,
  context: Partial<ErrorContext>,
): Promise<{
  results: Result<T>[];
  successes: T[];
  failures: POError[];
}> {
  const results: Result<T>[] = [];
  const successes: T[] = [];
  const failures: POError[] = [];

  for (let i = 0; i < tasks.length; i++) {
    const result = await tryCatchAsync(tasks[i], {
      ...context,
      extra: { ...context.extra, taskIndex: i },
    });

    results.push(result);
    if (result.success) {
      successes.push(result.data);
    } else {
      failures.push(result.error);
    }
  }

  return { results, successes, failures };
}
