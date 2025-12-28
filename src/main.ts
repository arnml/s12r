import { app, BrowserWindow, ipcMain, desktopCapturer, Menu, screen } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { ZoomEvent } from './interfaces';
import fs from 'node:fs';
import os from 'node:os';

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

// Event Tracking State
let isRecording = false;
let lastMousePos = { x: 0, y: 0 };
let dwellStartTime: number | null = null;
let isDwelling = false;

let lastKeyPressTime = 0;
let typingStartTime: number | null = null;
let isTyping = false;

// Constants
const DWELL_THRESHOLD_PX = 20;
const DWELL_TIME_MS = 1000;
const TYPING_GAP_MS = 1000;
const TYPING_TRIGGER_MS = 2000;

function handleDwellDetection(window: BrowserWindow, cursor: Electron.Point, now: number, bounds: Electron.Rectangle) {
  const dist = Math.sqrt(Math.pow(cursor.x - lastMousePos.x, 2) + Math.pow(cursor.y - lastMousePos.y, 2));

  if (dist < DWELL_THRESHOLD_PX) {
    if (!dwellStartTime) {
      dwellStartTime = now;
    } else if (now - dwellStartTime > DWELL_TIME_MS && !isDwelling) {
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
  if (now - lastKeyPressTime < TYPING_GAP_MS) {
    if (typingStartTime && now - typingStartTime > TYPING_TRIGGER_MS && !isTyping) {
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
  uIOhook.on('keydown', (e: any) => {
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

ipcMain.on('show-context-menu', (event, options) => {
  const template = options.map((option: any) => {
    return {
      label: option.name,
      click: () => {
        event.sender.send('source-id-selected', option.id);
      },
    };
  });

  const menu = Menu.buildFromTemplate(template);
  menu.popup();
});

// IPC Handler to save video and process with FFmpeg
ipcMain.on('save-and-process-video', async (event, { videoData, events }: { videoData: ArrayBuffer, events: ZoomEvent[] }) => {
  console.log('Received video data, size:', videoData.byteLength);
  console.log('Events:', events);

  // Save video to temp directory
  const tempDir = os.tmpdir();
  const timestamp = Date.now();
  const filePath = path.join(tempDir, `recording-${timestamp}.webm`);
  
  const buffer = Buffer.from(videoData);
  fs.writeFileSync(filePath, buffer);
  console.log('Video saved to:', filePath);

  if (!events || events.length === 0) {
    console.log('No events to process, skipping FFmpeg.');
    mainWindow?.webContents.send('video-saved', filePath);
    return;
  }

  // Process with FFmpeg
  processVideoWithFFmpeg(filePath, events);
});

// FFmpeg Processing Logic
function processVideoWithFFmpeg(filePath: string, events: ZoomEvent[]) {
  console.log('Processing video with FFmpeg:', filePath);
  console.log('Events:', events);

  const outputFilePath = filePath.replace('.webm', '-zoomed.mp4');

  // First, use ffprobe to get video dimensions
  ffmpeg.ffprobe(filePath, (err, metadata) => {
    if (err) {
      console.error('Error probing video:', err);
      mainWindow?.webContents.send('video-error', {
        error: `Failed to read video metadata: ${err.message}`,
        filePath: outputFilePath
      });
      return;
    }

    // Extract video dimensions
    const videoStream = metadata.streams.find(s => s.codec_type === 'video');
    if (!videoStream?.width || !videoStream?.height) {
      console.error('Could not find video dimensions');
      mainWindow?.webContents.send('video-error', {
        error: 'Could not detect video dimensions',
        filePath: outputFilePath
      });
      return;
    }

    const width = videoStream.width;
    const height = videoStream.height;
    console.log(`Detected video dimensions: ${width}x${height}`);

    // Sort events by timestamp
    events.sort((a, b) => a.timestamp - b.timestamp);

    // Calculate percentages relative to video dimensions (not window bounds)
    for (const event of events) {
      event.percentageX = event.x / width;
      event.percentageY = event.y / height;
      // Clamp to valid range
      event.percentageX = Math.max(0, Math.min(1, event.percentageX));
      event.percentageY = Math.max(0, Math.min(1, event.percentageY));
    }

    // Merge overlapping events
    const mergedEvents = mergeOverlappingEvents(events);
    console.log('Merged events:', mergedEvents);

    // Build smooth zoom expressions
    const { zoomExpr, pxExpr, pyExpr } = buildSmoothZoomExpressions(mergedEvents);

    const command = ffmpeg(filePath);

    // Use dynamic x and y calculation based on zoom (z) and center percentage (px, py)
    // This ensures x and y are always valid for the current zoom level
    // x = (px * iw) - (iw / (2 * z))
    // clamped to [0, iw - iw/z]
    const xCalc = `max(0,min(iw-iw/z,(${pxExpr}*iw)-(iw/(2*z))))`;
    const yCalc = `max(0,min(ih-ih/z,(${pyExpr}*ih)-(ih/(2*z))))`;

    // Note: d=1 is removed as it causes issues for video input (it sets duration per frame to 1s)
    const filterComplex = `zoompan=z='${zoomExpr}':x='${xCalc}':y='${yCalc}':s=${width}x${height}:fps=30`;

    console.log('Filter complex:', filterComplex);

    command
      .videoFilter(filterComplex)
      .output(outputFilePath)
      .on('start', (cmdLine) => {
        console.log('FFmpeg command started:', cmdLine);
      })
      .on('end', () => {
        console.log('Processing finished successfully');
        mainWindow?.webContents.send('video-processed', outputFilePath);
      })
      .on('error', (err) => {
        console.error('Error processing video:', err);
        mainWindow?.webContents.send('video-error', {
          error: err.message,
          filePath: outputFilePath
        });
      })
      .run();
  });
}

// Merge overlapping zoom events
function mergeOverlappingEvents(events: ZoomEvent[]): ZoomEvent[] {
  if (events.length === 0) return [];

  const merged: ZoomEvent[] = [];
  let current = { ...events[0] };

  for (let i = 1; i < events.length; i++) {
    const next = events[i];
    const currentEnd = current.timestamp + current.duration;

    // Check if events overlap
    if (next.timestamp < currentEnd) {
      // Merge: extend duration and average position
      const mergedEndTime = Math.max(currentEnd, next.timestamp + next.duration);
      const duration = mergedEndTime - current.timestamp;

      // Weighted average based on duration
      const currentWeight = current.duration;
      const nextWeight = next.duration;
      const totalWeight = currentWeight + nextWeight;

      current.percentageX = ((current.percentageX || 0.5) * currentWeight + (next.percentageX || 0.5) * nextWeight) / totalWeight;
      current.percentageY = ((current.percentageY || 0.5) * currentWeight + (next.percentageY || 0.5) * nextWeight) / totalWeight;
      current.duration = duration;
      current.zoomLevel = Math.max(current.zoomLevel, next.zoomLevel);
      current.merged = true;
    } else {
      // No overlap, save current and start new
      merged.push(current);
      current = { ...next };
    }
  }
  merged.push(current);
  return merged;
}

// Build smooth zoom expressions with ease-in-out transitions
function buildSmoothZoomExpressions(events: ZoomEvent[]) {
  const TRANSITION_MS = 500; // 0.5s ramp in/out
  const TRANSITION_S = TRANSITION_MS / 1000;

  // Helper: smoothstep easing function
  const smoothstep = (t: string): string => {
    return `(${t})*(${t})*(3-2*(${t}))`;
  };

  // Helper: build interpolation expression
  const interpolate = (start: string, end: string, progress: string): string => {
    const smoothProgress = smoothstep(progress);
    return `${start}+(${end}-(${start}))*${smoothProgress}`;
  };

  let zoomExpr = '1';
  let pxExpr = '0.5';
  let pyExpr = '0.5';

  // Filter out very short events (less than 0.2s) to avoid glitches
  const validEvents = events.filter(e => e.duration >= 200);

  // Build expressions for each merged event
  for (let i = validEvents.length - 1; i >= 0; i--) {
    const e = validEvents[i];
    const startTime = (e.timestamp / 1000).toFixed(3);
    const endTime = ((e.timestamp + e.duration) / 1000).toFixed(3);
    const eventDurationS = e.duration / 1000;

    // Safe transition timing: ensure we always have room for ramp-in, hold, and ramp-out
    // Use 1/3 of duration for each phase, capped at 0.5s
    const transitionS = Math.min(TRANSITION_S, eventDurationS / 3);
    const transitionSStr = transitionS.toFixed(3);

    const rampInEnd = (parseFloat(startTime) + transitionS).toFixed(3);
    const rampOutStart = (parseFloat(endTime) - transitionS).toFixed(3);

    const targetZoom = e.zoomLevel;
    const targetPx = (e.percentageX || 0.5).toFixed(3);
    const targetPy = (e.percentageY || 0.5).toFixed(3);

    // Center position (no zoom) - px=0.5, py=0.5
    const centerPx = '0.5';
    const centerPy = '0.5';

    // Build conditional for this event with three phases: ramp-in, hold, ramp-out
    const rampInProgress = `(in_time-${startTime})/${transitionSStr}`;
    const rampOutProgress = `(in_time-${rampOutStart})/${transitionSStr}`;

    // Zoom expression
    const zoomRampIn = interpolate('1', `${targetZoom}`, rampInProgress);
    const zoomHold = `${targetZoom}`;
    const zoomRampOut = interpolate(`${targetZoom}`, '1', rampOutProgress);

    const newZoomExpr =
      `if(between(in_time,${startTime},${rampInEnd}),${zoomRampIn},` +
      `if(between(in_time,${rampInEnd},${rampOutStart}),${zoomHold},` +
      `if(between(in_time,${rampOutStart},${endTime}),${zoomRampOut},` +
      `${zoomExpr})))`;

    // Px expression (center X percentage)
    const pxRampIn = interpolate(centerPx, targetPx, rampInProgress);
    const pxHold = targetPx;
    const pxRampOut = interpolate(targetPx, centerPx, rampOutProgress);

    const newPxExpr =
      `if(between(in_time,${startTime},${rampInEnd}),${pxRampIn},` +
      `if(between(in_time,${rampInEnd},${rampOutStart}),${pxHold},` +
      `if(between(in_time,${rampOutStart},${endTime}),${pxRampOut},` +
      `${pxExpr})))`;

    // Py expression (center Y percentage)
    const pyRampIn = interpolate(centerPy, targetPy, rampInProgress);
    const pyHold = targetPy;
    const pyRampOut = interpolate(targetPy, centerPy, rampOutProgress);

    const newPyExpr =
      `if(between(in_time,${startTime},${rampInEnd}),${pyRampIn},` +
      `if(between(in_time,${rampInEnd},${rampOutStart}),${pyHold},` +
      `if(between(in_time,${rampOutStart},${endTime}),${pyRampOut},` +
      `${pyExpr})))`;

    zoomExpr = newZoomExpr;
    pxExpr = newPxExpr;
    pyExpr = newPyExpr;
  }

  return { zoomExpr, pxExpr, pyExpr };
}

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
