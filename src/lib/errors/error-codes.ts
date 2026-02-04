/**
 * Error codes for POError
 * 에러 타입을 분류하여 프로그래밍적 처리와 디버깅을 용이하게 함
 */
export enum ErrorCode {
  // ============================================
  // Network Errors (1xx)
  // ============================================
  NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
  NETWORK_OFFLINE = 'NETWORK_OFFLINE',
  NETWORK_REQUEST_FAILED = 'NETWORK_REQUEST_FAILED',

  // ============================================
  // Database Errors (2xx)
  // ============================================
  DB_READ_FAILED = 'DB_READ_FAILED',
  DB_WRITE_FAILED = 'DB_WRITE_FAILED',
  DB_DELETE_FAILED = 'DB_DELETE_FAILED',
  DB_NOT_FOUND = 'DB_NOT_FOUND',
  DB_CONSTRAINT_VIOLATION = 'DB_CONSTRAINT_VIOLATION',

  // ============================================
  // Trading Errors (3xx)
  // ============================================
  TRADE_NOT_DEMO = 'TRADE_NOT_DEMO',
  TRADE_EXECUTION_FAILED = 'TRADE_EXECUTION_FAILED',
  TRADE_VALIDATION_FAILED = 'TRADE_VALIDATION_FAILED',
  TRADE_INSUFFICIENT_BALANCE = 'TRADE_INSUFFICIENT_BALANCE',
  TRADE_MARKET_CLOSED = 'TRADE_MARKET_CLOSED',
  TRADE_BUTTON_NOT_FOUND = 'TRADE_BUTTON_NOT_FOUND',

  // ============================================
  // DOM Errors (4xx)
  // ============================================
  DOM_ELEMENT_NOT_FOUND = 'DOM_ELEMENT_NOT_FOUND',
  DOM_SELECTOR_INVALID = 'DOM_SELECTOR_INVALID',
  DOM_MUTATION_FAILED = 'DOM_MUTATION_FAILED',
  DOM_PARSE_FAILED = 'DOM_PARSE_FAILED',

  // ============================================
  // Validation Errors (5xx)
  // ============================================
  VALIDATION_REQUIRED = 'VALIDATION_REQUIRED',
  VALIDATION_TYPE = 'VALIDATION_TYPE',
  VALIDATION_RANGE = 'VALIDATION_RANGE',
  VALIDATION_FORMAT = 'VALIDATION_FORMAT',

  // ============================================
  // Message/Communication Errors (6xx)
  // ============================================
  MSG_SEND_FAILED = 'MSG_SEND_FAILED',
  MSG_RECEIVE_FAILED = 'MSG_RECEIVE_FAILED',
  MSG_INVALID_TYPE = 'MSG_INVALID_TYPE',
  MSG_TIMEOUT = 'MSG_TIMEOUT',
  MSG_NO_RECEIVER = 'MSG_NO_RECEIVER',

  // ============================================
  // Strategy/Indicator Errors (7xx)
  // ============================================
  STRATEGY_NOT_FOUND = 'STRATEGY_NOT_FOUND',
  STRATEGY_INVALID_CONFIG = 'STRATEGY_INVALID_CONFIG',
  INDICATOR_CALCULATION_FAILED = 'INDICATOR_CALCULATION_FAILED',
  INDICATOR_INSUFFICIENT_DATA = 'INDICATOR_INSUFFICIENT_DATA',

  // ============================================
  // WebSocket Errors (8xx)
  // ============================================
  WS_CONNECTION_FAILED = 'WS_CONNECTION_FAILED',
  WS_DISCONNECTED = 'WS_DISCONNECTED',
  WS_MESSAGE_PARSE_FAILED = 'WS_MESSAGE_PARSE_FAILED',

  // ============================================
  // Unknown/Generic Errors (9xx)
  // ============================================
  UNKNOWN = 'UNKNOWN',
  INTERNAL = 'INTERNAL',
}

/**
 * 에러 코드의 심각도 레벨
 */
