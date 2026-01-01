/**
 * Test data factory for creating consistent test fixtures.
 * Reduces duplication and ensures test data consistency.
 */

import { ZoomEvent, CaptureSourceInfo, VideoMetadata } from '@/types';

export class TestDataFactory {
  /**
   * Create a basic zoom event with sensible defaults.
   */
  static createZoomEvent(overrides: Partial<ZoomEvent> = {}): ZoomEvent {
    return {
      type: 'mouse dwell',
      timestamp: 1000,
      duration: 2500,
      x: 100,
      y: 100,
      percentageX: 0.5,
      percentageY: 0.5,
      zoomLevel: 2.0,
      ...overrides,
    };
  }

  /**
   * Create multiple zoom events with automatic spacing.
   */
  static createZoomEvents(count: number, spacing = 3000): ZoomEvent[] {
    return Array.from({ length: count }, (_, i) => 
      this.createZoomEvent({
        timestamp: 1000 + i * spacing,
        x: 100 + i * 50,
        y: 100 + i * 50,
        percentageX: 0.3 + i * 0.1,
        percentageY: 0.3 + i * 0.1,
        type: i % 2 === 0 ? 'mouse dwell' : 'typing',
        zoomLevel: i % 2 === 0 ? 2.0 : 1.5,
      })
    );
  }

  /**
   * Create overlapping events for testing merge functionality.
   */
  static createOverlappingEvents(): ZoomEvent[] {
    return [
      this.createZoomEvent({
        timestamp: 1000,
        duration: 1500,
        x: 100,
        y: 100,
        percentageX: 0.2,
        percentageY: 0.2,
        zoomLevel: 2.0,
      }),
      this.createZoomEvent({
        timestamp: 1800, // Overlaps with first event
        duration: 1000,
        x: 200,
        y: 200,
        percentageX: 0.4,
        percentageY: 0.4,
        zoomLevel: 1.5,
      }),
    ];
  }

  /**
   * Create capture source info with defaults.
   */
  static createSourceInfo(overrides: Partial<CaptureSourceInfo> = {}): CaptureSourceInfo {
    return {
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      ...overrides,
    };
  }

  /**
   * Create video metadata with defaults.
   */
  static createVideoMetadata(overrides: Partial<VideoMetadata> = {}): VideoMetadata {
    return {
      width: 1920,
      height: 1080,
      fps: 30,
      duration: 10,
      ...overrides,
    };
  }

  /**
   * Create events that will be filtered out (too short).
   */
  static createShortEvents(): ZoomEvent[] {
    return [
      this.createZoomEvent({ duration: 100 }), // Too short
      this.createZoomEvent({ duration: 500 }), // Too short
      this.createZoomEvent({ duration: 2500 }), // Valid
    ];
  }

  /**
   * Create events at screen boundaries for edge case testing.
   */
  static createBoundaryEvents(): ZoomEvent[] {
    return [
      this.createZoomEvent({
        x: 0,
        y: 0,
        percentageX: 0.0,
        percentageY: 0.0,
      }),
      this.createZoomEvent({
        x: 1920,
        y: 1080,
        percentageX: 1.0,
        percentageY: 1.0,
      }),
    ];
  }
}

/**
 * Test assertion helpers for common validations.
 */
export class TestAssertions {
  /**
   * Assert that an expression has balanced parentheses.
   */
  static assertBalancedParentheses(expression: string): void {
    const openCount = (expression.match(/\(/g) || []).length;
    const closeCount = (expression.match(/\)/g) || []).length;
    
    if (openCount !== closeCount) {
      throw new Error(
        `Unbalanced parentheses: ${openCount} open, ${closeCount} close\n` +
        `Expression: ${expression.substring(0, 200)}...`
      );
    }
  }

  /**
   * Assert that an expression doesn't contain undefined values.
   */
  static assertNoUndefinedValues(expression: string): void {
    if (expression.includes('undefined')) {
      throw new Error(`Expression contains undefined values: ${expression}`);
    }
  }

  /**
   * Assert that expression complexity is within reasonable bounds.
   */
  static assertReasonableComplexity(expression: string, maxLength = 1000): void {
    if (expression.length > maxLength) {
      throw new Error(
        `Expression too complex: ${expression.length} chars (max: ${maxLength})\n` +
        `Expression: ${expression.substring(0, 100)}...`
      );
    }
  }
}