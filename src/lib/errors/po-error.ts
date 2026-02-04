import {
  ErrorCode,
  ErrorSeverity,
  ERROR_SEVERITY_MAP,
  ERROR_MESSAGES,
} from './error-codes';

/**
 * 에러 발생 모듈 타입
 */
export type ErrorModule =
  | 'background'
  | 'content-script'
  | 'side-panel'
  | 'lib'
  | 'lib/db'
  | 'lib/indicators'
  | 'lib/backtest'
  | 'lib/signals'
  | 'lib/errors';

/**
 * 에러 컨텍스트 정보
 * 에러가 발생한 위치와 전파 경로를 추적
 */
export interface ErrorContext {
  /** 에러가 발생한 모듈 */
  module: ErrorModule;
  /** 에러가 발생한 함수명 */
  function: string;
  /** 에러 전파 경로 (발생 → 최종 핸들러) */
  path: string[];
  /** 에러 발생 시각 (Unix timestamp) */
  timestamp: number;
  /** 추가 디버그 정보 */
  extra?: Record<string, unknown>;
}

/**
 * POError 생성 옵션
 */
export interface POErrorOptions {
  /** 에러 코드 */
  code: ErrorCode;
  /** 에러 메시지 (없으면 기본 메시지 사용) */
  message?: string;
  /** 에러 컨텍스트 */
  context?: Partial<ErrorContext>;
  /** 원인 에러 (에러 체이닝) */
  cause?: Error;
  /** 심각도 (없으면 코드별 기본값 사용) */
  severity?: ErrorSeverity;
}

/**
 * JSON 직렬화된 POError 형태
 * Chrome Extension 메시지 통신 시 사용
 */
export interface SerializedPOError {
  name: 'POError';
  code: ErrorCode;
  message: string;
  severity: ErrorSeverity;
  context: ErrorContext;
  cause?: string;
  stack?: string;
}

/**
 * Pocket Option 프로젝트 커스텀 에러 클래스
 *
 * 특징:
 * - ErrorCode로 에러 타입 분류
 * - ErrorContext로 발생 위치/경로 추적
 * - cause로 원인 에러 체이닝
 * - JSON 직렬화 지원 (Chrome Extension 메시지 통신)
 *
 * @example
 * ```typescript
 * // 기본 사용
 * throw new POError({
 *   code: ErrorCode.DOM_ELEMENT_NOT_FOUND,
 *   message: 'CALL 버튼을 찾을 수 없습니다',
 *   context: { module: 'content-script', function: 'executeTrade' }
 * });
 *
 * // 에러 체이닝
 * try {
 *   await db.ticks.add(tick);
 * } catch (e) {
 *   throw new POError({
 *     code: ErrorCode.DB_WRITE_FAILED,
 *     context: { module: 'lib/db', function: 'addTick' },
 *     cause: e instanceof Error ? e : new Error(String(e))
 *   });
 * }
 *
 * // 에러 경로 추가
 * catch (e) {
 *   if (e instanceof POError) {
 *     throw e.addPath('background.handleMessage');
 *   }
 *   throw e;
 * }
 * ```
 */
export class POError extends Error {
  readonly code: ErrorCode;
  readonly severity: ErrorSeverity;
  readonly context: ErrorContext;
  override readonly cause?: Error;

