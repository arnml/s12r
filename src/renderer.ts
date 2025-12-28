/**
 * This file will automatically be loaded by vite and run in the "renderer" context.
 * To learn more about the differences between the "main" and the "renderer" context in
 * Electron, visit:
 *
 * https://electronjs.org/docs/tutorial/process-model
 *
 * By default, Node.js integration in this file is disabled. When enabling Node.js integration
 * in a renderer process, please be aware of potential security implications. You can read
 * more about security risks here:
 *
 * https://electronjs.org/docs/tutorial/security
 *
 * To enable Node.js integration in this file, open up `main.ts` and enable the `nodeIntegration`
 * flag:
 *
 * ```
 *  // Create the browser window.
 *  mainWindow = new BrowserWindow({
 *    width: 800,
 *    height: 600,
 *    webPreferences: {
 *      nodeIntegration: true
 *    }
 *  });
 * ```
 */

import './index.css';
import { ZoomEvent, FocusEventPayload } from './interfaces';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ipcRenderer } = require('electron');

const videoElement = document.querySelector('video');
const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;
const videoSelectBtn = document.getElementById('videoSelectBtn') as HTMLButtonElement;
let mediaRecorder: MediaRecorder;
const recordedChunks: any[] = [];
videoSelectBtn.onclick = getVideoSources;

// Event tracking
let recordedEvents: ZoomEvent[] = [];
let recordingStartTime: number | null = null;
const activeEvents: Map<string, { startTime: number, payload: FocusEventPayload }> = new Map();

// Get the available video sources
async function getVideoSources() {
  const inputSources = await ipcRenderer.invoke('get-sources');

  const options = inputSources.map((source: any) => ({
    name: source.name,
    id: source.id
  }));

  ipcRenderer.send('show-context-menu', options);
}

ipcRenderer.on('source-id-selected', async (event: any, sourceId: string) => {
  videoSelectBtn.innerText = 'Source Selected';
  startBtn.disabled = false;

  const constraints = {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId
      }
    }
  } as any; // Cast to any to avoid TS errors with mandatory

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = handleDataAvailable;
  mediaRecorder.onstop = handleStop;

  videoElement.srcObject = stream;
  videoElement.play();
});

// start button logic
startBtn.onclick = e => {
  mediaRecorder.start();
  startBtn.classList.add('is-recording');
  startBtn.innerText = 'Recording';
  startBtn.disabled = true;
  stopBtn.disabled = false;
  document.body.classList.add('recording');
  
  // Reset event tracking
  recordedEvents = [];
  activeEvents.clear();
  recordingStartTime = Date.now();
  
  // Notify main process to start event tracking
  ipcRenderer.send('recording-started');
};

// stop button logic
stopBtn.onclick = e => {
  // Notify main process to stop event tracking FIRST
  ipcRenderer.send('recording-stopped');
  
  mediaRecorder.stop();
  startBtn.classList.remove('is-recording');
  startBtn.innerText = 'Start Recording';
  startBtn.disabled = false;
  stopBtn.disabled = true;
  document.body.classList.remove('recording');
  
  // Close any active events
  for (const [, event] of activeEvents.entries()) {
    const duration = Date.now() - event.startTime;
    const timestamp = recordingStartTime === null ? 0 : event.startTime - recordingStartTime;
    const eventType = event.payload.type === 'dwell' ? 'mouse dwell' : 'typing';
    recordedEvents.push({
      type: eventType,
      timestamp: timestamp,
      duration: duration,
      x: event.payload.x,
      y: event.payload.y,
      zoomLevel: eventType === 'typing' ? 1.5 : 2.0 // Typing: 1.5x, Dwell: 2.0x
    });
  }
  activeEvents.clear();
};


// capture all recorded chunks
function handleDataAvailable(e: any) {
  console.log('video data available');
  recordedChunks.push(e.data);
}

// save the video file on stop
async function handleStop() {
  const blob = new Blob(recordedChunks, { type: 'video/webm' });
  
  // Convert blob to ArrayBuffer for IPC transfer
  const arrayBuffer = await blob.arrayBuffer();
  
  console.log('Video data ready, size:', arrayBuffer.byteLength);
  console.log('Recorded events:', recordedEvents);
  
  // Send to main process for file saving and FFmpeg processing
  ipcRenderer.send('save-and-process-video', { 
    videoData: arrayBuffer, 
    events: recordedEvents 
  });
  
  // Clear recorded chunks
  recordedChunks.length = 0;
}

