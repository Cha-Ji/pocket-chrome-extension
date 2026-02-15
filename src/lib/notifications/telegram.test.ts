import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TelegramService, DEFAULT_TELEGRAM_CONFIG } from './telegram';
import type { TelegramConfig, SignalNotification, TradeNotification } from './telegram';

describe('TelegramService', () => {
  let service: TelegramService;
  const enabledConfig: TelegramConfig = {
    botToken: 'test-bot-token',
    chatId: '12345',
    enabled: true,
    notifySignals: true,
    notifyTrades: true,
    notifyErrors: true,
  };

  beforeEach(() => {
    service = new TelegramService(enabledConfig);
    vi.restoreAllMocks();
  });

  // ============================================================
  // Config management
  // ============================================================
  describe('config', () => {
    it('기본 설정으로 초기화할 수 있다', () => {
      const defaultService = new TelegramService();
      expect(defaultService.getConfig()).toEqual(DEFAULT_TELEGRAM_CONFIG);
    });

    it('커스텀 설정으로 초기화할 수 있다', () => {
      const config = service.getConfig();
      expect(config.botToken).toBe('test-bot-token');
      expect(config.enabled).toBe(true);
    });

    it('updateConfig로 부분 업데이트한다', () => {
      service.updateConfig({ enabled: false });
      expect(service.getConfig().enabled).toBe(false);
      expect(service.getConfig().botToken).toBe('test-bot-token'); // unchanged
    });
  });

  // ============================================================
  // sendMessage
  // ============================================================
  describe('sendMessage', () => {
    it('활성화 상태에서 메시지를 전송한다', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ ok: true }),
      });

      const result = await service.sendMessage('Hello');
      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        `https://api.telegram.org/bottest-bot-token/sendMessage`,
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"chat_id":"12345"'),
        }),
      );
    });

    it('비활성화 상태에서는 전송하지 않는다', async () => {
      service.updateConfig({ enabled: false });
      globalThis.fetch = vi.fn();

      const result = await service.sendMessage('Hello');
      expect(result).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('botToken이 없으면 전송하지 않는다', async () => {
      service.updateConfig({ botToken: '' });
      globalThis.fetch = vi.fn();

      const result = await service.sendMessage('Hello');
      expect(result).toBe(false);
    });

    it('chatId가 없으면 전송하지 않는다', async () => {
      service.updateConfig({ chatId: '' });
      globalThis.fetch = vi.fn();

      const result = await service.sendMessage('Hello');
      expect(result).toBe(false);
    });

    it('API 에러 시 false를 반환한다', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ ok: false, description: 'Bad token' }),
      });

      const result = await service.sendMessage('Hello');
      expect(result).toBe(false);
    });

    it('네트워크 에러 시 false를 반환한다', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network'));

      const result = await service.sendMessage('Hello');
      expect(result).toBe(false);
    });

    it('HTML parse mode로 전송한다', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ ok: true }),
      });

      await service.sendMessage('<b>Bold</b>');
      const body = JSON.parse((fetch as any).mock.calls[0][1].body);
      expect(body.parse_mode).toBe('HTML');
    });
  });

  // ============================================================
  // notifySignal
  // ============================================================
  describe('notifySignal', () => {
    it('CALL 신호를 전송한다', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ ok: true }),
      });

      const signal: SignalNotification = {
        direction: 'CALL',
        ticker: 'BTCUSDT',
        strategy: 'RSI Reversal',
        price: 50000,
        timestamp: 1700000000000,
      };

      await service.notifySignal(signal);
      expect(fetch).toHaveBeenCalled();

      const body = JSON.parse((fetch as any).mock.calls[0][1].body);
      expect(body.text).toContain('CALL');
      expect(body.text).toContain('BTCUSDT');
      expect(body.text).toContain('RSI Reversal');
    });

    it('PUT 신호를 전송한다', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ ok: true }),
      });

      await service.notifySignal({
        direction: 'PUT',
        symbol: 'EURUSD',
        strategy: 'BB',
        entryPrice: 1.0856,
        timestamp: Date.now(),
      });

      const body = JSON.parse((fetch as any).mock.calls[0][1].body);
      expect(body.text).toContain('PUT');
      expect(body.text).toContain('EURUSD');
    });

    it('notifySignals가 false면 전송하지 않는다', async () => {
      service.updateConfig({ notifySignals: false });
      globalThis.fetch = vi.fn();

      await service.notifySignal({
        direction: 'CALL',
        ticker: 'X',
        strategy: 'S',
        timestamp: 1,
      });
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // notifyTrade
  // ============================================================
  describe('notifyTrade', () => {
    it('WIN 결과를 전송한다', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ ok: true }),
      });

      const trade: TradeNotification = {
        result: 'WIN',
        ticker: 'AAPL',
        profit: 10,
        entryPrice: 175,
        exitPrice: 180,
      };

      await service.notifyTrade(trade);

      const body = JSON.parse((fetch as any).mock.calls[0][1].body);
      expect(body.text).toContain('WIN');
      expect(body.text).toContain('AAPL');
      expect(body.text).toContain('$10');
    });

    it('LOSS 결과를 전송한다', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ ok: true }),
      });

      await service.notifyTrade({
        result: 'LOSS',
        ticker: 'GOOG',
        profit: -5,
        entryPrice: 140,
        exitPrice: 135,
      });

      const body = JSON.parse((fetch as any).mock.calls[0][1].body);
      expect(body.text).toContain('LOSS');
    });

    it('notifyTrades가 false면 전송하지 않는다', async () => {
      service.updateConfig({ notifyTrades: false });
      globalThis.fetch = vi.fn();

      await service.notifyTrade({
        result: 'WIN',
        ticker: 'X',
        profit: 1,
        entryPrice: 1,
        exitPrice: 2,
      });
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // notifyError
  // ============================================================
  describe('notifyError', () => {
    it('에러 메시지를 전송한다', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ ok: true }),
      });

      await service.notifyError('Connection lost');

      const body = JSON.parse((fetch as any).mock.calls[0][1].body);
      expect(body.text).toContain('System Error');
      expect(body.text).toContain('Connection lost');
    });

    it('notifyErrors가 false면 전송하지 않는다', async () => {
      service.updateConfig({ notifyErrors: false });
      globalThis.fetch = vi.fn();

      await service.notifyError('error');
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // notifyStatus
  // ============================================================
  describe('notifyStatus', () => {
    it('상태 메시지를 전송한다', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ ok: true }),
      });

      await service.notifyStatus('Trading started');

      const body = JSON.parse((fetch as any).mock.calls[0][1].body);
      expect(body.text).toContain('System Status');
      expect(body.text).toContain('Trading started');
    });
  });
});
