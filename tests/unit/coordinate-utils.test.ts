import { describe, it, expect } from 'vitest';
import {
  normalizeEventCoordinates,
  validateCoordinates
} from '@/ffmpeg/coordinate-utils';
import { ZoomEvent, CaptureSourceInfo, VideoMetadata } from '@/types';

describe('coordinate-utils', () => {
  const sourceInfo: CaptureSourceInfo = {
    x: 0,
    y: 0,
    width: 1920,
    height: 1080
  };

  const videoMetadata: VideoMetadata = {
    width: 1920,
    height: 1080,
    fps: 30
  };

  describe('normalizeEventCoordinates', () => {
    it('should normalize screen coordinates to percentages', () => {
      const events: ZoomEvent[] = [{
        type: 'mouse dwell',
        timestamp: 1000,
        duration: 500,
        x: 960,
        y: 540,
        zoomLevel: 2
      }];

      const result = normalizeEventCoordinates(events, sourceInfo, videoMetadata);

      expect(result[0].percentageX).toBe(0.5); // 960/1920
      expect(result[0].percentageY).toBe(0.5); // 540/1080
    });

    it('should handle window source offsets', () => {
      const windowSource: CaptureSourceInfo = {
        x: 100,
        y: 50,
        width: 800,
        height: 600
      };

      const events: ZoomEvent[] = [{
        type: 'mouse dwell',
        timestamp: 1000,
        duration: 500,
        x: 500,      // Screen absolute
        y: 350,      // Screen absolute
        zoomLevel: 2
      }];

      const result = normalizeEventCoordinates(events, windowSource, {
        width: 800,
        height: 600,
        fps: 30
      });

      // Relative to window: (500-100)=400, (350-50)=300
      // Percentages: 400/800=0.5, 300/600=0.5
      expect(result[0].percentageX).toBe(0.5);
      expect(result[0].percentageY).toBe(0.5);
    });

    it('should clamp out-of-bounds coordinates', () => {
      const events: ZoomEvent[] = [{
        type: 'mouse dwell',
        timestamp: 1000,
        duration: 500,
        x: 2500,     // Outside source width
        y: 1500,     // Outside source height
        zoomLevel: 2
      }];

      const result = normalizeEventCoordinates(events, sourceInfo, videoMetadata);

      expect(result[0].percentageX).toBe(1); // Clamped to max
      expect(result[0].percentageY).toBe(1); // Clamped to max
    });

    it('should clamp negative coordinates', () => {
      const events: ZoomEvent[] = [{
        type: 'typing',
        timestamp: 1000,
        duration: 500,
        x: -100,
        y: -100,
        zoomLevel: 1.5
      }];

      const result = normalizeEventCoordinates(events, sourceInfo, videoMetadata);

      expect(result[0].percentageX).toBe(0); // Clamped to min
      expect(result[0].percentageY).toBe(0); // Clamped to min
    });

    it('should preserve zoom level', () => {
      const events: ZoomEvent[] = [{
        type: 'mouse dwell',
        timestamp: 1000,
        duration: 500,
        x: 960,
        y: 540,
        zoomLevel: 2.5
      }];

      const result = normalizeEventCoordinates(events, sourceInfo, videoMetadata);

      expect(result[0].zoomLevel).toBe(2.5);
    });

    it('should process multiple events', () => {
      const events: ZoomEvent[] = [
        {
          type: 'mouse dwell',
          timestamp: 1000,
          duration: 500,
          x: 100,
          y: 100,
          zoomLevel: 2
        },
        {
          type: 'typing',
          timestamp: 2000,
          duration: 800,
          x: 1800,
          y: 1000,
          zoomLevel: 1.5
        }
      ];

      const result = normalizeEventCoordinates(events, sourceInfo, videoMetadata);

      expect(result).toHaveLength(2);
      // Rounded to 1 decimal: 100/1920=0.052... rounds to 0.1
      expect(result[0].percentageX).toBe(0.1);
      // Rounded to 1 decimal: 1800/1920=0.9375 rounds to 0.9
      expect(result[1].percentageX).toBe(0.9);
    });
  });

  describe('validateCoordinates', () => {
    it('should return valid=true for in-bounds coordinates', () => {
      const events: ZoomEvent[] = [{
        type: 'mouse dwell',
        timestamp: 1000,
        duration: 500,
        x: 960,
        y: 540,
        zoomLevel: 2
      }];

      const result = validateCoordinates(events, sourceInfo);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should warn about out-of-bounds coordinates', () => {
      const events: ZoomEvent[] = [{
        type: 'mouse dwell',
        timestamp: 1000,
        duration: 500,
        x: 2500,
        y: 1500,
        zoomLevel: 2
      }];

      const result = validateCoordinates(events, sourceInfo);

      expect(result.valid).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('outside source bounds');
    });

    it('should handle edge case coordinates', () => {
      const events: ZoomEvent[] = [
        {
          type: 'mouse dwell',
          timestamp: 1000,
          duration: 500,
          x: 0,
          y: 0,
          zoomLevel: 2
        },
        {
          type: 'typing',
          timestamp: 2000,
          duration: 500,
          x: 1920,
          y: 1080,
          zoomLevel: 1.5
        }
      ];

      const result = validateCoordinates(events, sourceInfo);

      // Edge cases should be valid (exact boundaries)
      expect(result.valid).toBe(true);
    });
  });
});
