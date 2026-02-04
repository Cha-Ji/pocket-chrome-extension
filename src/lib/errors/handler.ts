import { POError, ErrorContext, SerializedPOError } from './po-error';
import { ErrorCode, ErrorSeverity } from './error-codes';

/**
 * 에러 로그 엔트리
 */
export interface ErrorLogEntry {
  /** 고유 ID */
  id: string;
  /** 에러 정보 */
  error: SerializedPOError;
  /** 로깅 시각 */
  timestamp: number;
  /** 처리 여부 */
  handled: boolean;
}

/**
 * 에러 통계
 */
export interface ErrorStats {
  /** 총 에러 수 */
  total: number;
  /** 코드별 에러 수 */
  byCode: Record<string, number>;
  /** 모듈별 에러 수 */
  byModule: Record<string, number>;
  /** 심각도별 에러 수 */
  bySeverity: Record<ErrorSeverity, number>;
  /** 최근 에러 발생 시각 */
  lastErrorAt?: number;
}

/**
 * 에러 리스너 타입
 */
export type ErrorListener = (error: POError, entry: ErrorLogEntry) => void;

/**
 * ErrorHandler 설정
 */
export interface ErrorHandlerConfig {
  /** 최대 히스토리 크기 */
  maxHistory: number;
  /** 콘솔 로깅 활성화 */
  consoleLogging: boolean;
  /** 최소 로깅 심각도 */
  minLogSeverity: ErrorSeverity;
}

const DEFAULT_CONFIG: ErrorHandlerConfig = {
  maxHistory: 100,
  consoleLogging: true,
  minLogSeverity: ErrorSeverity.INFO,
};

/**
 * 중앙 에러 핸들러
 *
 * 모든 에러를 통합 관리하고 로깅, 통계, 알림을 처리
 *
 * @example
 * ```typescript
 * // 에러 처리
 * try {
 *   await riskyOperation();
 * } catch (e) {
 *   errorHandler.handle(e, { module: 'background', function: 'riskyOperation' });
 * }
 *
 * // 리스너 등록
 * errorHandler.onError((error) => {
 *   if (error.isSeverityAtLeast(ErrorSeverity.CRITICAL)) {
 *     telegramService.notifyError(error.message);
 *   }
 * });
 *
 * // 통계 조회
 * const stats = errorHandler.getStats();
 * console.log(`Total errors: ${stats.total}`);
 * ```
 */
class ErrorHandler {
  private history: ErrorLogEntry[] = [];
  private listeners: ErrorListener[] = [];
  private config: ErrorHandlerConfig;

