import ffmpeg from 'fluent-ffmpeg';
import { ZoomEvent, CaptureSourceInfo, VideoMetadata, AppSettings } from '@/types';
import { normalizeEventCoordinates, validateCoordinates } from '@/ffmpeg/coordinate-utils';
import { mergeOverlappingEvents } from '@/utils/event-merger';
import { buildLinearZoomExpressions, debugExpression } from '@/ffmpeg/expression-builder';
import { TryLedger } from '@/utils/try-ledger';

/**
 * Process video with FFmpeg zoompan filter.
 * Orchestrates the complete video processing pipeline.
 */
export async function processVideoWithFFmpeg(
  filePath: string,
  events: ZoomEvent[],
  sourceInfo: CaptureSourceInfo,
  mainWindow: any,
  outputPath: string,
  settings?: AppSettings
): Promise<void> {
  const ledger = new TryLedger(`proc-${Date.now()}`);

  try {
    const pipeline = new VideoProcessingPipeline(ledger, settings);
    await pipeline.process(filePath, events, sourceInfo, outputPath);
    
    console.log('✓ Video processing completed successfully');
    mainWindow?.webContents.send('video-processed', outputPath);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Error processing video:', errorMsg);
    mainWindow?.webContents.send('video-error', {
      error: errorMsg,
      filePath: outputPath
    });
  }
}

/**
 * Video processing pipeline with clear step separation.
 */
class VideoProcessingPipeline {
  constructor(private ledger: TryLedger, private settings?: AppSettings) {}

  async process(
    filePath: string,
    events: ZoomEvent[],
    sourceInfo: CaptureSourceInfo,
    outputPath: string
  ): Promise<void> {
    console.log('Processing video with FFmpeg:', filePath);
    
    const metadata = await this.probeVideoMetadata(filePath);
    const processedEvents = await this.processEvents(events, sourceInfo, metadata);
    const expressions = this.buildExpressions(processedEvents, metadata);
    await this.encodeVideo(filePath, outputPath, metadata, expressions);
  }

  private async probeVideoMetadata(filePath: string): Promise<VideoMetadata> {
    console.log('Step 1: Probing video metadata...');
    const metadata = await probeVideo(filePath);
    this.ledger.note('probe-video', `${metadata.width}x${metadata.height} @ ${metadata.fps}fps`);
    console.log(`Detected video dimensions: ${metadata.width}x${metadata.height} @ ${metadata.fps}fps`);
    return metadata;
  }

  private async processEvents(
    events: ZoomEvent[], 
    sourceInfo: CaptureSourceInfo, 
    metadata: VideoMetadata
  ): Promise<ZoomEvent[]> {
    console.log('Step 2: Processing events...');
    
    // Validate coordinates
    const validation = validateCoordinates(events, sourceInfo);
    if (!validation.valid) {
      console.warn('⚠️  Coordinate validation warnings:', validation.warnings);
    }

    // Normalize coordinates
    const normalizedEvents = this.ledger.step(
      'normalize-coordinates',
      `events=${events.length}, video=${metadata.width}x${metadata.height}`,
      () => normalizeEventCoordinates(events, sourceInfo, metadata)
    );

    // Merge overlapping events
    const mergedEvents = this.ledger.step(
      'merge-overlapping-events',
      `events=${normalizedEvents.length}`,
      () => mergeOverlappingEvents(normalizedEvents)
    );
    
    console.log(`Merged ${events.length} events into ${mergedEvents.length}`);
    return mergedEvents;
  }

  private buildExpressions(events: ZoomEvent[], metadata: VideoMetadata) {
    console.log('Step 3: Building FFmpeg expressions...');
    const expressions = buildLinearZoomExpressions(
      events,
      metadata.fps,
      metadata,
      this.ledger,
      this.settings
    );

    console.log('Filter expressions generated:');
    debugExpression(expressions.zoomExpr, 'zoom');
    debugExpression(expressions.pxExpr, 'x');
    debugExpression(expressions.pyExpr, 'y');

    return expressions;
  }

  private async encodeVideo(
    filePath: string, 
    outputPath: string, 
    metadata: VideoMetadata, 
    expressions: any
  ): Promise<void> {
    console.log('Step 4: Encoding video...');
    await encodeWithZoom(
      filePath,
      outputPath,
      metadata,
      expressions.zoomExpr,
      expressions.pxExpr,
      expressions.pyExpr,
      expressions.totalDuration,
      expressions.cinematicSegments
    );
  }
}

/**
 * Probe video file to get metadata (dimensions, fps, codec).
 */