export enum ErrorSeverity {
  /** 정보성 - 로깅만 */
  INFO = 'INFO',
  /** 경고 - 주의 필요 */
  WARNING = 'WARNING',
  /** 에러 - 기능 실패 */
  ERROR = 'ERROR',
  /** 치명적 - 즉시 조치 필요 */
  CRITICAL = 'CRITICAL',
}

/**
 * 에러 코드별 기본 심각도 매핑
 */
export const ERROR_SEVERITY_MAP: Record<ErrorCode, ErrorSeverity> = {
  // Network
  [ErrorCode.NETWORK_TIMEOUT]: ErrorSeverity.WARNING,
  [ErrorCode.NETWORK_OFFLINE]: ErrorSeverity.ERROR,
  [ErrorCode.NETWORK_REQUEST_FAILED]: ErrorSeverity.WARNING,

  // Database
  [ErrorCode.DB_READ_FAILED]: ErrorSeverity.ERROR,
  [ErrorCode.DB_WRITE_FAILED]: ErrorSeverity.ERROR,
  [ErrorCode.DB_DELETE_FAILED]: ErrorSeverity.ERROR,
  [ErrorCode.DB_NOT_FOUND]: ErrorSeverity.INFO,
  [ErrorCode.DB_CONSTRAINT_VIOLATION]: ErrorSeverity.ERROR,

  // Trading - 거래 관련은 대부분 CRITICAL
  [ErrorCode.TRADE_NOT_DEMO]: ErrorSeverity.CRITICAL,
  [ErrorCode.TRADE_EXECUTION_FAILED]: ErrorSeverity.CRITICAL,
  [ErrorCode.TRADE_VALIDATION_FAILED]: ErrorSeverity.ERROR,
  [ErrorCode.TRADE_INSUFFICIENT_BALANCE]: ErrorSeverity.WARNING,
  [ErrorCode.TRADE_MARKET_CLOSED]: ErrorSeverity.INFO,
  [ErrorCode.TRADE_BUTTON_NOT_FOUND]: ErrorSeverity.CRITICAL,

  // DOM
  [ErrorCode.DOM_ELEMENT_NOT_FOUND]: ErrorSeverity.WARNING,
  [ErrorCode.DOM_SELECTOR_INVALID]: ErrorSeverity.ERROR,
  [ErrorCode.DOM_MUTATION_FAILED]: ErrorSeverity.ERROR,
  [ErrorCode.DOM_PARSE_FAILED]: ErrorSeverity.WARNING,

  // Validation
  [ErrorCode.VALIDATION_REQUIRED]: ErrorSeverity.ERROR,
  [ErrorCode.VALIDATION_TYPE]: ErrorSeverity.ERROR,
  [ErrorCode.VALIDATION_RANGE]: ErrorSeverity.ERROR,
  [ErrorCode.VALIDATION_FORMAT]: ErrorSeverity.ERROR,

  // Message
  [ErrorCode.MSG_SEND_FAILED]: ErrorSeverity.WARNING,
  [ErrorCode.MSG_RECEIVE_FAILED]: ErrorSeverity.WARNING,
  [ErrorCode.MSG_INVALID_TYPE]: ErrorSeverity.ERROR,
  [ErrorCode.MSG_TIMEOUT]: ErrorSeverity.WARNING,
  [ErrorCode.MSG_NO_RECEIVER]: ErrorSeverity.INFO,

  // Strategy
  [ErrorCode.STRATEGY_NOT_FOUND]: ErrorSeverity.ERROR,
  [ErrorCode.STRATEGY_INVALID_CONFIG]: ErrorSeverity.ERROR,
  [ErrorCode.INDICATOR_CALCULATION_FAILED]: ErrorSeverity.WARNING,
  [ErrorCode.INDICATOR_INSUFFICIENT_DATA]: ErrorSeverity.INFO,

  // WebSocket
  [ErrorCode.WS_CONNECTION_FAILED]: ErrorSeverity.ERROR,
  [ErrorCode.WS_DISCONNECTED]: ErrorSeverity.WARNING,
  [ErrorCode.WS_MESSAGE_PARSE_FAILED]: ErrorSeverity.WARNING,

  // Unknown
  [ErrorCode.UNKNOWN]: ErrorSeverity.ERROR,
  [ErrorCode.INTERNAL]: ErrorSeverity.ERROR,
};

