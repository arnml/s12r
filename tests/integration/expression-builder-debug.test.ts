import { describe, it, expect } from 'vitest';
import { buildLinearZoomExpressions } from '@/ffmpeg/expression-builder';
import { TryLedger } from '@/utils/try-ledger';
import type { ZoomEvent } from '@/types';

/**
 * REPRODUCTION TEST: Verify expression builder logging with realistic dwell events.
 *
 * This test reproduces the scenario from the actual video processing run:
 * - 4 dwell events with valid durations
 * - Events are normalized to 0.0-1.0 percentages
 * - Expected: complex FFmpeg expressions for zoom/pan
 * - Actual (BUG): fallback constant expressions (zoom=1, x=0.5, y=0.5)
 *
 * The TryLedger should show exactly where the divergence happens.
 */
describe('Expression Builder: Reproduction Test (Realistic Dwell Events)', () => {
  it('should process 4 dwell events with detailed logging', () => {
    const ledger = new TryLedger('repro-test', true); // verbose=true for detailed output

    // Simulate the 4 events from the actual test run
    const events: ZoomEvent[] = [
      {
        type: 'mouse dwell',
        timestamp: 1164,
        duration: 536,
        x: 440,
        y: 645,
        percentageX: 0.2,
        percentageY: 0.6,
        zoomLevel: 2,
      },
      {
        type: 'mouse dwell',
        timestamp: 4305,
        duration: 1642,
        x: 208,
        y: 281,
        percentageX: 0.1,
        percentageY: 0.3,
        zoomLevel: 2,
      },
      {
        type: 'mouse dwell',
        timestamp: 7677,
        duration: 5077,
        x: 1345,
        y: 436,
        percentageX: 0.7,
        percentageY: 0.4,
        zoomLevel: 2,
      },
      {
        type: 'mouse dwell',
        timestamp: 14914,
        duration: 5061,
        x: 244,
        y: 84,
        percentageX: 0.1,
        percentageY: 0.1,
        zoomLevel: 2,
      },
    ];

    console.log('\n🔬 REPRODUCTION TEST: Building expressions for 4 dwell events\n');

    // Call expression builder with ledger
    const result = buildLinearZoomExpressions(events, 1000, undefined, ledger); // Note: 1000 fps is wrong but matches the test

    // Print ledger summary
    console.log('\n📊 LEDGER SUMMARY:\n');
    ledger.emitSummary();

    // ASSERTIONS: Verify what happened
    console.log('\n🔍 ANALYSIS:\n');

    const entries = ledger.getEntries();
    const filterStep = entries.find(
      e => e.type === 'step' && (e.data as any).name === 'filter-short-events'
    );
    const buildSegmentStep = entries.find(
      e => e.type === 'step' && (e.data as any).name === 'build-cinematic-segments'
    );
    const validateStep = entries.find(
      e => e.type === 'step' && (e.data as any).name === 'validate-segments'
    );
    const exprStep = entries.find(
      e => e.type === 'step' && (e.data as any).name === 'build-expressions-from-segments'
    );
    const fallbackNote = entries.find(
      e => e.type === 'note' && (e.data as any).name === 'BRANCH_FALLBACK'
    );

    console.log(`✓ Filter Step Executed: ${filterStep ? 'YES' : 'NO'}`);
    if (filterStep) {
      console.log(`  └─ Input: ${(filterStep.data as any).inputsSummary}`);
      console.log(`  └─ Result: ${(filterStep.data as any).resultSummary}`);
    }

    console.log(`\n✓ Segment Build Executed: ${buildSegmentStep ? 'YES' : 'NO'}`);
    if (buildSegmentStep) {
      console.log(`  └─ Result: ${(buildSegmentStep.data as any).resultSummary}`);
    }

    console.log(`\n✓ Validation Executed: ${validateStep ? 'YES' : 'NO'}`);
    if (validateStep) {
      console.log(`  └─ Result: ${(validateStep.data as any).resultSummary}`);
    }

    console.log(`\n✓ Fallback Branch Used: ${fallbackNote ? 'YES' : 'NO'}`);
    if (fallbackNote) {
      console.log(`  └─ Reason: ${(fallbackNote.data as any).details}`);
    }

    console.log(`\n✓ Expression Build Step: ${exprStep ? 'YES' : 'NO'}`);
    if (exprStep) {
      console.log(`  └─ Mode: ${(exprStep.data as any).resultSummary}`);
      console.log(`  └─ Branch: ${(exprStep.data as any).branchTag}`);
    }

    // EXPECTED: Segments should be created (not empty)
    expect(result.cinematicSegments.length).toBeGreaterThan(0);
    console.log(
      `\n✓ Cinematic Segments: ${result.cinematicSegments.length} created (expected > 0)`
    );

    // CURRENT BUG: Expressions are constants (fallback) instead of complex
    console.log(`\n⚠️  Expression Analysis:`);
    console.log(`  └─ zoom expression: "${result.zoomExpr}"`);
    console.log(`  └─ x expression: "${result.pxExpr}"`);
    console.log(`  └─ y expression: "${result.pyExpr}"`);

    if (result.zoomExpr === '1' && result.pxExpr === '0.5' && result.pyExpr === '0.5') {
      console.log(
        `\n❌ BUG CONFIRMED: Expressions are constant fallback values (no zoom applied)`
      );
      console.log(`   This means the expression generation scaffold needs to be implemented.\n`);
    } else {
      console.log(`\n✅ Expressions are complex (zoom logic is working)\n`);
    }

    // ASSERTIONS based on what we expect
    expect(filterStep).toBeDefined('filter-short-events step should execute');
    expect(buildSegmentStep).toBeDefined('build-cinematic-segments step should execute');
    expect(validateStep).toBeDefined('validate-segments step should execute');
    expect(exprStep).toBeDefined('build-expressions-from-segments step should execute');
    expect(fallbackNote).toBeUndefined('BRANCH_FALLBACK should NOT execute with valid events');
  });

  it('should show clear branch logging for empty events case', () => {
    const ledger = new TryLedger('empty-events', false);

    const result = buildLinearZoomExpressions([], 30, undefined, ledger);

    const entries = ledger.getEntries();
    const fallbackNote = entries.find(
      e => e.type === 'note' && (e.data as any).name === 'BRANCH_FALLBACK'
    );
    const fallbackStep = entries.find(
      e => e.type === 'step' && (e.data as any).name === 'build-expressions-fallback'
    );

    expect(fallbackNote).toBeDefined('Should log fallback branch');
    expect(fallbackStep).toBeDefined('Should execute fallback step');
    expect((fallbackStep?.data as any).branchTag).toBe('fallback');
    expect(result.zoomExpr).toBe('1');
  });

  it('should show clear branch logging for all-short-events case', () => {
    const ledger = new TryLedger('short-events', false);

    const shortEvents: ZoomEvent[] = [
      {
        type: 'mouse dwell',
        timestamp: 0,
        duration: 100, // Less than 200ms
        x: 100,
        y: 100,
        zoomLevel: 2,
      },
      {
        type: 'mouse dwell',
        timestamp: 500,
        duration: 50, // Less than 200ms
        x: 200,
        y: 200,
        zoomLevel: 2,
      },
    ];

    const result = buildLinearZoomExpressions(shortEvents, 30, undefined, ledger);

    const entries = ledger.getEntries();
    const filterResult = entries.find(
      e => e.type === 'note' && (e.data as any).name === 'event-filter-result'
    );
    const fallbackNote = entries.find(
      e => e.type === 'note' && (e.data as any).name === 'BRANCH_FALLBACK'
    );

    expect(filterResult).toBeDefined('Should log filter result');
    expect((filterResult?.data as any).details).toContain('0/2 events pass');
    expect(fallbackNote).toBeDefined('Should log fallback branch reason');
    expect(result.zoomExpr).toBe('1');
  });
});
