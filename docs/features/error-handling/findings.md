# Error Handling Module - Findings

## 현재 상태 분석 (2026-02-04)

### 기존 에러 처리의 문제점

1. **커스텀 에러 클래스 부재**
   - 모든 에러가 `new Error(message)`로 생성됨
   - 에러 타입 구분이 불가능 (네트워크? DB? 검증?)
   - 추가 컨텍스트 정보를 담을 방법이 없음

2. **비일관적인 에러 처리 패턴**
   ```typescript
   // 패턴 1: throw
   throw new Error('Not enough candles')

   // 패턴 2: return { success: false }
   return { success: false, error: message }

   // 패턴 3: console.error만
   console.error('[CandleCollector] Import error:', e)
   ```

3. **에러 경로 추적 불가**
   - 에러가 어디서 발생해서 어디로 전파되었는지 알 수 없음
   - catch에서 re-throw 시 원본 스택 손실

4. **스택 트레이스 정보 부족**
   - 번들링 후 소스맵 없이 디버깅 어려움
   - 함수명, 파일명이 minify되어 추적 불가

---

## 설계 결정

### 1. POError 클래스 설계

```typescript
// src/lib/errors/po-error.ts

export enum ErrorCode {
  // Network errors
  NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
  NETWORK_OFFLINE = 'NETWORK_OFFLINE',

  // Database errors
  DB_READ_FAILED = 'DB_READ_FAILED',
  DB_WRITE_FAILED = 'DB_WRITE_FAILED',
  DB_NOT_FOUND = 'DB_NOT_FOUND',

  // Trading errors
  TRADE_NOT_DEMO = 'TRADE_NOT_DEMO',
  TRADE_EXECUTION_FAILED = 'TRADE_EXECUTION_FAILED',
  TRADE_VALIDATION_FAILED = 'TRADE_VALIDATION_FAILED',

  // DOM errors
  DOM_ELEMENT_NOT_FOUND = 'DOM_ELEMENT_NOT_FOUND',
  DOM_SELECTOR_INVALID = 'DOM_SELECTOR_INVALID',

  // Validation errors
  VALIDATION_REQUIRED = 'VALIDATION_REQUIRED',
  VALIDATION_TYPE = 'VALIDATION_TYPE',
  VALIDATION_RANGE = 'VALIDATION_RANGE',

  // Message errors
  MSG_SEND_FAILED = 'MSG_SEND_FAILED',
  MSG_INVALID_TYPE = 'MSG_INVALID_TYPE',

  // Unknown
  UNKNOWN = 'UNKNOWN',
}

export interface ErrorContext {
  module: 'background' | 'content-script' | 'side-panel' | 'lib';
  function: string;
  path: string[];  // 에러 전파 경로
  timestamp: number;
  extra?: Record<string, unknown>;
}

export class POError extends Error {
  readonly code: ErrorCode;
  readonly context: ErrorContext;
  readonly cause?: Error;

  constructor(
    code: ErrorCode,
    message: string,
    context: Partial<ErrorContext>,
    cause?: Error
  ) {
    super(message);
    this.name = 'POError';
    this.code = code;
    this.cause = cause;
    this.context = {
      module: context.module ?? 'lib',
      function: context.function ?? 'unknown',
      path: context.path ?? [],
      timestamp: Date.now(),
      extra: context.extra,
    };

    // 스택 트레이스 캡처
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, POError);
    }
  }

  // 에러 경로에 현재 위치 추가
  addPath(location: string): POError {
    this.context.path.push(location);
    return this;
  }

  // 사람이 읽기 쉬운 형태로 포맷
  toReadableString(): string {
    const lines = [
      `[${this.code}] ${this.message}`,
      `Module: ${this.context.module}`,
      `Function: ${this.context.function}`,
      `Path: ${this.context.path.join(' → ') || '(origin)'}`,
      `Time: ${new Date(this.context.timestamp).toISOString()}`,
    ];

    if (this.context.extra) {
      lines.push(`Extra: ${JSON.stringify(this.context.extra)}`);
    }

    if (this.cause) {
      lines.push(`Caused by: ${this.cause.message}`);
    }

    return lines.join('\n');
  }

  // JSON 직렬화
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      cause: this.cause?.message,
      stack: this.stack,
    };
  }
}
```

### 2. Result 타입 설계

