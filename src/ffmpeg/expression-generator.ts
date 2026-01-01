/**
 * FFmpeg Expression Generation
 *
 * Converts cinematic segments into FFmpeg zoompan filter expressions.
 * Implements flat timeline architecture with linear if-statement nesting.
 */

import { TryLedger } from '@/utils/try-ledger';
import { AppSettings } from '@/types';

export interface CinematicSegment {
  type: 'normal' | 'zoom-in' | 'hold' | 'zoom-out';
  startTime: number; // seconds
  endTime: number; // seconds
  zoom: number; // 1.0 = no zoom, 2.0 = 2x zoom
  x: number; // 0.0 - 1.0 (left to right)
  y: number; // 0.0 - 1.0 (top to bottom)
  description: string;
}

export interface ExpressionResult {
  zoomExpr: string;
  pxExpr: string; // pan-x
  pyExpr: string; // pan-y
  totalDuration: number;
}

/**
 * Generate FFmpeg expressions from cinematic segments.
 *
 * Process:
 * 5a. Normalize timeline to frame indices
 * 5b. Compute zoom profile (build zoom value for each segment)
 * 5c. Compute pan profile (build x/y values for each segment)
 * 5d. Build z= expression (nested if-statements for zoom)
 * 5e. Build x= expression (nested if-statements for pan-x)
 * 5f. Build y= expression (nested if-statements for pan-y)
 * 5g. Validate expressions (balanced parens, syntax check)
 */
