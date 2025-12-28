export type EventType = 'mouse dwell' | 'typing';

export interface ZoomEvent {
  type: EventType;
  timestamp: number; // ms relative to recording start
  duration: number; // ms
  x: number; // absolute screen coordinates
  y: number; // absolute screen coordinates
  percentageX?: number; // normalized to video dimensions (calculated in main process)
  percentageY?: number; // normalized to video dimensions (calculated in main process)
  zoomLevel: number;
  transitionDuration?: number; // ms for ramp in/out (default: 500ms)
  merged?: boolean; // indicates if event was merged from overlapping events
}

export interface FocusEventPayload {
  type: 'dwell' | 'typing';
  x: number; // absolute screen coordinates
  y: number; // absolute screen coordinates
}
