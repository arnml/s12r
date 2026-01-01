/**
 * Performance benchmarks for expression builder.
 * Ensures the flat timeline architecture scales linearly.
 */

import { describe, it, expect } from 'vitest';
import { buildLinearZoomExpressions } from '@/ffmpeg/expression-builder';
import { TestDataFactory } from '../helpers/test-data-factory';

describe('Expression Builder Performance', () => {
  const metadata = TestDataFactory.createVideoMetadata();

  it('should scale linearly with event count', () => {
    const eventCounts = [1, 5, 10, 20];
    const timings: Array<{ count: number; duration: number; expressionLength: number }> = [];

    for (const count of eventCounts) {
      const events = TestDataFactory.createZoomEvents(count);
      
      const startTime = performance.now();
      const { zoomExpr } = buildLinearZoomExpressions(events, 30, metadata);
      const duration = performance.now() - startTime;
      
      timings.push({
        count,
        duration,
        expressionLength: zoomExpr.length,
      });
    }

    // Log results for analysis
    console.log('\nExpression Builder Performance:');
    console.log('Events | Duration (ms) | Expression Length');
    console.log('-------|---------------|------------------');
    timings.forEach(({ count, duration, expressionLength }) => {
      console.log(`${count.toString().padStart(6)} | ${duration.toFixed(2).padStart(13)} | ${expressionLength.toString().padStart(17)}`);
    });

    // Verify linear scaling (not exponential)
    // Duration should not increase exponentially
    const firstTiming = timings[0];
    const lastTiming = timings[timings.length - 1];
    
    const durationRatio = lastTiming.duration / firstTiming.duration;
    const eventRatio = lastTiming.count / firstTiming.count;
    
    // Duration growth should be roughly linear (within 2x of event ratio)
    expect(durationRatio).toBeLessThan(eventRatio * 2);
    
    // Expression length should grow linearly
    const lengthRatio = lastTiming.