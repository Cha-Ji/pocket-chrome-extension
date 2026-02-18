import { describe, it, expect } from 'vitest';
import { scrubPII } from '../dom-snapshot';

describe('scrubPII', () => {
  it('redacts email addresses', () => {
    expect(scrubPII('Contact user@example.com for info')).toBe(
      'Contact [REDACTED] for info',
    );
  });

  it('redacts long numeric IDs', () => {
    expect(scrubPII('Account 1234567890 active')).toBe('Account [REDACTED] active');
  });

  it('redacts dollar amounts', () => {
    expect(scrubPII('Balance: $1,234.56')).toBe('Balance: [REDACTED]');
  });

  it('redacts currency amounts with unit', () => {
    expect(scrubPII('Withdrew 500 USD today')).toBe('Withdrew [REDACTED] today');
  });

  it('preserves safe text', () => {
    expect(scrubPII('QT Demo')).toBe('QT Demo');
  });

  it('truncates to 50 characters', () => {
    // Use spaces to avoid matching the token-like pattern (\b[A-Za-z0-9_-]{20,}\b)
    const longText = 'Hello World Demo '.repeat(10);
    expect(scrubPII(longText).length).toBeLessThanOrEqual(50);
  });

  it('handles empty string', () => {
    expect(scrubPII('')).toBe('');
  });
});
