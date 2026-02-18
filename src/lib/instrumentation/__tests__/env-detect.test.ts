import { describe, it, expect } from 'vitest';
import { resolveEnvironment, type EnvironmentSignals } from '../env-detect';

describe('resolveEnvironment', () => {
  it('returns demo with high confidence when 2+ signals indicate demo', () => {
    const signals: EnvironmentSignals = {
      urlHasDemo: true,
      chartDemoClass: true,
      balanceLabelHasDemo: true,
    };
    const result = resolveEnvironment(signals);
    expect(result.environment).toBe('demo');
    expect(result.confidence).toBe('high');
  });

  it('returns demo with high confidence when 2 signals indicate demo', () => {
    const signals: EnvironmentSignals = {
      urlHasDemo: true,
      chartDemoClass: true,
      balanceLabelHasDemo: null,
    };
    const result = resolveEnvironment(signals);
    expect(result.environment).toBe('demo');
    expect(result.confidence).toBe('high');
  });

  it('returns real with high confidence when 2+ signals indicate NOT demo and none say demo', () => {
    const signals: EnvironmentSignals = {
      urlHasDemo: false,
      chartDemoClass: false,
      balanceLabelHasDemo: false,
    };
    const result = resolveEnvironment(signals);
    expect(result.environment).toBe('real');
    expect(result.confidence).toBe('high');
  });

  it('returns demo with medium confidence when exactly 1 demo signal detected', () => {
    const signals: EnvironmentSignals = {
      urlHasDemo: true,
      chartDemoClass: null,
      balanceLabelHasDemo: null,
    };
    const result = resolveEnvironment(signals);
    expect(result.environment).toBe('demo');
    expect(result.confidence).toBe('medium');
  });

  it('returns real with medium confidence when 1 non-demo signal and no demo signals', () => {
    const signals: EnvironmentSignals = {
      urlHasDemo: false,
      chartDemoClass: null,
      balanceLabelHasDemo: null,
    };
    const result = resolveEnvironment(signals);
    expect(result.environment).toBe('real');
    expect(result.confidence).toBe('medium');
  });

  it('returns unknown when all signals are null', () => {
    const signals: EnvironmentSignals = {
      urlHasDemo: null,
      chartDemoClass: null,
      balanceLabelHasDemo: null,
    };
    const result = resolveEnvironment(signals);
    expect(result.environment).toBe('unknown');
    expect(result.confidence).toBe('low');
  });

  it('returns unknown when signals are contradictory', () => {
    const signals: EnvironmentSignals = {
      urlHasDemo: true,
      chartDemoClass: false,
      balanceLabelHasDemo: false,
    };
    const result = resolveEnvironment(signals);
    expect(result.environment).toBe('unknown');
    expect(result.confidence).toBe('low');
  });

  it('preserves the original signals in the result', () => {
    const signals: EnvironmentSignals = {
      urlHasDemo: true,
      chartDemoClass: null,
      balanceLabelHasDemo: false,
    };
    const result = resolveEnvironment(signals);
    expect(result.signals).toEqual(signals);
  });
});
