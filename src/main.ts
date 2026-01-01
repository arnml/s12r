import { app, BrowserWindow, ipcMain, desktopCapturer, Menu, screen } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { ZoomEvent, CaptureSourceInfo, AppSettings } from '@/types';
import fs from 'node:fs';
import os from 'node:os';
import { processVideoWithFFmpeg } from '@/services/video-processing';
import { settingsStore } from '@/services/settings-store';

// Configure ffmpeg and ffprobe to use the bundled binaries
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

import { uIOhook } from 'uiohook-napi';

let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;

// Current settings (loaded from settingsStore on startup)
let currentSettings: AppSettings = settingsStore.get();

// Event Tracking State
let isRecording = false;
let lastMousePos = { x: 0, y: 0 };
let dwellStartTime: number | null = null;
let isDwelling = false;

let lastKeyPressTime = 0;
let typingStartTime: number | null = null;
let isTyping = false;

function handleDwellDetection(window: BrowserWindow, cursor: Electron.Point, now: number) {
  const dist = Math.sqrt(Math.pow(cursor.x - lastMousePos.x, 2) + Math.pow(cursor.y - lastMousePos.y, 2));

  if (dist < currentSettings.dwellThresholdPx) {
    if (!dwellStartTime) {
      dwellStartTime = now;
    } else if (now - dwellStartTime > currentSettings.dwellTimeMs && !isDwelling) {
      isDwelling = true;
      window.webContents.send('focus-event-start', {
        type: 'dwell',
        x: cursor.x,
        y: cursor.y
      });
    }
  } else {
    dwellStartTime = null;
    if (isDwelling) {
      isDwelling = false;
      window.webContents.send('focus-event-end', { type: 'dwell' });
    }
    lastMousePos = cursor;
  }
}

function handleTypingDetection(window: BrowserWindow, cursor: Electron.Point, now: number) {
  if (now - lastKeyPressTime < currentSettings.typingGapMs) {
    if (typingStartTime && now - typingStartTime > currentSettings.typingTriggerMs && !isTyping) {
      isTyping = true;
      window.webContents.send('focus-event-start', {
        type: 'typing',
        x: cursor.x,
        y: cursor.y
      });
    }
  } else {
    typingStartTime = null;
    if (isTyping) {
      isTyping = false;
      window.webContents.send('focus-event-end', { type: 'typing' });
    }
  }
}

function setupEventTracking(window: BrowserWindow) {
  // Start uiohook
  uIOhook.on('keydown', () => {
    lastKeyPressTime = Date.now();
    if (!typingStartTime) {
      typingStartTime = lastKeyPressTime;
    }
  });
  uIOhook.start();

  // Polling Loop
  setInterval(() => {
    if (!window || window.isDestroyed() || !isRecording) return;

    const cursor = screen.getCursorScreenPoint();
    const now = Date.now();
    const bounds = window.getBounds();

    handleDwellDetection(window, cursor, now, bounds);
    handleTypingDetection(window, cursor, now);

  }, 100);
}

// IPC Handlers for recording state
ipcMain.on('recording-started', () => {
  isRecording = true;
  // Reset tracking state
  lastMousePos = { x: 0, y: 0 };
  dwellStartTime = null;
  isDwelling = false;
  lastKeyPressTime = 0;
  typingStartTime = null;
  isTyping = false;
  console.log('Event tracking started');
});

ipcMain.on('recording-stopped', () => {
  isRecording = false;
  // Clear any active events
  if (isDwelling) {
    isDwelling = false;
    mainWindow?.webContents.send('focus-event-end', { type: 'dwell' });
  }
  if (isTyping) {
    isTyping = false;
    mainWindow?.webContents.send('focus-event-end', { type: 'typing' });
  }
  console.log('Event tracking stopped');
});

// IPC Handler for video sources
ipcMain.handle('get-sources', async () => {
  return await desktopCapturer.getSources({ types: ['window', 'screen'] });
});

ipcMain.on('show-context-menu', (_event, options: Array<{ name: string; id: string }>) => {
  const template = options.map((option) => {
    return {
      label: option.name,
      click: () => {
        _event.sender.send('source-id-selected', option.id);
      },
    };
  });

  const menu = Menu.buildFromTemplate(template);
  menu.popup();
});

// IPC Handler to save video and process with FFmpeg
ipcMain.on('save-and-process-video', async (_event, { videoData, events, sourceInfo }: { videoData: ArrayBuffer, events: ZoomEvent[], sourceInfo: CaptureSourceInfo }) => {
  console.log('Received video data, size:', videoData.byteLength);
  console.log('Events:', events);
  console.log('Source info:', sourceInfo);

  // Show save dialog to let user choose output location
  const { dialog } = require('electron');
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: 'Save Processed Video',
    defaultPath: path.join(os.homedir(), 'Desktop', 'screen-recording.mp4'),
    filters: [
      { name: 'MP4 Videos', extensions: ['mp4'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled) {
    console.log('User canceled save dialog');
    mainWindow?.webContents.send('video-error', {
      error: 'Save canceled by user',
      filePath: ''
    });
    return;
  }

  const outputPath = result.filePath!;
  console.log('User selected output path:', outputPath);

  // Save video to temp directory first
  const tempDir = os.tmpdir();
  const timestamp = Date.now();
  const filePath = path.join(tempDir, `recording-${timestamp}.webm`);

  const buffer = Buffer.from(videoData);
  fs.writeFileSync(filePath, buffer);
  console.log('Video saved to:', filePath);

  if (!events || events.length === 0) {
    console.log('No events to process, copying original video to output location.');
    fs.copyFileSync(filePath, outputPath);
    mainWindow?.webContents.send('video-processed', outputPath);
    return;
  }

  // Process with FFmpeg using modularized pipeline with current settings
  await processVideoWithFFmpeg(filePath, events, sourceInfo, mainWindow, outputPath, currentSettings);
});

// IPC Handlers for settings management
ipcMain.handle('settings-get', () => {
  return currentSettings;
});

ipcMain.handle('settings-save', (_event, settings: AppSettings) => {
  try {
    // Validate settings
    const validation = settingsStore.validate(settings);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }

    // Save settings
    currentSettings = settingsStore.set(settings);

    // Notify main window of settings change
    mainWindow?.webContents.send('settings-updated', currentSettings);

    console.log('Settings saved successfully');
    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Error saving settings:', errorMsg);
    return { success: false, errors: [errorMsg] };
  }
});

ipcMain.handle('settings-reset', () => {
  try {
    currentSettings = settingsStore.reset();

    // Notify main window of settings change
    mainWindow?.webContents.send('settings-updated', currentSettings);

    console.log('Settings reset to defaults');
    return currentSettings;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Error resetting settings:', errorMsg);
    throw error;
  }
});

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();

  // Setup Tracking
  setupEventTracking(mainWindow);
};


// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