```typescript
// src/lib/errors/result.ts

export type Result<T, E = POError> =
  | { success: true; data: T }
  | { success: false; error: E };

export const Result = {
  ok: <T>(data: T): Result<T, never> => ({ success: true, data }),
  err: <E>(error: E): Result<never, E> => ({ success: false, error }),

  map: <T, U, E>(result: Result<T, E>, fn: (data: T) => U): Result<U, E> => {
    if (result.success) {
      return Result.ok(fn(result.data));
    }
    return result;
  },

  unwrap: <T, E>(result: Result<T, E>): T => {
    if (result.success) return result.data;
    throw result.error;
  },

  unwrapOr: <T, E>(result: Result<T, E>, defaultValue: T): T => {
    if (result.success) return result.data;
    return defaultValue;
  },
};
```

### 3. 에러 핸들러 설계

```typescript
// src/lib/errors/handler.ts

interface ErrorLogEntry {
  id: string;
  error: POError;
  timestamp: number;
  handled: boolean;
}

class ErrorHandler {
  private history: ErrorLogEntry[] = [];
  private maxHistory = 100;
  private listeners: ((error: POError) => void)[] = [];

  handle(error: unknown, context?: Partial<ErrorContext>): POError {
    const poError = this.normalize(error, context);
    this.log(poError);
    this.notify(poError);
    return poError;
  }

  private normalize(error: unknown, context?: Partial<ErrorContext>): POError {
    if (error instanceof POError) {
      return error;
    }

    if (error instanceof Error) {
      return new POError(
        ErrorCode.UNKNOWN,
        error.message,
        context ?? {},
        error
      );
    }

    return new POError(
      ErrorCode.UNKNOWN,
      String(error),
      context ?? {}
    );
  }

  private log(error: POError): void {
    const entry: ErrorLogEntry = {
      id: crypto.randomUUID(),
      error,
      timestamp: Date.now(),
      handled: true,
    };

    this.history.unshift(entry);
    if (this.history.length > this.maxHistory) {
      this.history.pop();
    }

    console.error(error.toReadableString());
  }

  private notify(error: POError): void {
    this.listeners.forEach(fn => fn(error));
  }

  onError(fn: (error: POError) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  getHistory(): ErrorLogEntry[] {
    return [...this.history];
  }
}

export const errorHandler = new ErrorHandler();
```

### 4. 유틸리티 함수

```typescript
// src/lib/errors/utils.ts

/**
 * 비동기 함수를 Result로 래핑
 */
export async function tryCatchAsync<T>(
  fn: () => Promise<T>,
  context: Partial<ErrorContext>
): Promise<Result<T>> {
  try {
    const data = await fn();
    return Result.ok(data);
  } catch (error) {
    const poError = errorHandler.handle(error, context);
    return Result.err(poError);
  }
}

/**
 * 동기 함수를 Result로 래핑
 */
export function tryCatch<T>(
  fn: () => T,
  context: Partial<ErrorContext>
): Result<T> {
  try {
    const data = fn();
    return Result.ok(data);
  } catch (error) {
    const poError = errorHandler.handle(error, context);
    return Result.err(poError);
  }
}

/**
 * null/undefined 체크
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message: string,
  context: Partial<ErrorContext>
): asserts value is T {
  if (value === null || value === undefined) {
    throw new POError(
      ErrorCode.VALIDATION_REQUIRED,
      message,
      context
    );
  }
}
```

---

## 참고한 패턴/라이브러리

### 1. TypeScript Error Cause (ES2022)
```typescript
throw new Error('High-level error', { cause: originalError });
```
- ES2022부터 표준 지원
- 에러 체이닝의 표준 방식

### 2. neverthrow 라이브러리
- Rust의 Result 타입을 TypeScript로 구현
- 참고 URL: https://github.com/supermacro/neverthrow

### 3. Sentry의 에러 컨텍스트 패턴
- scope, breadcrumbs, tags, extra 개념 참고
- 에러 발생 전 사용자 행동 추적

---

## 제약사항

1. **Chrome Extension 환경**
   - background ↔ content-script 간 에러 직렬화 필요
   - `chrome.runtime.sendMessage`는 JSON만 전송 가능
   - POError.toJSON() 사용 필수

2. **번들 크기**
   - 외부 라이브러리 사용 최소화
   - 자체 구현 우선

3. **기존 코드 호환성**
   - 점진적 마이그레이션 지원
   - `{ success: boolean; error?: string }` 패턴과 공존

---

## 파일 구조

```
src/lib/errors/
├── index.ts          # 모든 export 통합
├── po-error.ts       # POError 클래스
├── error-codes.ts    # ErrorCode enum
├── result.ts         # Result 타입
├── handler.ts        # ErrorHandler 서비스
├── reporter.ts       # 에러 리포팅 (console, telegram, db)
├── recovery.ts       # 재시도/폴백 전략
└── utils.ts          # 유틸리티 함수

src/lib/errors/__tests__/
├── po-error.test.ts
├── result.test.ts
└── handler.test.ts
```