// Particle System
class Particle {
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  color: string;

  constructor(canvasWidth: number, canvasHeight: number) {
    this.x = Math.random() * canvasWidth;
    this.y = Math.random() * canvasHeight;
    this.size = Math.random() * 3 + 1; // Random size between 1 and 4
    this.speedX = Math.random() * 1 - 0.5; // Random speed between -0.5 and 0.5
    this.speedY = Math.random() * 1 - 0.5;
    
    // Random blue-ish colors
    // Actually let's stick to the blue theme requested or the Antigravity style (mostly blue/grey)
    const blueColors = ['#4285f4', '#8ab4f8', '#d2e3fc', '#1967d2'];
    this.color = blueColors[Math.floor(Math.random() * blueColors.length)];
  }

  update(canvasWidth: number, canvasHeight: number) {
    this.x += this.speedX;
    this.y += this.speedY;

    // Wrap around screen
    if (this.x > canvasWidth) this.x = 0;
    if (this.x < 0) this.x = canvasWidth;
    if (this.y > canvasHeight) this.y = 0;
    if (this.y < 0) this.y = canvasHeight;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function initParticles() {
  const canvas = document.getElementById('bg-particles') as HTMLCanvasElement;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const particles: Particle[] = [];
  const particleCount = 50;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  window.addEventListener('resize', resize);
  resize();

  for (let i = 0; i < particleCount; i++) {
    particles.push(new Particle(canvas.width, canvas.height));
  }

  function animate() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    for (const particle of particles) {
      particle.update(canvas.width, canvas.height);
      particle.draw(ctx);
    }

    requestAnimationFrame(animate);
  }

  animate();
}

// Initialize particles when DOM is ready
document.addEventListener('DOMContentLoaded', initParticles);

// Event Tracking Listeners
ipcRenderer.on('focus-event-start', (event: any, data: FocusEventPayload) => {
  console.log('Focus Event Start:', data);
  
  if (recordingStartTime !== null) {
    const key = data.type;
    activeEvents.set(key, {
      startTime: Date.now(),
      payload: data
    });
  }
  
  // Visual feedback (optional)
  const container = document.querySelector('.app-container');
  if (container instanceof HTMLElement) {
    container.style.borderColor = data.type === 'typing' ? '#ea4335' : '#4285f4'; // Red for typing, Blue for dwell
    container.style.boxShadow = `0 0 20px ${data.type === 'typing' ? 'rgba(234, 67, 53, 0.3)' : 'rgba(66, 133, 244, 0.3)'}`;
  }
});

ipcRenderer.on('focus-event-end', (event: any, data: { type: 'dwell' | 'typing' }) => {
  console.log('Focus Event End:', data);

  if (recordingStartTime !== null) {
    const key = data.type;
    const activeEvent = activeEvents.get(key);

    if (activeEvent) {
      const duration = Date.now() - activeEvent.startTime;
      const eventType = activeEvent.payload.type === 'dwell' ? 'mouse dwell' : 'typing';
      recordedEvents.push({
        type: eventType,
        timestamp: activeEvent.startTime - recordingStartTime,
        duration: duration,
        x: activeEvent.payload.x,
        y: activeEvent.payload.y,
        zoomLevel: eventType === 'typing' ? 1.5 : 2.0 // Typing: 1.5x, Dwell: 2.0x
      });
      activeEvents.delete(key);
    }
  }
  
  const container = document.querySelector('.app-container');
  if (container instanceof HTMLElement) {
    container.style.borderColor = 'rgba(255, 255, 255, 0.5)';
    container.style.boxShadow = '0 10px 40px rgba(0, 0, 0, 0.05)';
  }
});

ipcRenderer.on('video-processed', (event: any, outputPath: string) => {
  console.log('Video processed successfully:', outputPath);
  alert(`Video processed and saved to: ${outputPath}`);
});

ipcRenderer.on('video-error', (event: any, data: { error: string, filePath: string }) => {
  console.error('Video processing error:', data);
  alert(`Error processing video: ${data.error}`);
});