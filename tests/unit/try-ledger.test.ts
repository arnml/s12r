import { describe, it, expect, beforeEach } from 'vitest';
import { TryLedger, isDebugEnabled } from '@/utils/try-ledger';

describe('TryLedger', () => {
  let ledger: TryLedger;

  beforeEach(() => {
    ledger = new TryLedger('test-trace', false);
  });

  it('should generate unique traceId', () => {
    const ledger1 = new TryLedger();
    const ledger2 = new TryLedger();
    expect(ledger1.getTraceId()).not.toBe(ledger2.getTraceId());
  });

  it('should accept custom traceId', () => {
    const ledger = new TryLedger('custom-id');
    expect(ledger.getTraceId()).toBe('custom-id');
  });

  it('should record successful steps in order', () => {
    ledger.step('step-1', 'input-a', () => 'result-1');
    ledger.step('step-2', 'input-b', () => 'result-2');

    const names = ledger.getStepNames();
    expect(names).toEqual(['step-1', 'step-2']);
  });

  it('should record step inputs and results', () => {
    ledger.step('normalize', 'events=4', () => ({ count: 4 }));

    const result = ledger.getStepResult('normalize');
    expect(result).toContain('count');
  });

  it('should handle step errors gracefully', () => {
    expect(() => {
      ledger.step('failing-step', 'input-x', () => {
        throw new Error('test error');
      });
    }).toThrow('test error');

    const entries = ledger.getEntries();
    const failedStep = entries.find(e => e.type === 'step' && (e.data as any).name === 'failing-step');
    expect(failedStep).toBeDefined();
    expect((failedStep?.data as any).errorSummary).toBe('test error');
  });

  it('should record branch tags', () => {
    ledger.step('primary-path', 'input', () => 'ok', 'primary');
    ledger.step('fallback-path', 'input', () => 'fallback', 'fallback');

    const entries = ledger.getEntries();
    const primary = entries.find(e => (e.data as any).name === 'primary-path');
    const fallback = entries.find(e => (e.data as any).name === 'fallback-path');

    expect((primary?.data as any).branchTag).toBe('primary');
    expect((fallback?.data as any).branchTag).toBe('fallback');
  });

  it('should record notes without execution', () => {
    ledger.note('checkpoint-1', 'validation passed');
    ledger.step('actual-step', 'input', () => 'result');
    ledger.note('checkpoint-2', 'transformation complete');

    const entries = ledger.getEntries();
    expect(entries[0].type).toBe('note');
    expect(entries[1].type).toBe('step');
    expect(entries[2].type).toBe('note');
  });

  it('should maintain step index incrementally', () => {
    ledger.step('a', 'x', () => 'a');
    ledger.note('b', 'msg');
    ledger.step('c', 'x', () => 'c');

    const entries = ledger.getEntries();
    expect((entries[0].data as any).idx).toBe(1);
    expect((entries[1].data as any).idx).toBe(2);
    expect((entries[2].data as any).idx).toBe(3);
  });

  it('should summarize various value types', () => {
    ledger.step('null-step', 'x', () => null);
    ledger.step('number-step', 'x', () => 42);
    ledger.step('array-step', 'x', () => [1, 2, 3, 4, 5]);
    ledger.step('object-step', 'x', () => ({ a: 1, b: 2 }));

    const entries = ledger.getEntries();
    expect((entries[0].data as any).resultSummary).toBe('null');
    expect((entries[1].data as any).resultSummary).toBe('42');
    expect((entries[2].data as any).resultSummary).toContain('[5 items]');
    expect((entries[3].data as any).resultSummary).toContain('{a, b}');
  });

  it('should record timing information', () => {
    ledger.step('timed-step', 'input', () => {
      // Simulate some work
      let sum = 0;
      for (let i = 0; i < 1000000; i++) sum += i;
      return sum;
    });

    const entries = ledger.getEntries();
    const step = entries[0].data as any;
    expect(step.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should provide summary output', () => {
    ledger.step('step-1', 'a', () => 'ok');
    ledger.note('checkpoint', 'message');

    let output = '';
    const originalLog = console.log;
    console.log = (msg: string) => {
      output += msg;
    };

    ledger.emitSummary();

    console.log = originalLog;

    expect(output).toContain('TRY LEDGER SUMMARY');
    expect(output).toContain(ledger.getTraceId());
  });
});