function probeVideo(filePath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(new Error(`Failed to probe video: ${err.message}`));
        return;
      }

      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      if (!videoStream?.width || !videoStream?.height) {
        reject(new Error('Could not detect video dimensions'));
        return;
      }

      const fps = (() => {
        // Try multiple fps sources in order of preference
        let detectedFps = 30; // Default fallback

        // Try r_frame_rate first (declared frame rate)
        if (videoStream.r_frame_rate) {
          const parts = videoStream.r_frame_rate.split('/');
          if (parts.length === 2) {
            const [num, den] = parts.map(Number);
            detectedFps = Math.round(num / den);
          }
        }

        // Try avg_frame_rate as fallback (actual average frame rate)
        if (detectedFps > 100 && videoStream.avg_frame_rate) {
          const parts = videoStream.avg_frame_rate.split('/');
          if (parts.length === 2) {
            const [num, den] = parts.map(Number);
            detectedFps = Math.round(num / den);
          }
        }

        // Sanity check: fps should be between 1 and 120 (or NaN for invalid values)
        if (isNaN(detectedFps) || detectedFps < 1 || detectedFps > 120) {
          console.warn(`⚠️  Detected fps ${detectedFps} is unreasonable, using default 30fps`);
          detectedFps = 30;
        }

        return detectedFps;
      })();

      // Extract duration from format metadata
      const duration = metadata.format?.duration
        ? parseFloat(metadata.format.duration)
        : 0;

      resolve({
        width: videoStream.width,
        height: videoStream.height,
        fps,
        duration
      });
    });
  });
}

/**
 * Encode video with zoompan filter applied.
 *
 * PROPER ZOOM + PAN: Calculate the correct pan offset to center the zoom
 * on the mouse dwell position. The x,y parameters should be the top-left
 * corner of the zoomed viewport, not the center point.
 */
function encodeWithZoom(
  inputPath: string,
  outputPath: string,
  metadata: VideoMetadata,
  zoomExpr: string,
  pxExpr: string,
  pyExpr: string,
  totalDuration: number,
  cinematicSegments: any[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const { width, height, fps } = metadata;

    console.log('CINEMATIC ZOOM APPROACH: Creating dynamic zoom effects');
    console.log(`Total cinematic segments: ${cinematicSegments.length}`);

    if (cinematicSegments.length === 0) {
      // Fallback to copying original
      const fs = require('node:fs');
      try {
        fs.copyFileSync(inputPath, outputPath);
        console.log('✓ Copied original video (no events)');
        resolve();
        return;
      } catch (copyError) {
        reject(new Error(`Failed to copy original: ${copyError.message}`));
        return;
      }
    }

    // Build zoompan filter with dynamic expressions
    console.log('Building FFmpeg zoompan filter with expressions...');

    // Expressions now output pixel coordinates directly, no conversion needed
    const filterString = `zoompan=z='${zoomExpr}':x='${pxExpr}':y='${pyExpr}':d=1:s=${width}x${height}:fps=${fps}`;

    console.log('Filter string length:', filterString.length);
    console.log(`Applying zoompan filter: z=${zoomExpr.length}chars, x=${pxExpr.length}chars, y=${pyExpr.length}chars`);
    console.log('FULL FILTER STRING:', filterString.substring(0, 500) + '...');

    const command = ffmpeg(inputPath);
    command
      .videoFilter(filterString)
      .outputOptions(['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-c:a', 'aac', '-y'])
      .output(outputPath)
      .on('start', (cmd) => {
        console.log('✓ FFmpeg encoding started');
      })
      .on('progress', (progress) => {
        process.stdout.write(`\r  ⏱️  Frame: ${progress.frames || 0} | Time: ${progress.timemark || '00:00:00'}`);
      })
      .on('end', () => {
        console.log('\n✓ FFmpeg filter applied and encoding completed');
        resolve();
      })
      .on('error', (err) => {
        console.error('✗ FFmpeg error:', err.message);
        reject(new Error(`FFmpeg encoding failed: ${err.message}`));
      })
      .run();
  });
}
// Helper function for static zoom fallback
function encodeStaticZoom(inputPath: string, outputPath: string, metadata: VideoMetadata, zoomExpr: string, pxExpr: string, pyExpr: string, resolve: any, reject: any) {
  const { width, height } = metadata;
  
  const zoomLevel = Number.parseFloat(zoomExpr);
  const centerX = Number.parseFloat(pxExpr) * width;
  const centerY = Number.parseFloat(pyExpr) * height;
  
  const viewportWidth = width / zoomLevel;
  const viewportHeight = height / zoomLevel;
  const panX = Math.max(0, Math.min(width - viewportWidth, centerX - viewportWidth / 2));
  const panY = Math.max(0, Math.min(height - viewportHeight, centerY - viewportHeight / 2));
  
  const filterComplex = `zoompan=z=${zoomLevel}:d=1:x=${Math.round(panX)}:y=${Math.round(panY)}:s=${width}x${height}`;
  
  console.log('Fallback to static zoom:', filterComplex);
  
  const command = ffmpeg(inputPath);
  command
    .videoFilter(filterComplex)
    .output(outputPath)
    .outputOptions(['-c:v libx264', '-preset medium', '-pix_fmt yuv420p', '-y'])
    .on('end', () => resolve())
    .on('error', (err) => {
      console.error('Static zoom also failed, copying original');
      const fs = require('node:fs');
      try {
        fs.copyFileSync(inputPath, outputPath);
        resolve();
      } catch (copyError) {
        reject(new Error(`All approaches failed: ${err.message}`));
      }
    })
    .run();
}