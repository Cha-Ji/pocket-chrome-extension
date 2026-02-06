import { describe, it, expect } from 'vitest';
import { POError, Errors, ErrorContext } from '../po-error';
import { ErrorCode, ErrorSeverity } from '../error-codes';

describe('POError', () => {
  describe('constructor', () => {
    it('should create error with code and message', () => {
      const error = new POError({
        code: ErrorCode.TRADE_EXECUTION_FAILED,
        message: 'CALL 버튼을 찾을 수 없습니다',
      });

      expect(error.code).toBe(ErrorCode.TRADE_EXECUTION_FAILED);
      expect(error.message).toBe('CALL 버튼을 찾을 수 없습니다');
      expect(error.name).toBe('POError');
    });

    it('should use default message from ERROR_MESSAGES', () => {
      const error = new POError({
        code: ErrorCode.NETWORK_TIMEOUT,
      });

      expect(error.message).toBe('네트워크 요청 시간 초과');
    });

    it('should set severity from ERROR_SEVERITY_MAP', () => {
      const tradingError = new POError({
        code: ErrorCode.TRADE_NOT_DEMO,
      });
      expect(tradingError.severity).toBe(ErrorSeverity.CRITICAL);

      const infoError = new POError({
        code: ErrorCode.DB_NOT_FOUND,
      });
      expect(infoError.severity).toBe(ErrorSeverity.INFO);
    });

    it('should allow custom severity override', () => {
      const error = new POError({
        code: ErrorCode.DB_NOT_FOUND,
        severity: ErrorSeverity.CRITICAL,
      });

      expect(error.severity).toBe(ErrorSeverity.CRITICAL);
    });

    it('should set context with defaults', () => {
      const error = new POError({
        code: ErrorCode.UNKNOWN,
        context: { module: 'background', function: 'handleMessage' },
      });

      expect(error.context.module).toBe('background');
      expect(error.context.function).toBe('handleMessage');
      expect(error.context.path).toEqual([]);
      expect(error.context.timestamp).toBeDefined();
    });

    it('should capture cause error', () => {
      const originalError = new Error('Original error');
      const error = new POError({
        code: ErrorCode.DB_WRITE_FAILED,
        cause: originalError,
      });

      expect(error.cause).toBe(originalError);
    });
  });

  describe('addPath', () => {
    it('should add location to path', () => {
      const error = new POError({
        code: ErrorCode.UNKNOWN,
        context: { module: 'content-script', function: 'executeTrade' },
      });

      error.addPath('background.handleTradeRequest');
      error.addPath('side-panel.onTradeComplete');

      expect(error.context.path).toEqual([
        'background.handleTradeRequest',
        'side-panel.onTradeComplete',
      ]);
    });

    it('should support chaining', () => {
      const error = new POError({ code: ErrorCode.UNKNOWN });

      const result = error.addPath('a').addPath('b').addPath('c');

      expect(result).toBe(error);
      expect(error.context.path).toEqual(['a', 'b', 'c']);
    });
  });

  describe('setExtra', () => {
    it('should set extra context', () => {
      const error = new POError({ code: ErrorCode.DOM_ELEMENT_NOT_FOUND });

      error.setExtra({ selector: '.call-btn', attempt: 3 });

      expect(error.context.extra).toEqual({ selector: '.call-btn', attempt: 3 });
    });

    it('should merge with existing extra', () => {
      const error = new POError({
        code: ErrorCode.UNKNOWN,
        context: { extra: { existing: 'value' } },
      });

      error.setExtra({ newKey: 'newValue' });

      expect(error.context.extra).toEqual({
        existing: 'value',
        newKey: 'newValue',
      });
    });
  });

  describe('toReadableString', () => {
    it('should format error for console output', () => {
      const error = new POError({
        code: ErrorCode.TRADE_EXECUTION_FAILED,
        message: 'CALL 버튼 클릭 실패',
        context: {
          module: 'content-script',
          function: 'executeTrade',
          extra: { direction: 'CALL' },
        },
      });

      const output = error.toReadableString();

      expect(output).toContain('TRADE_EXECUTION_FAILED');
      expect(output).toContain('CALL 버튼 클릭 실패');
      expect(output).toContain('content-script');
      expect(output).toContain('executeTrade');
      expect(output).toContain('direction');
    });

    it('should include path when present', () => {
      const error = new POError({ code: ErrorCode.UNKNOWN });
      error.addPath('a').addPath('b');

      const output = error.toReadableString();

      expect(output).toContain('a → b');
    });

    it('should include cause when present', () => {
      const cause = new Error('Original error');
      const error = new POError({
        code: ErrorCode.DB_WRITE_FAILED,
        cause,
      });

      const output = error.toReadableString();

      expect(output).toContain('Caused by: Original error');
    });
  });

  describe('toShortString', () => {
    it('should format error in one line', () => {
      const error = new POError({
        code: ErrorCode.TRADE_EXECUTION_FAILED,
        message: '거래 실패',
        context: { module: 'content-script', function: 'executeTrade' },
      });

      const output = error.toShortString();

      expect(output).toBe(
        '[TRADE_EXECUTION_FAILED] 거래 실패 @ content-script.executeTrade'
      );
    });

    it('should include path in short string', () => {
      const error = new POError({
        code: ErrorCode.UNKNOWN,
        message: 'test',
        context: { module: 'lib', function: 'test' },
      });
      error.addPath('a').addPath('b');

      const output = error.toShortString();

      expect(output).toContain('(a→b)');
    });
  });

  describe('toJSON / fromJSON', () => {
    it('should serialize to JSON', () => {
      const error = new POError({
        code: ErrorCode.TRADE_NOT_DEMO,
        message: '데모 모드가 아닙니다',
        context: {
          module: 'content-script',
          function: 'executeTrade',
          extra: { accountType: 'REAL' },
        },
      });

      const json = error.toJSON();

      expect(json.name).toBe('POError');
      expect(json.code).toBe(ErrorCode.TRADE_NOT_DEMO);
      expect(json.message).toBe('데모 모드가 아닙니다');
      expect(json.context.module).toBe('content-script');
    });

    it('should deserialize from JSON', () => {
      const original = new POError({
        code: ErrorCode.DB_WRITE_FAILED,
        message: 'DB 저장 실패',
        context: { module: 'lib/db', function: 'addTick' },
      });
      original.addPath('background.storeTick');

      const json = original.toJSON();
      const restored = POError.fromJSON(json);

      expect(restored.code).toBe(original.code);
      expect(restored.message).toBe(original.message);
      expect(restored.context.path).toEqual(['background.storeTick']);
    });
  });

  describe('POError.from', () => {
    it('should return same POError if already POError', () => {
      const original = new POError({ code: ErrorCode.UNKNOWN });
      const result = POError.from(original);

      expect(result).toBe(original);
    });

    it('should wrap Error in POError', () => {
      const original = new Error('Original error');
      const result = POError.from(original, { module: 'lib', function: 'test' });

      expect(result).toBeInstanceOf(POError);
      expect(result.message).toBe('Original error');
      expect(result.cause).toBe(original);
      expect(result.context.module).toBe('lib');
    });

    it('should wrap string in POError', () => {
      const result = POError.from('Something went wrong');

      expect(result).toBeInstanceOf(POError);
      expect(result.message).toBe('Something went wrong');
      expect(result.code).toBe(ErrorCode.UNKNOWN);
    });

    it('should use provided code', () => {
      const result = POError.from(
        new Error('test'),
        undefined,
        ErrorCode.NETWORK_TIMEOUT
      );

      expect(result.code).toBe(ErrorCode.NETWORK_TIMEOUT);
    });
  });

  describe('is / isGroup / isSeverityAtLeast', () => {
    it('should check error code', () => {
      const error = new POError({ code: ErrorCode.TRADE_NOT_DEMO });

      expect(error.is(ErrorCode.TRADE_NOT_DEMO)).toBe(true);
      expect(error.is(ErrorCode.UNKNOWN)).toBe(false);
    });

    it('should check error code group', () => {
      const error = new POError({ code: ErrorCode.TRADE_EXECUTION_FAILED });

      expect(error.isGroup('TRADE_')).toBe(true);
      expect(error.isGroup('DB_')).toBe(false);
    });

    it('should check severity level', () => {
      const criticalError = new POError({ code: ErrorCode.TRADE_NOT_DEMO });
      const infoError = new POError({ code: ErrorCode.DB_NOT_FOUND });

      expect(criticalError.isSeverityAtLeast(ErrorSeverity.ERROR)).toBe(true);
      expect(criticalError.isSeverityAtLeast(ErrorSeverity.CRITICAL)).toBe(true);
      expect(infoError.isSeverityAtLeast(ErrorSeverity.ERROR)).toBe(false);
      expect(infoError.isSeverityAtLeast(ErrorSeverity.INFO)).toBe(true);
    });
  });
});

describe('Errors helpers', () => {
  it('should create network error', () => {
    const error = Errors.network('Connection failed', { module: 'lib', function: 'fetch' });

    expect(error.code).toBe(ErrorCode.NETWORK_REQUEST_FAILED);
    expect(error.message).toBe('Connection failed');
  });

  it('should create trade error with CRITICAL severity', () => {
    const error = Errors.trade(
      ErrorCode.TRADE_EXECUTION_FAILED,
      'Trade failed',
      { module: 'content-script', function: 'executeTrade' }
    );

    expect(error.severity).toBe(ErrorSeverity.CRITICAL);
  });

  it('should create DOM error with selector in extra', () => {
    const error = Errors.dom('Button not found', '.call-btn');

    expect(error.code).toBe(ErrorCode.DOM_ELEMENT_NOT_FOUND);
    expect(error.context.extra?.selector).toBe('.call-btn');
  });

  it('should create validation error with field in extra', () => {
    const error = Errors.validation('Required field', 'username');

    expect(error.code).toBe(ErrorCode.VALIDATION_REQUIRED);
    expect(error.context.extra?.field).toBe('username');
  });
});