export function generateExpressionsFromSegments(
  segments: CinematicSegment[],
  fps: number,
  videoWidth: number,
  videoHeight: number,
  ledger?: TryLedger,
  settings?: AppSettings
): ExpressionResult {
  const activeLedger = ledger || new TryLedger();

  if (segments.length === 0) {
    activeLedger.note('expression-generation', 'no segments, returning defaults');
    return {
      zoomExpr: '1',
      pxExpr: '0.5',
      pyExpr: '0.5',
      totalDuration: 1,
    };
  }

  // 5a: Normalize timeline to frame indices
  const frameMap = activeLedger.step(
    '5a-normalize-timeline',
    `segments=${segments.length}, fps=${fps}`,
    () => {
      const map = segments.map(seg => {
        const startFrame = Math.round(seg.startTime * fps);
        const endFrame = Math.round(seg.endTime * fps);
        const duration = endFrame - startFrame;
        return {
          type: seg.type,
          startFrame,
          endFrame,
          duration,
          zoom: seg.zoom,
          x: seg.x,
          y: seg.y,
          description: seg.description,
        };
      });
      return map;
    }
  );

  activeLedger.note(
    'timeline-normalized',
    `${frameMap.length} segments, frame range: 0-${frameMap[frameMap.length - 1]?.endFrame || 0}`
  );

  // 5b: Compute zoom profile
  const zoomProfile = activeLedger.step(
    '5b-compute-zoom-profile',
    `segments=${frameMap.length}`,
    () => {
      const profile = {
        minZoom: Math.min(...frameMap.map(f => f.zoom)),
        maxZoom: Math.max(...frameMap.map(f => f.zoom)),
        segments: frameMap.map(f => ({
          startFrame: f.startFrame,
          endFrame: f.endFrame,
          zoom: f.zoom,
          easeIn: f.type === 'zoom-in',
          easeOut: f.type === 'zoom-out',
        })),
      };
      return profile;
    }
  );

  activeLedger.note(
    'zoom-profile',
    `min=${zoomProfile.minZoom}, max=${zoomProfile.maxZoom}, segments=${zoomProfile.segments.length}`
  );

  // 5c: Compute pan profile
  const panProfile = activeLedger.step(
    '5c-compute-pan-profile',
    `segments=${frameMap.length}`,
    () => {
      const profile = frameMap.map(f => ({
        startFrame: f.startFrame,
        endFrame: f.endFrame,
        x: f.x,
        y: f.y,
        type: f.type,
      }));
      return profile;
    }
  );

  activeLedger.note('pan-profile', `${panProfile.length} pan segments computed`);

  // 5d: Build zoom expression
  const zoomExpr = activeLedger.step(
    '5d-build-zoom-expression',
    `segments=${zoomProfile.segments.length}, fps=${fps}, style=${settings?.transitionStyle ?? 'eased'}`,
    () => {
      return buildZoomExpression(frameMap, fps, settings);
    }
  );

  activeLedger.note('zoom-expression-built', `length=${zoomExpr.length}, uses frame-based conditionals`);

  // 5e: Build x-pan expression
  const pxExpr = activeLedger.step(
    '5e-build-x-pan-expression',
    `segments=${panProfile.length}, fps=${fps}`,
    () => {
      return buildPanExpression(frameMap, fps, 'x', videoWidth, videoHeight);
    }
  );

  activeLedger.note('x-pan-expression-built', `length=${pxExpr.length}`);

  // 5f: Build y-pan expression
  const pyExpr = activeLedger.step(
    '5f-build-y-pan-expression',
    `segments=${panProfile.length}, fps=${fps}`,
    () => {
      return buildPanExpression(frameMap, fps, 'y', videoWidth, videoHeight);
    }
  );

  activeLedger.note('y-pan-expression-built', `length=${pyExpr.length}`);

  // 5g: Validate expressions
  const validation = activeLedger.step(
    '5g-validate-expressions',
    `zoom=${zoomExpr.length}, x=${pxExpr.length}, y=${pyExpr.length}`,
    () => {
      const issues: string[] = [];

      // Check balanced parentheses
      if ((zoomExpr.match(/\(/g) || []).length !== (zoomExpr.match(/\)/g) || []).length) {
        issues.push('zoom: unbalanced parentheses');
      }
      if ((pxExpr.match(/\(/g) || []).length !== (pxExpr.match(/\)/g) || []).length) {
        issues.push('x: unbalanced parentheses');
      }
      if ((pyExpr.match(/\(/g) || []).length !== (pyExpr.match(/\)/g) || []).length) {
        issues.push('y: unbalanced parentheses');
      }

      // Check for required variables
      const requiredVars = ['on'];
      for (const varName of requiredVars) {
        if (!zoomExpr.includes(varName) && zoomExpr !== '1') {
          issues.push(`zoom: missing variable '${varName}'`);
        }
      }

      if (issues.length > 0) {
        throw new Error(`Expression validation failed: ${issues.join('; ')}`);
      }

      return {
        valid: true,
        zoomParens: (zoomExpr.match(/\(/g) || []).length,
        xParens: (pxExpr.match(/\(/g) || []).length,
        yParens: (pyExpr.match(/\(/g) || []).length,
      };
    }
  );

  activeLedger.note(
    'expressions-validated',
    `zoom=${validation.zoomParens} parens, x=${validation.xParens} parens, y=${validation.yParens} parens`
  );

  const totalDuration = Math.max(...frameMap.map(f => f.endFrame)) / fps;

  return {
    zoomExpr,
    pxExpr,
    pyExpr,
    totalDuration,
  };
}

/**
 * Build FFmpeg zoom expression using flat timeline (linear if-statement nesting).
 *
 * Format: if(on >= startFrame && on < endFrame, zoomValue, if(..., ..., defaultZoom))
 *
 * FFmpeg 2018 compatibility:
 * - Use 'on' (frame count) instead of 't' (time)
 * - Use 'if(cond1*cond2, true_val, false_val)' for AND logic (multiply conditions)
 */
function buildZoomExpression(frameMap: any[], fps: number, settings?: AppSettings): string {
  if (frameMap.length === 0) return '1';

  const transitionStyle = settings?.transitionStyle ?? 'eased';

  // Build nested if-statements in reverse order (last segment first)
  // This creates: if(lastCond, lastVal, if(prevCond, prevVal, ... if(firstCond, firstVal, 1)))
  let expr = '1'; // Default: no zoom

  // Process segments in reverse to build nested if-statements
  for (let i = frameMap.length - 1; i >= 0; i--) {
    const seg = frameMap[i];

    // Condition: on >= startFrame AND on < endFrame
    // In FFmpeg: gte(on, startFrame)*lt(on, endFrame) for AND
    const condition = `gte(on,${seg.startFrame})*lt(on,${seg.endFrame})`;

    // For zoom-in/out, interpolate; for hold/normal, use constant
    let zoomValue: string;

    if (seg.type === 'zoom-in') {
      const targetZoom = seg.zoom;
      const duration = seg.duration;
      const t = `(on-${seg.startFrame})/${duration}`;

      if (transitionStyle === 'linear') {
        // LINEAR: constant speed interpolation
        zoomValue = `1+(${targetZoom}-1)*(${t})`;
      } else {
        // EASED (DEFAULT): smoothstep curve t²(3-2t)
        const smoothT = `(${t})*(${t})*(3-2*(${t}))`;
        zoomValue = `1+(${targetZoom}-1)*(${smoothT})`;
      }
    } else if (seg.type === 'zoom-out') {
      const duration = seg.duration;
      const t = `(on-${seg.startFrame})/${duration}`;

      if (transitionStyle === 'linear') {
        // LINEAR: constant speed interpolation
        zoomValue = `${seg.zoom}+(1-${seg.zoom})*(${t})`;
      } else {
        // EASED (DEFAULT): smoothstep curve t²(3-2t)
        const smoothT = `(${t})*(${t})*(3-2*(${t}))`;
        zoomValue = `${seg.zoom}+(1-${seg.zoom})*(${smoothT})`;
      }
    } else {
      // Hold or Normal: constant zoom
      zoomValue = String(seg.zoom);
    }

    // Clamp zoom to minimum 1.0 to avoid division by zero in pan expressions
    zoomValue = `max(1,${zoomValue})`;

    // Build nested if: if(condition, zoomValue, previousExpr)
    expr = `if(${condition},${zoomValue},${expr})`;
  }

  return expr;
}

/**
 * Build FFmpeg pan expression (x or y coordinate) using ABSOLUTE PIXEL COORDINATES.
 *
 * Pan calculation strategy:
 * - Convert normalized coordinates (0-1) to PIXELS using video dimensions
 * - For zoomed viewport, calculate top-left corner position (not center)
 * - FFmpeg zoompan x,y represent the TOP-LEFT of the zoomed region in PIXELS
 * - Clamp to valid bounds to prevent artifacts at edges
 *
 * Example for x-axis with 1920px width and 2x zoom centered at x=0.5:
 * - centerPixel = 0.5 * 1920 = 960px
 * - viewportWidth = 1920 / 2 = 960px
 * - topLeftX = 960 - 960/2 = 480px ✓ Correct viewport corner
 */
function buildPanExpression(
  frameMap: any[],
  fps: number,
  axis: 'x' | 'y',
  videoWidth: number,
  videoHeight: number
): string {
  if (frameMap.length === 0) {
    // Default: top-left of center viewport (pixel coordinates)
    // For 1920x1080, center viewport at 2x zoom: (480, 270)
    const dimension = axis === 'x' ? videoWidth : videoHeight;
    return String(Math.round(dimension / 4)); // Center of centered viewport
  }

  // Extract coordinate value based on axis
  const getCoord = (seg: any) => (axis === 'x' ? seg.x : seg.y);
  const dimension = axis === 'x' ? videoWidth : videoHeight;

  // Default: center of video at 1x zoom (top-left of centered viewport at 2x = dimension/4)
  let expr = String(Math.round(dimension / 4));

  // Build nested if-statements in reverse
  for (let i = frameMap.length - 1; i >= 0; i--) {
    const seg = frameMap[i];
    const condition = `gte(on,${seg.startFrame})*lt(on,${seg.endFrame})`;
    const normalizedCoord = getCoord(seg);

    // Convert normalized coordinate [0, 1] to pixel space
    const centerPixel = `${normalizedCoord}*${dimension}`;
    const viewportSize = `${dimension}/${seg.zoom}`;
    const topLeftCorner = `${centerPixel}-(${viewportSize}/2)`;

    let panValue: string;

    if (seg.type === 'zoom-in') {
      // Interpolate from center (dimension/2) to target coordinate
      const duration = seg.duration;
      const centerDefaultPixel = Math.round(dimension / 2);
      panValue = `${centerDefaultPixel}+(${normalizedCoord}*${dimension}-${centerDefaultPixel})*(on-${seg.startFrame})/${duration}-(${viewportSize}/2)`;
    } else if (seg.type === 'zoom-out') {
      // Interpolate from target coordinate back to center
      const duration = seg.duration;
      const centerDefaultPixel = Math.round(dimension / 2);
      panValue = `(${normalizedCoord}*${dimension})-(${viewportSize}/2)+((${centerDefaultPixel}-${normalizedCoord}*${dimension})/(${duration}))*(on-${seg.startFrame})`;
    } else if (seg.type === 'hold') {
      // During hold, keep pan at target coordinate (top-left corner of viewport)
      panValue = `${topLeftCorner}`;
    } else {
      // Normal: no zoom, use center
      const centerDefaultPixel = Math.round(dimension / 2);
      panValue = String(centerDefaultPixel);
    }

    // Clamp pan to valid pixel range to prevent artifacts
    // Min: 0, Max: dimension - viewportSize (to keep viewport in bounds)
    panValue = `max(0,min(${dimension}-${viewportSize},${panValue}))`;

    expr = `if(${condition},${panValue},${expr})`;
  }

  return expr;
}
