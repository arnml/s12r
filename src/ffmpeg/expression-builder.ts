import { ZoomEvent, VideoMetadata, AppSettings } from '@/types';
import { TryLedger, isDebugEnabled } from '@/utils/try-ledger';
import { generateExpressionsFromSegments } from './expression-generator';

/**
 * Round a number to specified decimal places.
 */
function roundToPrecision(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Build cinematic zoom segments for dynamic video processing.
 *
 * Creates a cinematic effect:
 * - Normal view (1x zoom) between events
 * - Zoom IN when dwell starts (smooth transition)
 * - Hold zoom during dwell event
 * - Zoom OUT when dwell ends (smooth transition)
 * - Return to normal view until next event
 *
 * @param events - Zoom events to process
 * @param fps - Frames per second of the video
 * @param metadata - Video metadata (width, height, fps, duration)
 * @param ledger - Optional TryLedger for diagnostic logging
 * @returns Object with cinematic segments for processing
 */
export function buildLinearZoomExpressions(
  events: ZoomEvent[],
  fps = 30,
  metadata?: VideoMetadata,
  ledger?: TryLedger,
  settings?: AppSettings
) {
  // Use provided ledger or create ephemeral one for this call
  const activeLedger = ledger || new TryLedger();
  const isVerbose = isDebugEnabled();

  // Entry checkpoint
  activeLedger.note(
    'expression-builder.entry',
    `events=${events.length}, fps=${fps}, verbose=${isVerbose}`
  );

  // Step 1: Validate input events (only apply effects to events meeting minimum duration)
  const minDurationMs = settings?.minEventDurationMs ?? 2000;
  const validEvents = activeLedger.step(
    'filter-short-events',
    `total events=${events.length}, min duration=${minDurationMs}ms`,
    () => {
      const filtered = events.filter(e => e.duration >= minDurationMs);
      return filtered;
    }
  );

  activeLedger.note(
    'event-filter-result',
    `${validEvents.length}/${events.length} events pass duration filter`
  );

  // Step 2: Check if we have processable events
  if (validEvents.length === 0) {
    activeLedger.note(
      'BRANCH_FALLBACK',
      'no valid events after filtering → returning default (no zoom)'
    );

    const fallbackResult = {
      zoomExpr: '1',
      pxExpr: '0.5',
      pyExpr: '0.5',
      totalDuration: 1,
      cinematicSegments: [],
    };

    activeLedger.step(
      'build-expressions-fallback',
      'valid events=0',
      () => fallbackResult,
      'fallback'
    );

    activeLedger.note('expression-builder.exit', 'returning fallback (no events >= 2s)');

    if (isVerbose) {
      activeLedger.emitSummary();
    }

    return fallbackResult;
  }

  // Step 3: Build cinematic segments
  const cinematicSegments = activeLedger.step(
    'build-cinematic-segments',
    `valid events=${validEvents.length}, fps=${fps}`,
    () => {
      const segments = [];
      const transitionDurationMs = settings?.transitionDurationMs ?? 500;
      const TRANSITION_DURATION = transitionDurationMs / 1000; // Convert ms to seconds

      // Calculate total video duration
      const lastEventEnd = validEvents.length > 0
        ? Math.max(...validEvents.map(e => (e.timestamp + e.duration) / 1000))
        : 0;

      // Use the greater of: last event end OR actual video duration
      const totalDuration = Math.max(
        Math.ceil(lastEventEnd) + 1,
        metadata?.duration ?? 1
      );

      activeLedger.note('duration-calculation', {
        lastEventEnd,
        actualVideoDuration: metadata?.duration ?? 'unknown',
        totalDuration,
        extended: totalDuration > Math.ceil(lastEventEnd) + 1
      });

      // Sort events by timestamp
      const sortedEvents = [...validEvents].sort((a, b) => a.timestamp - b.timestamp);

      let currentTime = 0;

      for (let i = 0; i < sortedEvents.length; i++) {
        const event = sortedEvents[i];
        const eventStartTime = event.timestamp / 1000;
        const eventEndTime = (event.timestamp + event.duration) / 1000;

        const targetPx = roundToPrecision(event.percentageX ?? 0.5, 2);
        const targetPy = roundToPrecision(event.percentageY ?? 0.5, 2);

        // 1. Normal view before event (if there's time)
        if (eventStartTime > currentTime + 0.1) {
          segments.push({
            type: 'normal',
            startTime: currentTime,
            endTime: eventStartTime,
            zoom: 1,
            x: 0.5,
            y: 0.5,
            description: `Normal view before event ${i + 1}`,
          });
        }

        // 2. Zoom IN transition (0.5s)
        const zoomInStart = eventStartTime;
        const zoomInEnd = Math.min(eventStartTime + TRANSITION_DURATION, eventEndTime - 0.1);

        segments.push({
          type: 'zoom-in',
          startTime: zoomInStart,
          endTime: zoomInEnd,
          zoom: 2, // Target zoom level
          x: targetPx,
          y: targetPy,
          description: `Zoom IN to (${targetPx}, ${targetPy})`,
        });

        // 3. Hold zoom during dwell (if event is long enough)
        if (eventEndTime > zoomInEnd + 0.1) {
          const holdStart = zoomInEnd;
          const holdEnd = eventEndTime - TRANSITION_DURATION;

          if (holdEnd > holdStart) {
            segments.push({
              type: 'hold',
              startTime: holdStart,
              endTime: holdEnd,
              zoom: 2,
              x: targetPx,
              y: targetPy,
              description: `Hold zoom at (${targetPx}, ${targetPy})`,
            });
          }
        }

        // 4. Zoom OUT transition (0.5s)
        const zoomOutStart = Math.max(eventEndTime - TRANSITION_DURATION, zoomInEnd);
        const zoomOutEnd = eventEndTime;

        segments.push({
          type: 'zoom-out',
          startTime: zoomOutStart,
          endTime: zoomOutEnd,
          zoom: 1, // Back to normal
          x: 0.5,
          y: 0.5,
          description: `Zoom OUT back to normal`,
        });

        currentTime = eventEndTime;
      }

      // Final normal view after all events
      if (currentTime < totalDuration) {
        segments.push({
          type: 'normal',
          startTime: currentTime,
          endTime: totalDuration,
          zoom: 1,
          x: 0.5,
          y: 0.5,
          description: 'Final normal view',
        });
      }

      return segments;
    }
  );

  activeLedger.note(
    'cinematic-segments-created',
    `${cinematicSegments.length} segments built (types: ${[...new Set(cinematicSegments.map(s => s.type))].join(', ')})`
  );

  // Step 4: Validate segment structure
  activeLedger.step(
    'validate-segments',
    `segments=${cinematicSegments.length}`,
    () => {
      const issues: string[] = [];
      for (let i = 0; i < cinematicSegments.length; i++) {
        const seg = cinematicSegments[i];
        if (!seg.type || !['normal', 'zoom-in', 'hold', 'zoom-out'].includes(seg.type)) {
          issues.push(`Segment ${i}: invalid type "${seg.type}"`);
        }
        if (typeof seg.startTime !== 'number' || typeof seg.endTime !== 'number') {
          issues.push(`Segment ${i}: invalid times`);
        }
        if (seg.startTime >= seg.endTime) {
          issues.push(`Segment ${i}: startTime >= endTime`);
        }
        if (typeof seg.zoom !== 'number' || seg.zoom <= 0) {
          issues.push(`Segment ${i}: invalid zoom value`);
        }
        if (typeof seg.x !== 'number' || typeof seg.y !== 'number') {
          issues.push(`Segment ${i}: invalid x/y coordinates`);
        }
      }
      if (issues.length > 0) {
        throw new Error(issues.join('; '));
      }
      return { valid: true, count: cinematicSegments.length };
    }
  );

  console.log(`✓ Created ${cinematicSegments.length} cinematic segments:`);
  cinematicSegments.forEach((seg, i) => {
    console.log(
      `  ${i + 1}. ${seg.description} (${seg.startTime.toFixed(1)}s - ${seg.endTime.toFixed(1)}s)`
    );
  });

  // Step 5: Build FFmpeg filter expressions from segments
  const expressionResult = activeLedger.step(
    'build-expressions-from-segments',
    `segments=${cinematicSegments.length}, fps=${fps}`,
    () => {
      // Call the incremental expression generator (implements 5a-5g)
      const videoWidth = metadata?.width ?? 1920;
      const videoHeight = metadata?.height ?? 1080;
      return generateExpressionsFromSegments(
        cinematicSegments,
        fps,
        videoWidth,
        videoHeight,
        activeLedger,
        settings
      );
    },
    'primary'
  );

  activeLedger.note(
    'expressions-result',
    `zoom (${expressionResult.zoomExpr.length} chars), x (${expressionResult.pxExpr.length} chars), y (${expressionResult.pyExpr.length} chars)`
  );

  // Calculate total duration from segments
  const totalDuration = cinematicSegments.length > 0
    ? Math.max(...cinematicSegments.map(s => s.endTime))
    : 1;

  const finalResult = {
    zoomExpr: expressionResult.zoomExpr,
    pxExpr: expressionResult.pxExpr,
    pyExpr: expressionResult.pyExpr,
    totalDuration,
    cinematicSegments,
  };

  activeLedger.note('expression-builder.exit', `returning with ${cinematicSegments.length} segments`);

  if (isVerbose) {
    activeLedger.emitSummary();
  }

  return finalResult;
}

/**
 * Debug function to examine expression structure.
 */
export function debugExpression(expr: string, name: string): void {
  console.log(`\n=== DEBUG: ${name} Expression ===`);
  console.log(`Value: ${expr}`);
  console.log(`Length: ${expr.length} characters`);
}