/**
 * Error Handling Module
 *
 * POError - 프로젝트 전용 커스텀 에러 클래스
 * Result - 성공/실패를 명시적으로 표현하는 타입
 * errorHandler - 중앙 집중식 에러 처리 서비스
 *
 * @example
 * ```typescript
 * import {
 *   POError,
 *   ErrorCode,
 *   Result,
 *   errorHandler,
 *   tryCatchAsync,
 *   assertDefined,
 * } from '@/lib/errors';
 *
 * // 에러 생성
 * throw new POError({
 *   code: ErrorCode.TRADE_EXECUTION_FAILED,
 *   message: 'CALL 버튼을 찾을 수 없습니다',
 *   context: { module: 'content-script', function: 'executeTrade' }
 * });
 *
 * // Result 사용
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
 *
 * // 에러 히스토리/통계
 * const stats = errorHandler.getStats();
 * const history = errorHandler.getHistory(10);
 * ```
 *
 * @module errors
 */

// Error codes and severity
export {
  ErrorCode,
  ErrorSeverity,
  ERROR_SEVERITY_MAP,
  ERROR_MESSAGES,
} from './error-codes';

// POError class
export {
  POError,
  Errors,
  type ErrorModule,
  type ErrorContext,
  type POErrorOptions,
  type SerializedPOError,
} from './po-error';

// Result type
export {
  Result,
  type Success,
  type Failure,
  type AsyncResult,
} from './result';

// Error handler
export {
  errorHandler,
  createErrorHandler,
  type ErrorLogEntry,
  type ErrorStats,
  type ErrorListener,
  type ErrorHandlerConfig,
} from './handler';

// Utility functions
export {
  tryCatchAsync,
  tryCatch,
  assertDefined,
  assert,
  queryElement,
  queryElementSafe,
  retry,
  sleep,
  withTimeout,
  rethrowWithPath,
  ignoreError,
  ignoreErrorSync,
  executeAll,
} from './utils';
