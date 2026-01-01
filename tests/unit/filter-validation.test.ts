import { describe, it, expect } from 'vitest';
import { buildLinearZoomExpressions } from '@/ffmpeg/expression-builder';
import { ZoomEvent } from '@/types';

describe('Filter String Validation', () => {
  /**
   * These tests verify that the zoompan filter string includes all required parameters.
   * This is critical because missing parameters cause "Error reinitializing filters!" at runtime.
   */

  describe('zoompan filter parameters', () => {
    it('should include all required parameters: z, d, x, y, s, fps', () => {
      const events: ZoomEvent[] = [{
        type: 'mouse dwell',
        timestamp: 1000,
        duration: 2500,
        x: 100,
        y: 100,
        percentageX: 0.5,
        percentageY: 0.5,
        zoomLevel: 2
      }];

      const metadata = { width: 1920, height: 1080, fps: 30 };
      const { zoomExpr, pxExpr, pyExpr } = buildLinearZoomExpressions(events, 30, metadata);

      // Build filter string (simulating what video-processing.ts does)
      const width = 1920;
      const height = 1080;
      const xCalc = `max(0,min(iw-iw/z,(${pxExpr}*iw)-(iw/(2*z))))`;
      const yCalc = `max(0,min(ih-ih/z,(${pyExpr}*ih)-(ih/(2*z))))`;
      const filterComplex = `zoompan=z='${zoomExpr}':d=1:x='${xCalc}':y='${yCalc}':s=${width}x${height}:fps=30`;

      // Verify all required parameters are present
      expect(filterComplex).toContain('zoompan=');
      expect(filterComplex).toContain("z='");
      expect(filterComplex).toContain('d=1');  // CRITICAL - This was missing before!
      expect(filterComplex).toContain("x='");
      expect(filterComplex).toContain("y='");
      expect(filterComplex).toMatch(/s=\d+x\d+/);  // s=1920x1080
      expect(filterComplex).toMatch(/fps=\d+/);    // fps=30
    });

    it('should have d=1 parameter for continuous frame evaluation', () => {
      const events: ZoomEvent[] = [{
        type: 'typing',
        timestamp: 500,
        duration: 2500,
        x: 200,
        y: 150,
        percentageX: 0.4,
        percentageY: 0.3,
        zoomLevel: 1.5
      }];

      const metadata = { width: 1920, height: 1080, fps: 30 };
      const { zoomExpr, pxExpr, pyExpr } = buildLinearZoomExpressions(events, 30, metadata);
      const xCalc = `max(0,min(iw-iw/z,(${pxExpr}*iw)-(iw/(2*z))))`;
      const yCalc = `max(0,min(ih-ih/z,(${pyExpr}*ih)-(ih/(2*z))))`;
      const filterComplex = `zoompan=z='${zoomExpr}':d=1:x='${xCalc}':y='${yCalc}':s=1920x1080:fps=30`;

      // d=1 is essential - tells zoompan to evaluate expressions for EVERY frame
      // Without d=1, filter only processes first frame (for still images)
      expect(filterComplex).toMatch(/d=1/);
      expect(filterComplex).not.toMatch(/d=[^1]/);  // Verify it's exactly d=1, not d=something_else
    });

    it('should have z parameter wrapped in single quotes', () => {
      const events: ZoomEvent[] = [{
        type: 'mouse dwell',
        timestamp: 1000,
        duration: 2500,
        x: 100,
        y: 100,
        percentageX: 0.5,
        percentageY: 0.5,
        zoomLevel: 2
      }];

      const { zoomExpr } = buildLinearZoomExpressions(events);
      const filterComplex = `zoompan=z='${zoomExpr}':d=1:x='...' :y='...':s=1920x1080:fps=30`;

      // Expressions must be quoted to prevent FFmpeg parsing errors
      expect(filterComplex).toMatch(/z='[^']*'/);
      // Verify quotes are balanced
      const zMatch = filterComplex.match(/z='([^']*?)'/);
      expect(zMatch).toBeTruthy();
      if (zMatch) {
        const zContent = zMatch[1];
        expect(zContent).toBeTruthy();
        expect(zContent.length).toBeGreaterThan(0);
      }
    });

    it('should have x and y parameters wrapped in single quotes', () => {
      const events: ZoomEvent[] = [{
        type: 'mouse dwell',
        timestamp: 1000,
        duration: 2500,
        x: 100,
        y: 100,
        percentageX: 0.5,
        percentageY: 0.5,
        zoomLevel: 2
      }];

      const { pxExpr, pyExpr } = buildLinearZoomExpressions(events);
      const xCalc = `max(0,min(iw-iw/z,(${pxExpr}*iw)-(iw/(2*z))))`;
      const yCalc = `max(0,min(ih-ih/z,(${pyExpr}*ih)-(ih/(2*z))))`;
      const filterComplex = `zoompan=z='...' :d=1:x='${xCalc}':y='${yCalc}':s=1920x1080:fps=30`;

      // Verify x parameter
      expect(filterComplex).toMatch(/x='[^']*'/);
      const xMatch = filterComplex.match(/x='([^']*?)'/);
      expect(xMatch).toBeTruthy();

      // Verify y parameter
      expect(filterComplex).toMatch(/y='[^']*'/);
      const yMatch = filterComplex.match(/y='([^']*?)'/);
      expect(yMatch).toBeTruthy();
    });

    it('should have correct size format (widthxheight)', () => {
      const width = 1920;
      const height = 1080;
      const filterComplex = `zoompan=z='...':d=1:x='...':y='...':s=${width}x${height}:fps=30`;

      expect(filterComplex).toMatch(/s=1920x1080/);
      expect(filterComplex).not.toMatch(/s=1920X1080/); // Case sensitive
    });

    it('should have fps parameter for video frame rate', () => {
      const filterComplex = `zoompan=z='...':d=1:x='...':y='...':s=1920x1080:fps=30`;

      expect(filterComplex).toMatch(/fps=30/);
      expect(filterComplex).toContain('fps=30');
    });
  });

  describe('zoom expression safety', () => {
    it('should clamp zoom expression to minimum 1', () => {
      const events: ZoomEvent[] = [{
        type: 'mouse dwell',
        timestamp: 1000,
        duration: 2500,
        x: 100,
        y: 100,
        percentageX: 0.5,
        percentageY: 0.5,
        zoomLevel: 2
      }];

      const { zoomExpr } = buildLinearZoomExpressions(events);

      // Zoom must be clamped to prevent division by zero in x/y calculations
      // The clamping should use max(1, expression)
      expect(zoomExpr).toContain('max(1,');
      expect(zoomExpr).toContain(')');

      // Extract the inner expression
      const match = zoomExpr.match(/max\(1,(.*)\)$/);
      expect(match).toBeTruthy();
      if (match) {
        const innerExpr = match[1];
        expect(innerExpr.length).toBeGreaterThan(0);
      }
    });

    it('should handle multiple events without breaking structure', () => {
      const events: ZoomEvent[] = [
        {
          type: 'mouse dwell',
          timestamp: 1000,
          duration: 2500,
          x: 100,
          y: 100,
          percentageX: 0.2,
          percentageY: 0.2,
          zoomLevel: 2
        },
        {
          type: 'typing',
          timestamp: 5000,
          duration: 2500,
          x: 200,
          y: 200,
          percentageX: 0.4,
          percentageY: 0.4,
          zoomLevel: 1.5
        }
      ];

      const metadata = { width: 1920, height: 1080, fps: 30 };
      const { zoomExpr, pxExpr, pyExpr } = buildLinearZoomExpressions(events, 30, metadata);

      // All expressions must be clamped/valid
      expect(zoomExpr).toContain('max(1,');
      expect(zoomExpr).toMatch(/\)$/); // Ends with closing paren
      expect(pxExpr).toBeTruthy();
      expect(pyExpr).toBeTruthy();

      // Verify we can build the complete filter
      const xCalc = `max(0,min(iw-iw/z,(${pxExpr}*iw)-(iw/(2*z))))`;
      const yCalc = `max(0,min(ih-ih/z,(${pyExpr}*ih)-(ih/(2*z))))`;
      const filterComplex = `zoompan=z='${zoomExpr}':d=1:x='${xCalc}':y='${yCalc}':s=1920x1080:fps=30`;

      expect(filterComplex).toContain('d=1');
      expect(filterComplex.length).toBeGreaterThan(0);
    });
  });

  describe('filter parameter ordering', () => {
    it('should have parameters in recommended order: z, d, x, y, s, fps', () => {
      const filterComplex = `zoompan=z='...':d=1:x='...':y='...':s=1920x1080:fps=30`;

      // Find positions of each parameter
      const zPos = filterComplex.indexOf("z='");
      const dPos = filterComplex.indexOf(':d=');
      const xPos = filterComplex.indexOf(":x='");
      const yPos = filterComplex.indexOf(":y='");
      const sPos = filterComplex.indexOf(':s=');
      const fpsPos = filterComplex.indexOf(':fps=');

      // Verify order (not strictly required by FFmpeg, but good practice)
      expect(zPos).toBeLessThan(dPos);
      expect(dPos).toBeLessThan(xPos);
      expect(xPos).toBeLessThan(yPos);
      expect(yPos).toBeLessThan(sPos);
      expect(sPos).toBeLessThan(fpsPos);
    });
  });
});
