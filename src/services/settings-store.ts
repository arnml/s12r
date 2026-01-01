/**
 * Settings Store
 *
 * Centralized settings management using electron-store for persistence.
 * Provides validation, defaults, and a singleton pattern for access.
 */

import Store from 'electron-store';
import { AppSettings, DEFAULT_SETTINGS } from '@/types/settings';

/**
 * Validation result indicating whether settings are valid
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * SettingsStore manages persistent application settings
 *
 * - Automatically saves to disk using electron-store
 * - Validates all settings against schema and custom rules
 * - Provides type-safe get/set/reset methods
 * - Singleton pattern for single source of truth
 */
class SettingsStore {
  private store: Store<{ settings: AppSettings }>;

  constructor() {
    this.store = new Store<{ settings: AppSettings }>({
      defaults: {
        settings: DEFAULT_SETTINGS,
      },
      // JSON schema validation
      schema: {
        settings: {
          type: 'object',
          properties: {
            dwellThresholdPx: {
              type: 'number',
              minimum: 5,
              maximum: 100,
              description: 'Mouse dwell threshold in pixels',
            },
            dwellTimeMs: {
              type: 'number',
              minimum: 100,
              maximum: 5000,
              description: 'Time to trigger dwell in milliseconds',
            },
            typingGapMs: {
              type: 'number',
              minimum: 100,
              maximum: 5000,
              description: 'Max gap between keypresses in milliseconds',
            },
            typingTriggerMs: {
              type: 'number',
              minimum: 500,
              maximum: 10000,
              description: 'Duration before typing triggers in milliseconds',
            },
            typingZoomLevel: {
              type: 'number',
              minimum: 1.0,
              maximum: 5.0,
              description: 'Zoom level for typing events',
            },
            dwellZoomLevel: {
              type: 'number',
              minimum: 1.0,
              maximum: 5.0,
              description: 'Zoom level for dwell events',
            },
            transitionStyle: {
              type: 'string',
              enum: ['eased', 'linear'],
              description: 'Transition easing style',
            },
            transitionDurationMs: {
              type: 'number',
              minimum: 100,
              maximum: 2000,
              description: 'Transition duration in milliseconds',
            },
            minEventDurationMs: {
              type: 'number',
              minimum: 0,
              maximum: 10000,
              description: 'Minimum event duration to process in milliseconds',
            },
          },
          required: [
            'dwellThresholdPx',
            'dwellTimeMs',
            'typingGapMs',
            'typingTriggerMs',
            'typingZoomLevel',
            'dwellZoomLevel',
            'transitionStyle',
            'transitionDurationMs',
            'minEventDurationMs',
          ],
        },
      },
    });
  }

  /**
   * Get current settings
   * @returns Current AppSettings
   */
  get(): AppSettings {
    return this.store.get('settings');
  }

  /**
   * Update settings with partial changes
   * @param updates Partial settings to update
   * @returns Updated AppSettings
   * @throws Error if validation fails
   */
  set(updates: Partial<AppSettings>): AppSettings {
    const current = this.get();
    const updated = { ...current, ...updates };

    // Validate before saving
    const validation = this.validate(updated);
    if (!validation.valid) {
      throw new Error(`Settings validation failed: ${validation.errors.join(', ')}`);
    }

    this.store.set('settings', updated);
    return updated;
  }

  /**
   * Reset settings to defaults
   * @returns Default AppSettings
   */
  reset(): AppSettings {
    this.store.set('settings', DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }

  /**
   * Validate settings against schema and custom rules
   * @param settings Settings to validate
   * @returns ValidationResult with any errors
   */
  validate(settings: Partial<AppSettings>): ValidationResult {
    const errors: string[] = [];

    // Validate dwell threshold
    if (settings.dwellThresholdPx !== undefined) {
      if (settings.dwellThresholdPx < 5 || settings.dwellThresholdPx > 100) {
        errors.push('Dwell threshold must be between 5-100 pixels');
      }
    }

    // Validate dwell time
    if (settings.dwellTimeMs !== undefined) {
      if (settings.dwellTimeMs < 100 || settings.dwellTimeMs > 5000) {
        errors.push('Dwell trigger time must be between 100-5000 ms');
      }
    }

    // Validate typing gap
    if (settings.typingGapMs !== undefined) {
      if (settings.typingGapMs < 100 || settings.typingGapMs > 5000) {
        errors.push('Typing gap must be between 100-5000 ms');
      }
    }

    // Validate typing trigger
    if (settings.typingTriggerMs !== undefined) {
      if (settings.typingTriggerMs < 500 || settings.typingTriggerMs > 10000) {
        errors.push('Typing trigger duration must be between 500-10000 ms');
      }
    }

    // Validate zoom levels
    if (settings.typingZoomLevel !== undefined) {
      if (settings.typingZoomLevel < 1.0 || settings.typingZoomLevel > 5.0) {
        errors.push('Typing zoom level must be between 1.0-5.0');
      }
    }

    if (settings.dwellZoomLevel !== undefined) {
      if (settings.dwellZoomLevel < 1.0 || settings.dwellZoomLevel > 5.0) {
        errors.push('Dwell zoom level must be between 1.0-5.0');
      }
    }

    // Validate transition style
    if (settings.transitionStyle !== undefined) {
      if (!['eased', 'linear'].includes(settings.transitionStyle)) {
        errors.push('Transition style must be "eased" or "linear"');
      }
    }

    // Validate transition duration
    if (settings.transitionDurationMs !== undefined) {
      if (settings.transitionDurationMs < 100 || settings.transitionDurationMs > 2000) {
        errors.push('Transition duration must be between 100-2000 ms');
      }
    }

    // Validate min event duration
    if (settings.minEventDurationMs !== undefined) {
      if (settings.minEventDurationMs < 0 || settings.minEventDurationMs > 10000) {
        errors.push('Min event duration must be between 0-10000 ms');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Clear all persisted settings and return to defaults
   * Useful for testing and debugging
   */
  clear(): void {
    this.store.clear();
  }
}

// Singleton instance
export const settingsStore = new SettingsStore();
