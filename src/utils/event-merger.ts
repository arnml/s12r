import { ZoomEvent } from '@/types';

/**
 * Merge overlapping zoom events into single events with weighted average positions.
 *
 * When events overlap in time, we merge them into a single event that:
 * - Spans the combined time range
 * - Uses weighted average for x/y position (based on duration)
 * - Uses maximum zoom level
 *
 * @param events - Unsorted events, may contain overlaps
 * @returns Sorted, merged events with no overlaps
 *
 * @example
 * const events = [
 *   { timestamp: 1000, duration: 500, x: 100, y: 100, zoomLevel: 2 },
 *   { timestamp: 1200, duration: 400, x: 200, y: 200, zoomLevel: 1.5 } // Overlaps
 * ];
 * const merged = mergeOverlappingEvents(events);
 * // Result: Single event from 1000 to 1600, position at weighted average
 */
export function mergeOverlappingEvents(events: ZoomEvent[]): ZoomEvent[] {
  if (events.length === 0) return [];
  if (events.length === 1) return [...events];

  // Sort by timestamp
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

  const merged: ZoomEvent[] = [];
  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    const currentEnd = current.timestamp + current.duration;

    if (next.timestamp < currentEnd) {
      // Events overlap - merge them
      current = mergeTwo(current, next);
    } else {
      // No overlap - save current and start new
      merged.push(current);
      current = { ...next };
    }
  }

  merged.push(current);
  return merged;
}

/**
 * Merge two overlapping zoom events.
 *
 * @param current - First event
 * @param next - Second event (starts during current)
 * @returns Merged event spanning both
 */
function mergeTwo(current: ZoomEvent, next: ZoomEvent): ZoomEvent {
  const currentEnd = current.timestamp + current.duration;
  const nextEnd = next.timestamp + next.duration;
  const mergedEndTime = Math.max(currentEnd, nextEnd);
  const duration = mergedEndTime - current.timestamp;

  // Weighted average of positions based on duration
  const currentWeight = current.duration;
  const nextWeight = next.duration;
  const totalWeight = currentWeight + nextWeight;

  const percentageX = ((current.percentageX || 0.5) * currentWeight +
                       (next.percentageX || 0.5) * nextWeight) / totalWeight;
  const percentageY = ((current.percentageY || 0.5) * currentWeight +
                       (next.percentageY || 0.5) * nextWeight) / totalWeight;

  return {
    type: current.type,
    timestamp: current.timestamp,
    duration,
    x: current.x,
    y: current.y,
    percentageX,
    percentageY,
    zoomLevel: Math.max(current.zoomLevel, next.zoomLevel),
    transitionDuration: current.transitionDuration,
    merged: true
  };
}

/**
 * Calculate statistics about event merging (for debugging).
 */
export function getMergeStats(original: ZoomEvent[], merged: ZoomEvent[]) {
  return {
    originalCount: original.length,
    mergedCount: merged.length,
    eventsMerged: original.length - merged.length,
    mergePercentage: ((original.length - merged.length) / original.length * 100).toFixed(1)
  };
}
