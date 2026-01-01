/**
 * Settings Window Renderer
 *
 * Handles form interactions and IPC communication with the main process.
 * Loads current settings, validates user input, and saves changes.
 */

import { ipcRenderer } from 'electron';
import { AppSettings, DEFAULT_SETTINGS } from '@/types/settings';

// Form elements
const form = document.getElementById('settings-form') as HTMLFormElement;
const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
const errorMessage = document.getElementById('error-message') as HTMLDivElement;
const successMessage = document.getElementById('success-message') as HTMLDivElement;

// Form input elements
const inputs = {
  dwellThresholdPx: document.getElementById('dwellThresholdPx') as HTMLInputElement,
  dwellTimeMs: document.getElementById('dwellTimeMs') as HTMLInputElement,
  typingGapMs: document.getElementById('typingGapMs') as HTMLInputElement,
  typingTriggerMs: document.getElementById('typingTriggerMs') as HTMLInputElement,
  typingZoomLevel: document.getElementById('typingZoomLevel') as HTMLInputElement,
  dwellZoomLevel: document.getElementById('dwellZoomLevel') as HTMLInputElement,
  transitionStyle: document.getElementById('transitionStyle') as HTMLSelectElement,
  transitionDurationMs: document.getElementById('transitionDurationMs') as HTMLInputElement,
  minEventDurationMs: document.getElementById('minEventDurationMs') as HTMLInputElement,
};

/**
 * Load current settings from main process and populate form
 */
async function loadSettings() {
  try {
    const settings = await ipcRenderer.invoke('settings-get');
    populateForm(settings);
  } catch (error) {
    console.error('Failed to load settings:', error);
    showError('Failed to load settings. Using defaults.');
    populateForm(DEFAULT_SETTINGS);
  }
}

/**
 * Populate form fields with settings values
 */
function populateForm(settings: AppSettings) {
  inputs.dwellThresholdPx.value = String(settings.dwellThresholdPx);
  inputs.dwellTimeMs.value = String(settings.dwellTimeMs);
  inputs.typingGapMs.value = String(settings.typingGapMs);
  inputs.typingTriggerMs.value = String(settings.typingTriggerMs);
  inputs.typingZoomLevel.value = String(settings.typingZoomLevel);
  inputs.dwellZoomLevel.value = String(settings.dwellZoomLevel);
  inputs.transitionStyle.value = settings.transitionStyle;
  inputs.transitionDurationMs.value = String(settings.transitionDurationMs);
  inputs.minEventDurationMs.value = String(settings.minEventDurationMs);
}

/**
 * Extract form values as AppSettings object
 */
function getFormSettings(): AppSettings {
  return {
    dwellThresholdPx: parseFloat(inputs.dwellThresholdPx.value),
    dwellTimeMs: parseFloat(inputs.dwellTimeMs.value),
    typingGapMs: parseFloat(inputs.typingGapMs.value),
    typingTriggerMs: parseFloat(inputs.typingTriggerMs.value),
    typingZoomLevel: parseFloat(inputs.typingZoomLevel.value),
    dwellZoomLevel: parseFloat(inputs.dwellZoomLevel.value),
    transitionStyle: inputs.transitionStyle.value as 'eased' | 'linear',
    transitionDurationMs: parseFloat(inputs.transitionDurationMs.value),
    minEventDurationMs: parseFloat(inputs.minEventDurationMs.value),
  };
}

/**
 * Show error message to user
 */
function showError(message: string) {
  errorMessage.textContent = message;
  errorMessage.classList.remove('hidden');
  successMessage.classList.add('hidden');
  setTimeout(() => {
    errorMessage.classList.add('hidden');
  }, 5000);
}

/**
 * Show success message to user
 */
function showSuccess(message: string) {
  successMessage.textContent = message;
  successMessage.classList.remove('hidden');
  errorMessage.classList.add('hidden');
  setTimeout(() => {
    successMessage.classList.add('hidden');
  }, 3000);
}

/**
 * Handle form submission - save settings
 */
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const settings = getFormSettings();

  try {
    const result = await ipcRenderer.invoke('settings-save', settings);

    if (result.success) {
      showSuccess('Settings saved successfully!');
    } else {
      showError(`Failed to save settings: ${result.errors.join(', ')}`);
    }
  } catch (error) {
    console.error('Error saving settings:', error);
    showError(`Error saving settings: ${error instanceof Error ? error.message : String(error)}`);
  }
});

/**
 * Handle reset button - restore defaults
 */
resetBtn.addEventListener('click', async () => {
  const confirmed = confirm('Reset all settings to defaults?');
  if (!confirmed) return;

  try {
    const settings = await ipcRenderer.invoke('settings-reset');
    populateForm(settings);
    showSuccess('Settings reset to defaults!');
  } catch (error) {
    console.error('Error resetting settings:', error);
    showError(`Error resetting settings: ${error instanceof Error ? error.message : String(error)}`);
  }
});

// Load settings when window opens
loadSettings();
