import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SELECTORS,
  type DOMSelectors,
  type Direction,
  type TradeResult,
  type AccountType,
} from './index';

describe('Types', () => {
  describe('DEFAULT_SELECTORS', () => {
    it('should have all required selector fields', () => {
      const requiredFields: (keyof DOMSelectors)[] = [
        'callButton',
        'putButton',
        'amountInput',
        'expirationDisplay',
        'balanceDisplay',
        'balanceLabel',
        'tickerSelector',
        'chartContainer',
        'priceDisplay',
        'demoIndicator',
      ];

      requiredFields.forEach((field) => {
        expect(DEFAULT_SELECTORS).toHaveProperty(field);
        expect(typeof DEFAULT_SELECTORS[field]).toBe('string');
        expect(DEFAULT_SELECTORS[field].length).toBeGreaterThan(0);
      });
    });

    it('should have correct call/put button selectors', () => {
      expect(DEFAULT_SELECTORS.callButton).toBe('.switch-state-block__item:first-child');
      expect(DEFAULT_SELECTORS.putButton).toBe('.switch-state-block__item:last-child');
    });

    it('should have demo indicator selector', () => {
      expect(DEFAULT_SELECTORS.demoIndicator).toBe('.balance-info-block__label');
    });
  });

  describe('Type Definitions', () => {
    it('should allow valid Direction values', () => {
      const validDirections: Direction[] = ['CALL', 'PUT'];
      validDirections.forEach((dir) => {
        expect(['CALL', 'PUT']).toContain(dir);
      });
    });

    it('should allow valid TradeResult values', () => {
      const validResults: TradeResult[] = ['WIN', 'LOSS', 'TIE', 'PENDING'];
      validResults.forEach((result) => {
        expect(['WIN', 'LOSS', 'TIE', 'PENDING']).toContain(result);
      });
    });

    it('should allow valid AccountType values', () => {
      const validTypes: AccountType[] = ['DEMO', 'LIVE', 'UNKNOWN'];
      validTypes.forEach((type) => {
        expect(['DEMO', 'LIVE', 'UNKNOWN']).toContain(type);
      });
    });
  });
});
