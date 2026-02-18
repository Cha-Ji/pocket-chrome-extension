import { describe, it, expect } from 'vitest';
import { extractSchema, WSSchemaCollector } from '../ws-snapshot';

describe('extractSchema', () => {
  it('handles null', () => {
    expect(extractSchema(null)).toEqual({ type: 'null' });
  });

  it('handles undefined', () => {
    expect(extractSchema(undefined)).toEqual({ type: 'null' });
  });

  it('handles string with length', () => {
    expect(extractSchema('hello')).toEqual({ type: 'string', length: 5 });
  });

  it('handles number', () => {
    expect(extractSchema(42)).toEqual({ type: 'number' });
  });

  it('handles boolean', () => {
    expect(extractSchema(true)).toEqual({ type: 'boolean' });
  });

  it('handles array with item schema', () => {
    const result = extractSchema([1, 2, 3]);
    expect(result).toEqual({
      type: 'array',
      length: 3,
      itemSchema: { type: 'number' },
    });
  });

  it('handles empty array', () => {
    const result = extractSchema([]);
    expect(result).toEqual({
      type: 'array',
      length: 0,
      itemSchema: undefined,
    });
  });

  it('handles object with sorted keys', () => {
    const result = extractSchema({ z: 1, a: 2, m: 3 });
    expect(result).toEqual({
      type: 'object',
      keys: ['a', 'm', 'z'],
    });
  });

  it('caps recursion depth at 5', () => {
    const nested = { a: { b: { c: { d: { e: { f: 'deep' } } } } } };
    const result = extractSchema(nested);
    expect(result.type).toBe('object');
  });
});

describe('WSSchemaCollector', () => {
  it('records messages and builds snapshot', () => {
    const collector = new WSSchemaCollector();

    collector.record({ price: 1.23 }, '42["updateStream",[]]', 30, 'text');
    collector.record({ open: 1, close: 2 }, '42["candle",[]]', 50, 'text');
    collector.record(null, null, 5, 'binary');

    const snapshot = collector.snapshot('demo');

    expect(snapshot.environment).toBe('demo');
    expect(snapshot.totalCaptured).toBe(3);
    expect(snapshot.eventNames).toContain('updateStream');
    expect(snapshot.eventNames).toContain('candle');
    expect(snapshot.frameTypeDistribution.text).toBe(2);
    expect(snapshot.frameTypeDistribution.binary).toBe(1);
    expect(snapshot.recentEntries).toHaveLength(3);
  });

  it('tracks event frequency', () => {
    const collector = new WSSchemaCollector();

    collector.record({}, '42["updateStream",[]]', 10, 'text');
    collector.record({}, '42["updateStream",[]]', 10, 'text');
    collector.record({}, '42["heartbeat",[]]', 5, 'text');

    const snapshot = collector.snapshot('demo');

    expect(snapshot.eventFrequency['updateStream']).toBe(2);
    expect(snapshot.eventFrequency['heartbeat']).toBe(1);
  });

  it('stores first-seen schema per event', () => {
    const collector = new WSSchemaCollector();

    collector.record({ a: 1, b: 2 }, '42["test",[]]', 10, 'text');
    collector.record({ x: 1 }, '42["test",[]]', 10, 'text');

    const snapshot = collector.snapshot('demo');

    // Should store the first schema, not the second
    expect(snapshot.schemaByEvent['test']).toEqual({
      type: 'object',
      keys: ['a', 'b'],
    });
  });

  it('respects ring buffer cap', () => {
    const collector = new WSSchemaCollector();

    for (let i = 0; i < 250; i++) {
      collector.record({ i }, `42["e${i}"]`, 10, 'text');
    }

    // Ring buffer capped at 200
    expect(collector.size).toBe(200);
    expect(collector.snapshot('demo').totalCaptured).toBe(250);
  });

  it('clears all data', () => {
    const collector = new WSSchemaCollector();

    collector.record({}, '42["test"]', 10, 'text');
    collector.clear();

    expect(collector.size).toBe(0);
    const snapshot = collector.snapshot('demo');
    expect(snapshot.totalCaptured).toBe(0);
    expect(snapshot.eventNames).toHaveLength(0);
  });
});