  constructor(options: POErrorOptions) {
    const message = options.message ?? ERROR_MESSAGES[options.code];
    super(message);

    this.name = 'POError';
    this.code = options.code;
    this.severity = options.severity ?? ERROR_SEVERITY_MAP[options.code];
    this.cause = options.cause;

    this.context = {
      module: options.context?.module ?? 'lib',
      function: options.context?.function ?? 'unknown',
      path: options.context?.path ?? [],
      timestamp: options.context?.timestamp ?? Date.now(),
      extra: options.context?.extra,
    };

    // V8 엔진에서 스택 트레이스 캡처 (POError 생성자 제외)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, POError);
    }
  }

  /**
   * 에러 전파 경로에 현재 위치 추가
   * catch 블록에서 re-throw 전에 호출
   *
   * @param location - 현재 위치 (예: 'background.handleMessage')
   * @returns this (체이닝 가능)
   */
  addPath(location: string): this {
    this.context.path.push(location);
    return this;
  }

  /**
   * 추가 컨텍스트 정보 설정
   *
   * @param extra - 추가할 정보
   * @returns this (체이닝 가능)
   */
  setExtra(extra: Record<string, unknown>): this {
    this.context.extra = { ...this.context.extra, ...extra };
    return this;
  }

  /**
   * 사람이 읽기 쉬운 형태로 포맷
   * 콘솔 로깅에 적합
   */
  toReadableString(): string {
    const lines = [
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `[${this.severity}] ${this.code}`,
      `Message: ${this.message}`,
      `Module: ${this.context.module}`,
      `Function: ${this.context.function}`,
    ];

    if (this.context.path.length > 0) {
      lines.push(`Path: ${this.context.path.join(' → ')}`);
    }

    lines.push(`Time: ${new Date(this.context.timestamp).toISOString()}`);

    if (this.context.extra) {
      lines.push(`Extra: ${JSON.stringify(this.context.extra, null, 2)}`);
    }

    if (this.cause) {
      lines.push(`Caused by: ${this.cause.message}`);
      if (this.cause.stack) {
        lines.push(`Cause stack:\n${this.cause.stack}`);
      }
    }

    if (this.stack) {
      lines.push(`Stack:\n${this.stack}`);
    }

    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    return lines.join('\n');
  }

  /**
   * 간략한 한 줄 요약
   */
  toShortString(): string {
    const path = this.context.path.length > 0 ? ` (${this.context.path.join('→')})` : '';
    return `[${this.code}] ${this.message} @ ${this.context.module}.${this.context.function}${path}`;
  }

  /**
   * JSON 직렬화
   * Chrome Extension 메시지 통신 시 사용
   */
  toJSON(): SerializedPOError {
    return {
      name: 'POError',
      code: this.code,
      message: this.message,
      severity: this.severity,
      context: this.context,
      cause: this.cause?.message,
      stack: this.stack,
    };
  }

  /**
   * 직렬화된 JSON에서 POError 복원
   */
  static fromJSON(json: SerializedPOError): POError {
    return new POError({
      code: json.code,
      message: json.message,
      severity: json.severity,
      context: json.context,
      cause: json.cause ? new Error(json.cause) : undefined,
    });
  }

  /**
   * unknown 타입의 에러를 POError로 변환
   * catch 블록에서 사용
   */
  static from(
    error: unknown,
    context?: Partial<ErrorContext>,
    code: ErrorCode = ErrorCode.UNKNOWN
  ): POError {
    if (error instanceof POError) {
      // 이미 POError면 컨텍스트만 병합
      if (context) {
        if (context.module) error.context.module = context.module;
        if (context.function) error.context.function = context.function;
        if (context.extra) error.setExtra(context.extra);
      }
      return error;
    }

    if (error instanceof Error) {
      return new POError({
        code,
        message: error.message,
        context,
        cause: error,
      });
    }

    return new POError({
      code,
      message: String(error),
      context,
    });
  }

  /**
   * 특정 ErrorCode인지 확인
   */
  is(code: ErrorCode): boolean {
    return this.code === code;
  }

  /**
   * 특정 ErrorCode 그룹인지 확인 (prefix 매칭)
   */
  isGroup(prefix: string): boolean {
    return this.code.startsWith(prefix);
  }

  /**
   * 특정 심각도 이상인지 확인
   */
  isSeverityAtLeast(severity: ErrorSeverity): boolean {
    const order: ErrorSeverity[] = [
      ErrorSeverity.INFO,
      ErrorSeverity.WARNING,
      ErrorSeverity.ERROR,
      ErrorSeverity.CRITICAL,
    ];
    return order.indexOf(this.severity) >= order.indexOf(severity);
  }
}

/**
 * POError 생성 헬퍼 함수들
 */
export const Errors = {
  /** 네트워크 에러 */
  network: (message: string, context?: Partial<ErrorContext>, cause?: Error) =>
    new POError({ code: ErrorCode.NETWORK_REQUEST_FAILED, message, context, cause }),

  /** DB 에러 */
  db: (code: ErrorCode, message: string, context?: Partial<ErrorContext>, cause?: Error) =>
    new POError({ code, message, context, cause }),

  /** 거래 에러 */
  trade: (code: ErrorCode, message: string, context?: Partial<ErrorContext>) =>
    new POError({ code, message, context, severity: ErrorSeverity.CRITICAL }),

  /** DOM 에러 */
  dom: (message: string, selector?: string, context?: Partial<ErrorContext>) =>
    new POError({
      code: ErrorCode.DOM_ELEMENT_NOT_FOUND,
      message,
      context: { ...context, extra: { ...context?.extra, selector } },
    }),

  /** 검증 에러 */
  validation: (message: string, field?: string, context?: Partial<ErrorContext>) =>
    new POError({
      code: ErrorCode.VALIDATION_REQUIRED,
      message,
      context: { ...context, extra: { ...context?.extra, field } },
    }),

  /** 메시지 통신 에러 */
  message: (code: ErrorCode, message: string, context?: Partial<ErrorContext>) =>
    new POError({ code, message, context }),

  /** 알 수 없는 에러 */
  unknown: (error: unknown, context?: Partial<ErrorContext>) =>
    POError.from(error, context, ErrorCode.UNKNOWN),
};
