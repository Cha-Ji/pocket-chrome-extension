import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PocketOptionDetector } from './index';

describe('PocketOptionDetector', () => {
  let detector: PocketOptionDetector;

  beforeEach(() => {
    detector = new PocketOptionDetector();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should have correct platformId', () => {
    expect(detector.platformId).toBe('pocket-option-demo');
  });

  it('should return 0 for non-PO domains', () => {
    const score = detector.detect('https://quotex.io/trading', document);
    expect(score).toBe(0);
  });

  it('should detect pocketoption.com domain', () => {
    const score = detector.detect(
      'https://pocketoption.com/ko/cabinet/demo-quick-high-low/',
      document,
    );
    expect(score).toBeGreaterThan(0);
  });

  it('should detect po.trade domain', () => {
    const score = detector.detect('https://po.trade/demo', document);
    expect(score).toBeGreaterThan(0);
  });

  it('should detect po2.trade domain', () => {
    const score = detector.detect('https://po2.trade/demo', document);
    expect(score).toBeGreaterThan(0);
  });

  it('should give higher score when URL contains demo', () => {
    const demoScore = detector.detect('https://pocketoption.com/demo', document);
    const liveScore = detector.detect('https://pocketoption.com/live', document);
    expect(demoScore).toBeGreaterThan(liveScore);
  });

  it('should give higher score when DOM contains PO elements', () => {
    // DOM 없이
    const scoreNoDom = detector.detect('https://pocketoption.com/', document);

    // DOM 추가
    const chartItem = document.createElement('div');
    chartItem.className = 'chart-item';
    document.body.appendChild(chartItem);

    const scoreWithDom = detector.detect('https://pocketoption.com/', document);

    expect(scoreWithDom).toBeGreaterThan(scoreNoDom);
  });

  it('should give maximum score for demo URL + DOM elements', () => {
    const chartItem = document.createElement('div');
    chartItem.className = 'chart-item';
    document.body.appendChild(chartItem);

    const score = detector.detect('https://pocketoption.com/demo-quick-high-low', document);
    expect(score).toBe(1); // 0.5 (domain) + 0.3 (demo) + 0.2 (DOM) = 1.0
  });

  it('should create adapter when detected', () => {
    const adapter = detector.createAdapter();
    expect(adapter.platformId).toBe('pocket-option-demo');
    expect(adapter.platformName).toBe('Pocket Option (Demo)');
  });
});
