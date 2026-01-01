/**
 * Shared application constants
 *
 * Used throughout the application to ensure consistency and reduce duplication.
 */

export { DEFAULT_SETTINGS } from './types/settings';

// FFmpeg processing constants
export const COORDINATE_ROUNDING_DECIMALS = 1;

// Framerate detection constraints
export const FPS_MIN = 1;
export const FPS_MAX = 120;
export const FPS_DEFAULT = 30;

// Event polling frequency (milliseconds)
export const EVENT_POLLING_INTERVAL_MS = 100;
