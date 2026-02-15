// ============================================================
// 거래 금액 검증 유틸리티
// ============================================================
// 거래 실행 전 금액의 유효성을 검증하여 비정상 거래를 방지한다.
// NaN, 음수, 상한 초과, 비유한(Infinity) 등을 차단.
// ============================================================

import { POError, ErrorCode, ErrorSeverity } from '../errors';

/** 금액 검증 설정 */
export interface AmountValidationConfig {
  /** 최소 거래 금액 (기본값: 1) */
  minAmount: number;
  /** 최대 거래 금액 (기본값: 10000) */
  maxAmount: number;
  /** 소수점 이하 허용 자릿수 (기본값: 2) */
  maxDecimalPlaces: number;
}

/** 기본 금액 검증 설정 */
export const DEFAULT_AMOUNT_VALIDATION: AmountValidationConfig = {
  minAmount: 1,
  maxAmount: 10000,
  maxDecimalPlaces: 2,
};

/** 금액 검증 결과 */
export interface AmountValidationResult {
  valid: boolean;
  /** 검증 통과 시 정규화된 금액 (소수점 반올림 적용) */
  normalizedAmount?: number;
  /** 검증 실패 시 사유 */
  reason?: string;
  /** 에러 코드 */
  errorCode?: ErrorCode;
}

/**
 * 거래 금액의 유효성을 검증한다.
 *
 * 검증 항목:
 * 1. undefined/null 체크
 * 2. 숫자 타입 체크
 * 3. NaN 체크
 * 4. Infinity 체크
 * 5. 0 이하 (음수/제로) 체크
 * 6. 최소 금액 미달 체크
 * 7. 최대 금액 초과 체크
 * 8. 소수점 자릿수 정규화
 *
 * @param amount - 검증할 금액
 * @param config - 검증 설정 (선택, 기본값 적용)
 * @returns 검증 결과
 */
export function validateTradeAmount(
  amount: unknown,
  config: Partial<AmountValidationConfig> = {},
): AmountValidationResult {
  const cfg: AmountValidationConfig = { ...DEFAULT_AMOUNT_VALIDATION, ...config };

  // 1. undefined/null 체크
  if (amount === undefined || amount === null) {
    return {
      valid: false,
      reason: '거래 금액이 지정되지 않았습니다 (undefined/null)',
      errorCode: ErrorCode.VALIDATION_REQUIRED,
    };
  }

  // 2. 숫자 타입 체크
  if (typeof amount !== 'number') {
    return {
      valid: false,
      reason: `거래 금액이 숫자가 아닙니다 (타입: ${typeof amount}, 값: ${String(amount)})`,
      errorCode: ErrorCode.VALIDATION_TYPE,
    };
  }

  // 3. NaN 체크
  if (Number.isNaN(amount)) {
    return {
      valid: false,
      reason: '거래 금액이 NaN입니다',
      errorCode: ErrorCode.VALIDATION_TYPE,
    };
  }

  // 4. Infinity 체크
  if (!Number.isFinite(amount)) {
    return {
      valid: false,
      reason: `거래 금액이 유한하지 않습니다 (값: ${amount})`,
      errorCode: ErrorCode.VALIDATION_TYPE,
    };
  }

  // 5. 0 이하 체크
  if (amount <= 0) {
    return {
      valid: false,
      reason: `거래 금액은 0보다 커야 합니다 (값: ${amount})`,
      errorCode: ErrorCode.VALIDATION_RANGE,
    };
  }

  // 6. 최소 금액 미달 체크
  if (amount < cfg.minAmount) {
    return {
      valid: false,
      reason: `거래 금액이 최소 금액(${cfg.minAmount}) 미만입니다 (값: ${amount})`,
      errorCode: ErrorCode.VALIDATION_RANGE,
    };
  }

  // 7. 최대 금액 초과 체크
  if (amount > cfg.maxAmount) {
    return {
      valid: false,
      reason: `거래 금액이 최대 금액(${cfg.maxAmount})을 초과합니다 (값: ${amount})`,
      errorCode: ErrorCode.VALIDATION_RANGE,
    };
  }

  // 8. 소수점 자릿수 정규화 (반올림)
  const factor = Math.pow(10, cfg.maxDecimalPlaces);
  const normalizedAmount = Math.round(amount * factor) / factor;

  return {
    valid: true,
    normalizedAmount,
  };
}

/**
 * 거래 금액을 검증하고, 실패 시 POError를 throw한다.
 * executor 및 auto-trader에서 사용하는 간편 함수.
 *
 * @param amount - 검증할 금액
 * @param context - 에러 컨텍스트 (모듈, 함수명)
 * @param config - 검증 설정 (선택)
 * @returns 정규화된 금액
 * @throws POError - 검증 실패 시
 */
export function assertValidTradeAmount(
  amount: unknown,
  context: { module: string; function: string },
  config: Partial<AmountValidationConfig> = {},
): number {
  const result = validateTradeAmount(amount, config);

  if (!result.valid) {
    throw new POError({
      code: result.errorCode || ErrorCode.TRADE_INVALID_AMOUNT,
      message: result.reason || '거래 금액 검증 실패',
      context: {
        module: context.module as 'content-script' | 'background' | 'side-panel' | 'lib',
        function: context.function,
        extra: { amount, validationConfig: config },
      },
      severity: ErrorSeverity.CRITICAL,
    });
  }

  return result.normalizedAmount!;
}