/**
 * 에러 코드별 사용자 친화적 메시지
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  // Network
  [ErrorCode.NETWORK_TIMEOUT]: '네트워크 요청 시간 초과',
  [ErrorCode.NETWORK_OFFLINE]: '네트워크 연결 끊김',
  [ErrorCode.NETWORK_REQUEST_FAILED]: '네트워크 요청 실패',

  // Database
  [ErrorCode.DB_READ_FAILED]: '데이터베이스 읽기 실패',
  [ErrorCode.DB_WRITE_FAILED]: '데이터베이스 쓰기 실패',
  [ErrorCode.DB_DELETE_FAILED]: '데이터베이스 삭제 실패',
  [ErrorCode.DB_NOT_FOUND]: '데이터를 찾을 수 없음',
  [ErrorCode.DB_CONSTRAINT_VIOLATION]: '데이터베이스 제약 조건 위반',

  // Trading
  [ErrorCode.TRADE_NOT_DEMO]: '데모 모드가 아닙니다 - 실제 거래 차단됨',
  [ErrorCode.TRADE_EXECUTION_FAILED]: '거래 실행 실패',
  [ErrorCode.TRADE_VALIDATION_FAILED]: '거래 유효성 검사 실패',
  [ErrorCode.TRADE_INSUFFICIENT_BALANCE]: '잔액 부족',
  [ErrorCode.TRADE_MARKET_CLOSED]: '시장 마감',
  [ErrorCode.TRADE_BUTTON_NOT_FOUND]: '거래 버튼을 찾을 수 없음',

  // DOM
  [ErrorCode.DOM_ELEMENT_NOT_FOUND]: 'DOM 요소를 찾을 수 없음',
  [ErrorCode.DOM_SELECTOR_INVALID]: '잘못된 DOM 선택자',
  [ErrorCode.DOM_MUTATION_FAILED]: 'DOM 변경 실패',
  [ErrorCode.DOM_PARSE_FAILED]: 'DOM 파싱 실패',

  // Validation
  [ErrorCode.VALIDATION_REQUIRED]: '필수 값이 없음',
  [ErrorCode.VALIDATION_TYPE]: '잘못된 타입',
  [ErrorCode.VALIDATION_RANGE]: '범위를 벗어남',
  [ErrorCode.VALIDATION_FORMAT]: '잘못된 형식',

  // Message
  [ErrorCode.MSG_SEND_FAILED]: '메시지 전송 실패',
  [ErrorCode.MSG_RECEIVE_FAILED]: '메시지 수신 실패',
  [ErrorCode.MSG_INVALID_TYPE]: '잘못된 메시지 타입',
  [ErrorCode.MSG_TIMEOUT]: '메시지 응답 시간 초과',
  [ErrorCode.MSG_NO_RECEIVER]: '메시지 수신자 없음',

  // Strategy
  [ErrorCode.STRATEGY_NOT_FOUND]: '전략을 찾을 수 없음',
  [ErrorCode.STRATEGY_INVALID_CONFIG]: '잘못된 전략 설정',
  [ErrorCode.INDICATOR_CALCULATION_FAILED]: '지표 계산 실패',
  [ErrorCode.INDICATOR_INSUFFICIENT_DATA]: '지표 계산을 위한 데이터 부족',

  // WebSocket
  [ErrorCode.WS_CONNECTION_FAILED]: 'WebSocket 연결 실패',
  [ErrorCode.WS_DISCONNECTED]: 'WebSocket 연결 끊김',
  [ErrorCode.WS_MESSAGE_PARSE_FAILED]: 'WebSocket 메시지 파싱 실패',

  // Unknown
  [ErrorCode.UNKNOWN]: '알 수 없는 오류',
  [ErrorCode.INTERNAL]: '내부 오류',
};