  constructor(config: Partial<ErrorHandlerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 에러 처리
   * unknown 타입의 에러를 POError로 정규화하고 로깅
   */
  handle(
    error: unknown,
    context?: Partial<ErrorContext>,
    code?: ErrorCode
  ): POError {
    const poError = this.normalize(error, context, code);
    const entry = this.log(poError);
    this.notify(poError, entry);
    return poError;
  }

  /**
   * POError를 직접 로깅 (이미 POError인 경우)
   */
  logError(error: POError): ErrorLogEntry {
    const entry = this.log(error);
    this.notify(error, entry);
    return entry;
  }

  /**
   * 에러를 POError로 정규화
   */
  normalize(
    error: unknown,
    context?: Partial<ErrorContext>,
    code?: ErrorCode
  ): POError {
    return POError.from(error, context, code);
  }

  /**
   * 에러 로깅
   */
  private log(error: POError): ErrorLogEntry {
    const entry: ErrorLogEntry = {
      id: this.generateId(),
      error: error.toJSON(),
      timestamp: Date.now(),
      handled: true,
    };

    // 히스토리에 추가
    this.history.unshift(entry);
    if (this.history.length > this.config.maxHistory) {
      this.history.pop();
    }

    // 콘솔 로깅
    if (this.config.consoleLogging && this.shouldLog(error.severity)) {
      this.logToConsole(error);
    }

    return entry;
  }

  /**
   * 콘솔에 로깅
   */
  private logToConsole(error: POError): void {
    const prefix = `[POError:${error.code}]`;

    switch (error.severity) {
      case ErrorSeverity.INFO:
        console.info(prefix, error.toShortString());
        break;
      case ErrorSeverity.WARNING:
        console.warn(prefix, error.toShortString());
        break;
      case ErrorSeverity.ERROR:
        console.error(prefix, error.toReadableString());
        break;
      case ErrorSeverity.CRITICAL:
        console.error('🚨 CRITICAL ERROR 🚨');
        console.error(error.toReadableString());
        break;
    }
  }

  /**
   * 심각도에 따라 로깅 여부 결정
   */
  private shouldLog(severity: ErrorSeverity): boolean {
    const order: ErrorSeverity[] = [
      ErrorSeverity.INFO,
      ErrorSeverity.WARNING,
      ErrorSeverity.ERROR,
      ErrorSeverity.CRITICAL,
    ];
    return (
      order.indexOf(severity) >= order.indexOf(this.config.minLogSeverity)
    );
  }

  /**
   * 리스너들에게 에러 알림
   */
  private notify(error: POError, entry: ErrorLogEntry): void {
    for (const listener of this.listeners) {
      try {
        listener(error, entry);
      } catch (e) {
        // 리스너 에러는 무시 (무한 루프 방지)
        console.error('[ErrorHandler] Listener error:', e);
      }
    }
  }

  /**
   * 고유 ID 생성
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * 에러 리스너 등록
   * @returns 리스너 해제 함수
   */
  onError(listener: ErrorListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * 에러 히스토리 조회
   */
  getHistory(limit?: number): ErrorLogEntry[] {
    if (limit) {
      return this.history.slice(0, limit);
    }
    return [...this.history];
  }

  /**
   * 특정 코드의 에러만 조회
   */
  getHistoryByCode(code: ErrorCode, limit?: number): ErrorLogEntry[] {
    const filtered = this.history.filter((entry) => entry.error.code === code);
    if (limit) {
      return filtered.slice(0, limit);
    }
    return filtered;
  }

  /**
   * 특정 모듈의 에러만 조회
   */
  getHistoryByModule(module: string, limit?: number): ErrorLogEntry[] {
    const filtered = this.history.filter(
      (entry) => entry.error.context.module === module
    );
    if (limit) {
      return filtered.slice(0, limit);
    }
    return filtered;
  }

  /**
   * 에러 통계 조회
   */
  getStats(): ErrorStats {
    const stats: ErrorStats = {
      total: this.history.length,
      byCode: {},
      byModule: {},
      bySeverity: {
        [ErrorSeverity.INFO]: 0,
        [ErrorSeverity.WARNING]: 0,
        [ErrorSeverity.ERROR]: 0,
        [ErrorSeverity.CRITICAL]: 0,
      },
      lastErrorAt: this.history[0]?.timestamp,
    };

    for (const entry of this.history) {
      const { code, severity, context } = entry.error;

      // 코드별 카운트
      stats.byCode[code] = (stats.byCode[code] || 0) + 1;

      // 모듈별 카운트
      stats.byModule[context.module] = (stats.byModule[context.module] || 0) + 1;

      // 심각도별 카운트
      stats.bySeverity[severity]++;
    }

    return stats;
  }

  /**
   * 히스토리 초기화
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * 설정 변경
   */
  configure(config: Partial<ErrorHandlerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 현재 설정 조회
   */
  getConfig(): ErrorHandlerConfig {
    return { ...this.config };
  }
}

/**
 * 전역 에러 핸들러 인스턴스
 */
export const errorHandler = new ErrorHandler();

/**
 * 새로운 ErrorHandler 인스턴스 생성 (테스트용)
 */
export const createErrorHandler = (
  config?: Partial<ErrorHandlerConfig>
): ErrorHandler => new ErrorHandler(config);
