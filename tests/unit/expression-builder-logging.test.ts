import { describe, it, expect, beforeEach } from 'vitest';
import { buildLinearZoomExpressions } from '@/ffmpeg/expression-builder';
import { TryLedger } from '@/utils/try-ledger';
import type { ZoomEvent } from '@/types';

describe('Expression Builder with Ledger Logging', () => {
  let ledger: TryLedger;

  beforeEach(() => {
    ledger = new TryLedger('expr-test', false);
  });

  it('should log entry and exit checkpoints', () => {
    const events: ZoomEvent[] = [
      {
        type: 'mouse dwell',
        timestamp: 1000,
        duration: 1000,
        x: 960,
        y: 540,
        zoomLevel: 2,
        percentageX: 0.5,
        percentageY: 0.5,
      },
    ];

    buildLinearZoomExpressions(events, 30, undefined, ledger);

    const entries = ledger.getEntries();
    const entryNote = entries.find(e => (e.data as any).name === 'expression-builder.entry');
    const exitNote = entries.find(e => (e.data as any).name === 'expression-builder.exit');

    expect(entryNote).toBeDefined();
    expect(exitNote).toBeDefined();
  });

  it('should log event filtering step', () => {
    const longEvent: ZoomEvent = {
      type: 'mouse dwell',
      timestamp: 1000,
      duration: 500,
      x: 960,
      y: 540,
      zoomLevel: 2,
      percentageX: 0.5,
      percentageY: 0.5,
    };

    const events: ZoomEvent[] = [longEvent];

    buildLinearZoomExpressions(events, 30, undefined, ledger);

    const entries = ledger.getEntries();
    const filterStep = entries.find(e => e.type === 'step' && (e.data as any).name === 'filter-short-events');

    expect(filterStep).toBeDefined();
    expect(filterStep?.data).toHaveProperty('resultSummary');
  });

  it('should branch to fallback when no events pass duration filter', () => {
    const shortEvent: ZoomEvent = {
      type: 'mouse dwell',
      timestamp: 1000,
      duration: 100, // Less than 200ms minimum
      x: 960,
      y: 540,
      zoomLevel: 2,
      percentageX: 0.5,
      percentageY: 0.5,
    };

    const result = buildLinearZoomExpressions([shortEvent], 30, undefined, ledger);

    // Should return default fallback
    expect(result.zoomExpr).toBe('1');
    expect(result.pxExpr).toBe('0.5');
    expect(result.pyExpr).toBe('0.5');
    expect(result.cinematicSegments).toHaveLength(0);

    // Check ledger for fallback branch
    const entries = ledger.getEntries();
    const fallbackNote = entries.find(
      e => e.type === 'note' && (e.data as any).name === 'BRANCH_FALLBACK'
    );
    const fallbackStep = entries.find(
      e => e.type === 'step' && (e.data as any).name === 'build-expressions-fallback'
    );

    expect(fallbackNote).toBeDefined();
    expect(fallbackStep).toBeDefined();
    expect((fallbackStep?.data as any).branchTag).toBe('fallback');
  });

  it('should log cinematic segment creation with valid events', () => {
    const events: ZoomEvent[] = [
      {
        type: 'mouse dwell',
        timestamp: 1000,
        duration: 2000,
        x: 960,
        y: 540,
        zoomLevel: 2,
        percentageX: 0.5,
        percentageY: 0.5,
      },
    ];

    buildLinearZoomExpressions(events, 30, undefined, ledger);

    const entries = ledger.getEntries();
    const segmentStep = entries.find(
      e => e.type === 'step' && (e.data as any).name === 'build-cinematic-segments'
    );

    expect(segmentStep).toBeDefined();
    expect((segmentStep?.data as any).resultSummary).toContain('[');
  });

  it('should log segment validation step', () => {
    const events: ZoomEvent[] = [
      {
        type: 'mouse dwell',
        timestamp: 1000,
        duration: 2000,
        x: 960,
        y: 540,
        zoomLevel: 2,
        percentageX: 0.5,
        percentageY: 0.5,
      },
    ];

    buildLinearZoomExpressions(events, 30, undefined, ledger);

    const entries = ledger.getEntries();
    const validateStep = entries.find(
      e => e.type === 'step' && (e.data as any).name === 'validate-segments'
    );

    expect(validateStep).toBeDefined();
    // Result is summarized as {valid, count} due to TryLedger's object summarization
    expect((validateStep?.data as any).resultSummary).toContain('valid');
  });

  it('should log expression build step with scaffold mode', () => {
    const events: ZoomEvent[] = [
      {
        type: 'mouse dwell',
        timestamp: 1000,
        duration: 2000,
        x: 960,
        y: 540,
        zoomLevel: 2,
        percentageX: 0.5,
        percentageY: 0.5,
      },
    ];

    buildLinearZoomExpressions(events, 30, undefined, ledger);

    const entries = ledger.getEntries();
    const exprStep = entries.find(
      e => e.type === 'step' && (e.data as any).name === 'build-expressions-from-segments'
    );

    expect(exprStep).toBeDefined();
    // Now that expressions are fully implemented, branch is 'primary' (not scaffold)
    expect((exprStep?.data as any).branchTag).toBe('primary');
    // Result includes the generated expression data
    expect((exprStep?.data as any).resultSummary).toContain('zoomExpr');
  });

  it('should maintain step order for a complete successful run', () => {
    const events: ZoomEvent[] = [
      {
        type: 'mouse dwell',
        timestamp: 1000,
        duration: 2000,
        x: 960,
        y: 540,
        zoomLevel: 2,
        percentageX: 0.5,
        percentageY: 0.5,
      },
    ];

    buildLinearZoomExpressions(events, 30, undefined, ledger);

    const stepNames = ledger.getStepNames();

    // Should follow this order (main steps):
    expect(stepNames).toContain('filter-short-events');
    expect(stepNames).toContain('build-cinematic-segments');
    expect(stepNames).toContain('validate-segments');
    expect(stepNames).toContain('build-expressions-from-segments');

    // With full implementation, should also contain sub-steps:
    expect(stepNames).toContain('5a-normalize-timeline');
    expect(stepNames).toContain('5b-compute-zoom-profile');
    expect(stepNames).toContain('5c-compute-pan-profile');
    expect(stepNames).toContain('5d-build-zoom-expression');
    expect(stepNames).toContain('5e-build-x-pan-expression');
    expect(stepNames).toContain('5f-build-y-pan-expression');
    expect(stepNames).toContain('5g-validate-expressions');

    // Verify all steps have valid indices
    const allIdxs = ledger.getEntries()
      .filter(e => e.type === 'step')
      .map(e => (e.data as any).idx);

    expect(allIdxs.length).toBeGreaterThan(7); // At least main + sub-steps
    expect(Math.min(...allIdxs)).toBeGreaterThan(0); // Indices are positive
    expect(allIdxs[0]).toBeLessThan(allIdxs[allIdxs.length - 1]); // Indices increase
  });

  it('should include notes for checkpoint validation', () => {
    const events: ZoomEvent[] = [
      {
        type: 'mouse dwell',
        timestamp: 1000,
        duration: 2000,
        x: 960,
        y: 540,
        zoomLevel: 2,
        percentageX: 0.5,
        percentageY: 0.5,
      },
    ];

    buildLinearZoomExpressions(events, 30, undefined, ledger);

    const entries = ledger.getEntries();

    // Should have various checkpoint notes
    const notes = entries.filter(e => e.type === 'note');
    expect(notes.length).toBeGreaterThan(0);

    const noteNames = notes.map(n => (n.data as any).name);
    expect(noteNames).toContain('expression-builder.entry');
    expect(noteNames).toContain('expression-builder.exit');
  });
});
