import { describe, it, expect } from 'vitest';
import { mergeOverlappingEvents, getMergeStats } from '@/utils/event-merger';
import { ZoomEvent } from '@/types';

describe('event-merger', () => {
  describe('mergeOverlappingEvents', () => {
    it('should merge overlapping events', () => {
      const events: ZoomEvent[] = [
        {
          type: 'mouse dwell',
          timestamp: 1000,
          duration: 500,
          x: 100,
          y: 100,
          percentageX: 0.2,
          percentageY: 0.2,
          zoomLevel: 2
        },
        {
          type: 'typing',
          timestamp: 1200,  // Overlaps with first event (ends at 1500)
          duration: 400,
          x: 200,
          y: 200,
          percentageX: 0.3,
          percentageY: 0.3,
          zoomLevel: 1.5
        }
      ];

      const result = mergeOverlappingEvents(events);

      expect(result).toHaveLength(1);
      expect(result[0].timestamp).toBe(1000);
      expect(result[0].duration).toBe(600); // Max of 500 + 400
      expect(result[0].merged).toBe(true);
      expect(result[0].zoomLevel).toBe(2); // Max zoom level
    });

    it('should not merge non-overlapping events', () => {
      const events: ZoomEvent[] = [
        {
          type: 'mouse dwell',
          timestamp: 1000,
          duration: 300,
          x: 100,
          y: 100,
          percentageX: 0.2,
          percentageY: 0.2,
          zoomLevel: 2
        },
        {
          type: 'typing',
          timestamp: 2000,  // No overlap (first ends at 1300)
          duration: 400,
          x: 200,
          y: 200,
          percentageX: 0.3,
          percentageY: 0.3,
          zoomLevel: 1.5
        }
      ];

      const result = mergeOverlappingEvents(events);

      expect(result).toHaveLength(2);
      expect(result[0].timestamp).toBe(1000);
      expect(result[1].timestamp).toBe(2000);
      expect(result[0].merged).toBeUndefined();
      expect(result[1].merged).toBeUndefined();
    });

    it('should handle empty array', () => {
      const result = mergeOverlappingEvents([]);
      expect(result).toHaveLength(0);
    });

    it('should handle single event', () => {
      const events: ZoomEvent[] = [{
        type: 'mouse dwell',
        timestamp: 1000,
        duration: 500,
        x: 100,
        y: 100,
        percentageX: 0.2,
        percentageY: 0.2,
        zoomLevel: 2
      }];

      const result = mergeOverlappingEvents(events);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(events[0]);
    });

    it('should sort events by timestamp before merging', () => {
      const events: ZoomEvent[] = [
        {
          type: 'typing',
          timestamp: 2000,
          duration: 400,
          x: 200,
          y: 200,
          percentageX: 0.3,
          percentageY: 0.3,
          zoomLevel: 1.5
        },
        {
          type: 'mouse dwell',
          timestamp: 1000,
          duration: 500,
          x: 100,
          y: 100,
          percentageX: 0.2,
          percentageY: 0.2,
          zoomLevel: 2
        }
      ];

      const result = mergeOverlappingEvents(events);

      expect(result[0].timestamp).toBe(1000);
      expect(result[1].timestamp).toBe(2000);
    });

    it('should calculate weighted average positions', () => {
      const events: ZoomEvent[] = [
        {
          type: 'mouse dwell',
          timestamp: 1000,
          duration: 1000,  // Longer duration
          x: 100,
          y: 100,
          percentageX: 0.2,
          percentageY: 0.2,
          zoomLevel: 2
        },
        {
          type: 'typing',
          timestamp: 1500,
          duration: 500,   // Shorter duration
          x: 300,
          y: 300,
          percentageX: 0.6,
          percentageY: 0.6,
          zoomLevel: 1.5
        }
      ];

      const result = mergeOverlappingEvents(events);

      // Weighted average: (0.2 * 1000 + 0.6 * 500) / 1500 = 0.333...
      expect(result[0].percentageX).toBeCloseTo(0.333, 2);
      expect(result[0].percentageY).toBeCloseTo(0.333, 2);
    });

    it('should merge multiple overlapping events', () => {
      const events: ZoomEvent[] = [
        {
          type: 'mouse dwell',
          timestamp: 1000,
          duration: 600,
          x: 100,
          y: 100,
          percentageX: 0.2,
          percentageY: 0.2,
          zoomLevel: 2
        },
        {
          type: 'typing',
          timestamp: 1200,  // Overlaps with first
          duration: 500,
          x: 200,
          y: 200,
          percentageX: 0.3,
          percentageY: 0.3,
          zoomLevel: 1.5
        },
        {
          type: 'mouse dwell',
          timestamp: 1400,  // Overlaps with second (and indirectly first)
          duration: 500,
          x: 300,
          y: 300,
          percentageX: 0.4,
          percentageY: 0.4,
          zoomLevel: 2.5
        }
      ];

      const result = mergeOverlappingEvents(events);

      // All should merge into one event
      expect(result).toHaveLength(1);
      expect(result[0].timestamp).toBe(1000);
      expect(result[0].duration).toBe(900); // From 1000 to 1900
      expect(result[0].zoomLevel).toBe(2.5); // Max zoom
    });
  });

  describe('getMergeStats', () => {
    it('should calculate merge statistics', () => {
      const original: ZoomEvent[] = [
        {
          type: 'mouse dwell',
          timestamp: 1000,
          duration: 500,
          x: 100,
          y: 100,
          percentageX: 0.2,
          percentageY: 0.2,
          zoomLevel: 2
        },
        {
          type: 'typing',
          timestamp: 1200,
          duration: 400,
          x: 200,
          y: 200,
          percentageX: 0.3,
          percentageY: 0.3,
          zoomLevel: 1.5
        }
      ];

      const merged = mergeOverlappingEvents(original);
      const stats = getMergeStats(original, merged);

      expect(stats.originalCount).toBe(2);
      expect(stats.mergedCount).toBe(1);
      expect(stats.eventsMerged).toBe(1);
    });
  });
});
