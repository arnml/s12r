/**
 * Application Settings
 *
 * Defines the complete configuration for event detection and FFmpeg processing.
 * All settings are persisted via electron-store and have sensible defaults.
 */

export interface AppSettings {
  // Mouse Dwell Detection
  dwellThresholdPx: number; // Radius in pixels: how far mouse can move while dwelling
  dwellTimeMs: number; // Duration in ms: how long mouse must stay still to trigger

  // Typing Detection
  typingGapMs: number; // Max gap between keypresses to count as continuous typing
  typingTriggerMs: number; // Duration in ms: how long typing must continue to trigger

  // Zoom Levels (applied during events)
  typingZoomLevel: number; // Zoom multiplier for typing events (1.0 = no zoom)
  dwellZoomLevel: number; // Zoom multiplier for dwell events

  // Transition Effects (applied during zoom in/out)
  transitionStyle: 'eased' | 'linear'; // Easing function: 'eased' = smoothstep, 'linear' = constant speed
  transitionDurationMs: number; // Duration in ms: how long zoom in/out transitions take

  // Event Filtering (applied to all events before processing)
  minEventDurationMs: number; // Minimum event duration: filter out events shorter than this
}

/**
 * Default settings that preserve current app behavior
 *
 * These values provide cinematic tech tutorial defaults:
 * - dwellThresholdPx: 20 (from DWELL_THRESHOLD_PX in main.ts)
 * - dwellTimeMs: 1000 (from DWELL_TIME_MS in main.ts)
 * - typingGapMs: 1000 (from TYPING_GAP_MS in main.ts)
 * - typingTriggerMs: 2000 (from TYPING_TRIGGER_MS in main.ts)
 * - typingZoomLevel: 2.5 (more dramatic for typing visibility)
 * - dwellZoomLevel: 3.0 (stronger emphasis on dwell events)
 * - transitionStyle: 'eased' (smooth, professional animations)
 * - transitionDurationMs: 500 (standard cinematic transition speed)
 * - minEventDurationMs: 2000 (filter out brief interactions)
 */
export const DEFAULT_SETTINGS: AppSettings = {
  dwellThresholdPx: 20,
  dwellTimeMs: 1000,
  typingGapMs: 1000,
  typingTriggerMs: 2000,
  typingZoomLevel: 2.5,
  dwellZoomLevel: 3.0,
  transitionStyle: 'eased',
  transitionDurationMs: 500,
  minEventDurationMs: 2000,
};
