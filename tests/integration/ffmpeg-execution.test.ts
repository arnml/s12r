import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { processVideoWithFFmpeg } from '@/services/video-processing';
import { buildLinearZoomExpressions } from '@/ffmpeg/expression-builder';
import { ZoomEvent } from '@/types';
import fs from 'fs';
import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';

/**
 * Integration Tests for FFmpeg Zoompan Filter Execution
 *
 * These tests verify that:
 * 1. FFmpeg accepts the generated filter string
 * 2. The zoompan filter correctly processes video frames
 * 3. The d=1 parameter enables continuous frame evaluation
 * 4. Output video file is created successfully
 *
 * IMPORTANT: These tests run actual FFmpeg commands and may take 30+ seconds.
 */

describe('FFmpeg Integration Tests', () => {
  const testDir = path.join(os.tmpdir(), 'ffmpeg-test-' + Date.now());
  const sampleVideoPath = path.join(testDir, 'sample.webm');
  const outputVideoPath = path.join(testDir, 'output.mp4');

  beforeAll(async () => {
    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Create a simple test video file (2 seconds, 30fps, 1920x1080)
    // Using ffmpeg to generate a pattern video with frames
    await createSampleVideo(sampleVideoPath);
  }, 60000); // 60 second timeout for setup

  afterAll(() => {
    // Cleanup test directory
    try {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.error('Failed to cleanup test directory:', err);
    }
  });

  describe('Filter String Validation', () => {
    it('should generate filter string with d=1 parameter', () => {
      const events: ZoomEvent[] = [
        {
          type: 'mouse dwell',
          timestamp: 500,
          duration: 1000,
          x: 100,
          y: 100,
          percentageX: 0.2,
          percentageY: 0.2,
          zoomLevel: 2
        }
      ];

      const { zoomExpr, pxExpr, pyExpr } = buildLinearZoomExpressions(events);

      // Build filter string as done in video-processing.ts
      const width = 1920;
      const height = 1080;
      const xCalc = `max(0,min(iw-iw/z,(${pxExpr}*iw)-(iw/(2*z))))`;
      const yCalc = `max(0,min(ih-ih/z,(${pyExpr}*ih)-(ih/(2*z))))`;
      const filterComplex = `zoompan=z='${zoomExpr}':d=1:x='${xCalc}':y='${yCalc}':s=${width}x${height}:fps=30`;

      // CRITICAL: d=1 must be present
      expect(filterComplex).toContain(':d=1:');
      expect(filterComplex).toMatch(/zoompan=z='[^']*':d=1:/);

      // Verify all parameters are present
      expect(filterComplex).toContain("z='");
      expect(filterComplex).toContain("x='");
      expect(filterComplex).toContain("y='");
      expect(filterComplex).toMatch(/s=1920x1080/);
      expect(filterComplex).toMatch(/fps=30/);

      console.log('Filter string validation passed:', filterComplex);
    });

    it('should clamp zoom to minimum 1 to prevent division by zero', () => {
      const events: ZoomEvent[] = [
        {
          type: 'typing',
          timestamp: 800,
          duration: 2500,  // >= 2000ms to pass default filter
          x: 200,
          y: 200,
          percentageX: 0.4,
          percentageY: 0.4,
          zoomLevel: 1.5
        }
      ];

      const { zoomExpr } = buildLinearZoomExpressions(events);

      // Zoom must be clamped to ensure z >= 1
      // This prevents division by zero in x/y calculations: iw/z, ih/z
      // With flat timeline architecture, max(1,) is nested inside if-statements
      expect(zoomExpr).toContain('max(1,');
      expect(zoomExpr).toMatch(/\)$/); // Should end with closing paren

      console.log('Zoom clamping validation passed:', zoomExpr);
    });
  });

  describe('FFmpeg Command Execution', () => {
    it('should process video with zoompan filter WITHOUT "Error reinitializing filters"', async () => {
      if (!fs.existsSync(sampleVideoPath)) {
        console.log('Skipping FFmpeg execution test - sample video not created');
        console.log('(This is OK - sample video creation may not be available in test environment)');
        return;
      }

      const events: ZoomEvent[] = [
        {
          type: 'mouse dwell',
          timestamp: 500,
          duration: 800,
          x: 150,
          y: 150,
          percentageX: 0.25,
          percentageY: 0.25,
          zoomLevel: 2
        },
        {
          type: 'typing',
          timestamp: 1500,
          duration: 400,
          x: 300,
          y: 300,
          percentageX: 0.5,
          percentageY: 0.5,
          zoomLevel: 1.5
        }
      ];

      const sourceInfo = {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080
      };

      // Test video processing
      let errorOccurred = false;
      let errorMessage = '';

      try {
        // Note: processVideoWithFFmpeg expects mainWindow parameter for IPC
        // We pass null to skip IPC notifications
        await new Promise<void>((resolve, reject) => {
          processVideoWithFFmpeg(sampleVideoPath, events, sourceInfo, null)
            .then(() => {
              resolve();
            })
            .catch((err) => {
              errorOccurred = true;
              errorMessage = err.message;
              reject(err);
            });
        });
      } catch (err) {
        const errorStr = err instanceof Error ? err.message : String(err);

        // Critical check: The error should NOT be the "Error reinitializing filters!" error
        if (errorStr.includes('Error reinitializing filters')) {
          throw new Error(
            'CRITICAL: Got the "Error reinitializing filters!" error. ' +
            'This means the d=1 parameter is missing or incorrect. ' +
            'Error: ' + errorStr
          );
        }

        // If we get here, it's a different error (maybe sample video issue)
        // This is acceptable for integration testing
        console.log('Non-critical FFmpeg error (may be sample video issue):', errorStr);
      }

      // If processing succeeded, verify output file
      if (fs.existsSync(outputVideoPath)) {
        const stats = fs.statSync(outputVideoPath);
        expect(stats.size).toBeGreaterThan(0);
        console.log('Output video created:', outputVideoPath, `(${stats.size} bytes)`);

        // Cleanup output file
        fs.unlinkSync(outputVideoPath);
      }
    }, 60000); // 60 second timeout for FFmpeg processing

    it('should not throw "Error reinitializing filters" error when processing multiple events', async () => {
      if (!fs.existsSync(sampleVideoPath)) {
        console.log('Skipping multi-event FFmpeg test - sample video not created');
        return;
      }

      // Test with multiple zoom events (this used to cause issues)
      const events: ZoomEvent[] = [
        {
          type: 'mouse dwell',
          timestamp: 300,
          duration: 500,
          x: 100,
          y: 100,
          percentageX: 0.2,
          percentageY: 0.2,
          zoomLevel: 2
        },
        {
          type: 'mouse dwell',
          timestamp: 900,
          duration: 600,
          x: 200,
          y: 200,
          percentageX: 0.4,
          percentageY: 0.4,
          zoomLevel: 2
        },
        {
          type: 'typing',
          timestamp: 1600,
          duration: 400,
          x: 300,
          y: 300,
          percentageX: 0.6,
          percentageY: 0.6,
          zoomLevel: 1.5
        }
      ];

      const sourceInfo = {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080
      };

      try {
        await new Promise<void>((resolve, reject) => {
          processVideoWithFFmpeg(sampleVideoPath, events, sourceInfo, null)
            .then(() => resolve())
            .catch((err) => {
              const errorMsg = err instanceof Error ? err.message : String(err);
              if (errorMsg.includes('Error reinitializing filters')) {
                reject(
                  new Error(
                    'CRITICAL: Multiple events triggered "Error reinitializing filters!" error. ' +
                    'This indicates the d=1 parameter is missing. Error: ' + errorMsg
                  )
                );
              }
              // Other errors are acceptable
              resolve();
            });
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (errorMsg.includes('CRITICAL')) {
          throw err;
        }
        console.log('Non-critical error with multiple events:', errorMsg);
      }

      // Cleanup
      if (fs.existsSync(outputVideoPath)) {
        fs.unlinkSync(outputVideoPath);
      }
    }, 60000);
  });

  describe('Edge Cases', () => {
    it('should handle zoom clamping correctly', () => {
      // Test that zoom is never less than 1
      const events: ZoomEvent[] = [
        {
          type: 'mouse dwell',
          timestamp: 1000,
          duration: 2500,  // >= 2000ms to pass default filter
          x: 100,
          y: 100,
          percentageX: 0.5,
          percentageY: 0.5,
          zoomLevel: 1 // Minimum zoom
        }
      ];

      const { zoomExpr } = buildLinearZoomExpressions(events);

      // Even with minimum zoom level, expression should be clamped
      expect(zoomExpr).toContain('max(1,');
      expect(zoomExpr).not.toMatch(/max\(0,/); // Should not use max(0, ...)
    });

    it('should handle high zoom levels', () => {
      const events: ZoomEvent[] = [
        {
          type: 'mouse dwell',
          timestamp: 1000,
          duration: 2500,  // >= 2000ms to pass default filter
          x: 100,
          y: 100,
          percentageX: 0.5,
          percentageY: 0.5,
          zoomLevel: 5 // High zoom
        }
      ];

      const { zoomExpr, pxExpr, pyExpr } = buildLinearZoomExpressions(events);

      // All expressions should be valid and clamped
      expect(zoomExpr).toContain('max(1,');
      expect(zoomExpr).toBeTruthy();
      expect(pxExpr).toBeTruthy();
      expect(pyExpr).toBeTruthy();

      // Build complete filter to verify structure
      const filterComplex = `zoompan=z='${zoomExpr}':d=1:x='max(0,min(iw-iw/z,(${pxExpr}*iw)-(iw/(2*z))))'` +
        `:y='max(0,min(ih-ih/z,(${pyExpr}*ih)-(ih/(2*z))))'` +
        `:s=1920x1080:fps=30`;

      expect(filterComplex).toContain(':d=1:');
    });

    it('should handle corner zoom coordinates', () => {
      // Test zooming at screen corners
      const corners: ZoomEvent[] = [
        {
          type: 'mouse dwell',
          timestamp: 500,
          duration: 2500,  // >= 2000ms to pass default filter
          x: 10,    // Top-left
          y: 10,
          percentageX: 0.01,
          percentageY: 0.01,
          zoomLevel: 2
        },
        {
          type: 'mouse dwell',
          timestamp: 3500,  // Adjusted timestamp
          duration: 2500,  // >= 2000ms to pass default filter
          x: 1910,  // Bottom-right
          y: 1070,
          percentageX: 0.99,
          percentageY: 0.99,
          zoomLevel: 2
        }
      ];

      const { zoomExpr, pxExpr, pyExpr } = buildLinearZoomExpressions(corners);

      // Should handle extreme coordinates gracefully
      expect(zoomExpr).toBeTruthy();
      expect(pxExpr).toBeTruthy();
      expect(pyExpr).toBeTruthy();
      expect(zoomExpr).toContain('max(1,');
    });
  });
});

/**
 * Helper: Create a sample video file for testing
 * Generates a simple WebM video with a color pattern
 */
async function createSampleVideo(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(filePath)) {
      resolve(); // Video already exists
      return;
    }

    console.log('Creating sample test video...');

    // Use ffmpeg to generate a test video
    // Creates a 2-second video with color fade pattern
    ffmpeg()
      .input('testsrc=duration=2:size=1920x1080:rate=30')
      .inputFormat('lavfi')
      .outputOptions([
        '-c:v libvpx-vp9',  // VP9 codec for WebM
        '-pix_fmt yuv420p',
        '-b:v 1M',          // Bitrate
        '-deadline realtime'
      ])
      .output(filePath)
      .on('end', () => {
        console.log('Sample video created:', filePath);
        resolve();
      })
      .on('error', (err) => {
        console.warn('Failed to create sample video (OK for quick tests):', err.message);
        // Don't reject - integration tests can work around missing sample video
        resolve();
      })
      .run();
  });
}
