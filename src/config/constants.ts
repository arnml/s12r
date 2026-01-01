/**
 * Application constants and configuration values.
 * Centralized location for all magic numbers and settings.
 */

// Event Detection Constants
export const EVENT_DETECTION = {
  DWELL_THRESHOLD_PX: 20,
  DWELL_TIME_MS: 1000,
  TYPING_GAP_MS: 1000,
  TYPING_TRIGGER_MS: 2000,
  POLLING_INTERVAL_MS: 100,
} as const;

// Video Processing Constants
export const VIDEO_PROCESSING = {
  MIN_EVENT_DURATION_MS: 2000,
  TRANSITION_DURATION_S: 0.5,
  COORDINATE_PRECISION_DECIMALS: 1,
  DEFAULT_FPS: 30,
  DEFAULT_ZOOM_LEVELS: {
    TYPING: 1.5,
    MOUSE_DWELL: 2.0,
  },
} as const;

// FFmpeg Constants
export const FFMPEG = {
  DEFAULT_PRESET: 'medium',
  DEFAULT_PIXEL_FORMAT: 'yuv420p',
  DEFAULT_VIDEO_CODEC: 'libx264',
  DEFAULT_AUDIO_CODEC: 'aac',
  MAX_EXPRESSION_LENGTH: 1000, // Reasonable limit for complex expressions
} as const;

// UI Constants
export const UI = {
  PARTICLE_COUNT: 50,
  DEFAULT_VIDEO_DIMENSIONS: {
    WIDTH: 1920,
    HEIGHT: 1080,
  },
  BORDER_COLORS: {
    TYPING: '#ea4335',
    DWELL: '#4285f4',
    DEFAULT: 'rgba(255, 255, 255, 0.5)',
  },
} as const;

// File System Constants
export const FILE_SYSTEM = {
  TEMP_FILE_PREFIX: 'recording-',
  DEFAULT_OUTPUT_NAME: 'screen-recording.mp4',
  SUPPORTED_FORMATS: {
    INPUT: ['.webm'],
    OUTPUT: ['.mp4'],
  },
} as const;