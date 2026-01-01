import { ZoomEvent, CaptureSourceInfo, VideoMetadata } from '@/types';

/**
 * Normalize event coordinates from screen space to video space.
 *
 * CRITICAL FIX: The original implementation incorrectly divided screen coordinates
 * by video dimensions. This function properly:
 * 1. Converts screen coordinates to source-relative coordinates
 * 2. Normalizes to [0, 1] based on source dimensions
 * 3. Clamps to valid range to prevent out-of-bounds zooming
 *
 * @param events - Zoom events with screen coordinates
 * @param sourceInfo - Capture source bounds (x, y, width, height)
 * @param videoMetadata - Video dimensions from ffprobe
 * @returns Events with corrected percentageX and percentageY
 *
 * @example
 * // Screen source at (0,0) with 1920x1080 resolution
 * // Event at absolute screen position (500, 400)
 * const sourceInfo = { x: 0, y: 0, width: 1920, height: 1080 };
 * const result = normalizeEventCoordinates([event], sourceInfo, metadata);
 * // result[0].percentageX = 500/1920 ≈ 0.26
 * // result[0].percentageY = 400/1080 ≈ 0.37
 *
 * @example
 * // Window source at screen position (100, 50) with 800x600 size
 * // Event at absolute screen position (300, 200)
 * const sourceInfo = { x: 100, y: 50, width: 800, height: 600 };
 * const result = normalizeEventCoordinates([event], sourceInfo, metadata);
 * // Event relative to source: (300-100=200, 200-50=150)
 * // Percentages: 200/800=0.25, 150/600=0.25
 */
export function normalizeEventCoordinates(
  events: ZoomEvent[],
  sourceInfo: CaptureSourceInfo,
  _videoMetadata: VideoMetadata
): ZoomEvent[] {
  return events.map(event => {
    // Step 1: Convert absolute screen coordinates to source-relative coordinates
    const relativeX = event.x - sourceInfo.x;
    const relativeY = event.y - sourceInfo.y;

    // Step 2: Normalize to [0, 1] based on source dimensions
    const percentageX = relativeX / sourceInfo.width;
    const percentageY = relativeY / sourceInfo.height;

    // Step 3: Clamp to [0, 1] to prevent out-of-bounds zooming
    const clampedX = Math.max(0, Math.min(1, percentageX));
    const clampedY = Math.max(0, Math.min(1, percentageY));

    // Step 4: Round to 1 decimal place to reduce expression complexity
    // High-precision decimals (e.g., 0.6692708333) bloat the FFmpeg expressions
    // Rounding to 0.7 reduces the expression string by ~85%
    const roundedX = Math.round(clampedX * 10) / 10;
    const roundedY = Math.round(clampedY * 10) / 10;

    return {
      ...event,
      percentageX: roundedX,
      percentageY: roundedY
    };
  });
}

/**
 * Validate that coordinates are within expected bounds.
 * Useful for debugging coordinate transformation issues.
 */
export function validateCoordinates(
  events: ZoomEvent[],
  sourceInfo: CaptureSourceInfo
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const relativeX = event.x - sourceInfo.x;
    const relativeY = event.y - sourceInfo.y;

    if (relativeX < 0 || relativeX > sourceInfo.width) {
      warnings.push(
        `Event ${i}: X coordinate ${event.x} is outside source bounds ` +
        `(source x: ${sourceInfo.x}, width: ${sourceInfo.width})`
      );
    }

    if (relativeY < 0 || relativeY > sourceInfo.height) {
      warnings.push(
        `Event ${i}: Y coordinate ${event.y} is outside source bounds ` +
        `(source y: ${sourceInfo.y}, height: ${sourceInfo.height})`
      );
    }
  }

  return {
    valid: warnings.length === 0,
    warnings
  };
}

/**
 * Get capture source info for a screen display.
 * Handles different display configurations on Windows/macOS/Linux.
 */
export function getScreenSourceInfo(_displayId = 'primary'): CaptureSourceInfo {
  // This would be called from the renderer with display info from desktopCapturer
  // For now, return a placeholder - will be populated by renderer
  return {
    x: 0,
    y: 0,
    width: 1920,
    height: 1080
  };
}

/**
 * Get capture source info for a window.
 * Requires window bounds from desktopCapturer or Electron APIs.
 */
export function getWindowSourceInfo(bounds: { x: number; y: number; width: number; height: number }): CaptureSourceInfo {
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height
  };
}
