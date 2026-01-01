# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**S12R** is a desktop screen recording application built with Electron and TypeScript. It records screen content and intelligently applies zoom effects to highlight user focus points (mouse dwell and typing events) using FFmpeg video processing.

## Development Commands

```bash
# Start development server with hot reload
npm start

# Run linting checks
npm run lint

# Run all tests
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Open Vitest UI dashboard
npm run test:ui

# Build installers for distribution
npm make

# Package application (without installers)
npm package

# Publish to distribution (requires configuration)
npm publish
```

## Project Architecture

### Process Model
S12R follows a standard Electron architecture with three distinct processes:

1. **Main Process (`src/main.ts`)** - 259 lines
   - Window and lifecycle management
   - Event tracking system (mouse dwell detection, typing detection)
   - IPC request handlers for renderer process
   - Delegates video processing to modularized services

2. **Renderer Process (`src/renderer.ts`)** - 328 lines
   - Desktop video capture via MediaRecorder API
   - UI controls (record start/stop, source selection)
   - Real-time event visualization (particles, focus indicators)
   - IPC event listeners for tracking updates from main process

3. **Preload Script (`src/preload.ts`)** - Minimal bridge
   - Currently unused; type references only

### Modularized Services

The main process delegates complex logic to specialized service modules:

1. **Video Processing Service (`src/services/video-processing.ts`)** - 278 lines
   - `processVideoWithFFmpeg()` - Orchestrates the entire video processing pipeline
   - `probeVideo()` - Extracts video metadata (dimensions, framerate, duration)
   - Coordinates normalization, event merging, and FFmpeg filter generation
   - Handles all FFmpeg command execution and encoding with TryLedger diagnostics

2. **FFmpeg Utilities** (`src/ffmpeg/`)
   - `expression-builder.ts` (304 lines) - Builds FFmpeg `zoompan` filter expressions
     - `buildLinearZoomExpressions()` - Generates zoom, pan-x, pan-y expressions with cinematic segments
     - Implements flat timeline architecture for unlimited events
     - Filters events by minimum duration (2 seconds) to prevent expression bloat
   - `expression-generator.ts` (345 lines) - Converts cinematic segments to FFmpeg expressions
     - `generateExpressionsFromSegments()` - Creates nested if-statements for dynamic zoom/pan
     - Implements linear if-statement nesting (not exponential)
   - `coordinate-utils.ts` (127 lines) - Converts screen coordinates to video space
     - `normalizeEventCoordinates()` - Screen → video normalization with 1-decimal rounding
     - `validateCoordinates()` - Ensures coordinates are within video bounds

3. **Event Utilities** (`src/utils/event-merger.ts`) - 97 lines
   - `mergeOverlappingEvents()` - Combines overlapping zoom events with weighted averaging
   - `validateEvents()` - Ensures events meet minimum duration requirements

4. **Diagnostic Utilities** (`src/utils/try-ledger.ts`) - 239 lines
   - `TryLedger` class - Ordered attempt tracking for diagnostic logging
   - Records each processing step with inputs, outputs, timing, and error context
   - Supports debug output and summary reporting
   - Enables reproducible execution traces for troubleshooting

### Type System
Core types defined in `src/types/index.ts`:

```typescript
ZoomEvent {
  type: 'mouse dwell' | 'typing'
  timestamp: number (milliseconds)
  duration: number (milliseconds)
  x, y: number (absolute screen coordinates)
  percentageX?, percentageY?: number (0.0–1.0, normalized to video)
  zoomLevel: number (1.5 for typing, 2.0 for dwell)
  transitionDuration?: number (default: 500ms)
  merged?: boolean (when events overlap)
}

CaptureSourceInfo {
  x, y: number (source position on screen)
  width, height: number (source dimensions in pixels)
}

VideoMetadata {
  width: number
  height: number
  fps: number
  duration: number (seconds)
}

FocusEventPayload {
  type: 'dwell' | 'typing'
  x, y: number (absolute screen coordinates)
}
```

Note: Old `src/interfaces.ts` is deprecated; use `src/types/index.ts` instead.

## Core Business Logic

### Event Detection

**Mouse Dwell Detection** (`main.ts`)
- Monitors mouse position every 100ms
- Dwell triggers when mouse stationary within 20px radius for > 1 second
- Generates `ZoomEvent` with `zoomLevel: 2.0`

**Typing Detection** (`main.ts`)
- Global keyboard monitoring via `uiohook-napi`
- Typing detected when consecutive key presses occur within 1-second gaps
- Triggers after 2+ seconds of continuous typing
- Generates `ZoomEvent` with `zoomLevel: 1.5`

### Video Processing Pipeline (`src/services/video-processing.ts`)

Orchestrated by `processVideoWithFFmpeg()` function using TryLedger for diagnostic tracking:

1. **Capture**: WebM video saved from renderer to temp directory
2. **Analysis** (`probeVideo()`): FFprobe extracts video metadata (dimensions, framerate, duration)
3. **Validation** (`validateCoordinates()`): Ensures all event coordinates are within video bounds
4. **Normalization** (`normalizeEventCoordinates()`): Event coordinates converted from screen space to video space
   - Compute relative position: `(screenX - sourceX) / sourceWidth`
   - Clamp to [0, 1] bounds
   - Round to 1 decimal place for expression efficiency
5. **Merging** (`mergeOverlappingEvents()`): Overlapping dwell + typing events merged into single zoom regions
   - Time-based merging: events within the same time window are combined
   - Position: weighted average based on event duration
   - Zoom level: maximum of overlapping events
6. **Cinematic Segments** (`buildLinearZoomExpressions()`): Build cinematic zoom timeline
   - Creates normal view → zoom-in → hold → zoom-out segments for each event
   - Filters events by minimum duration (2 seconds) to prevent expression complexity
   - Tracks segments with start/end times, zoom level, and x/y position
7. **Expression Generation** (`generateExpressionsFromSegments()`): Dynamic FFmpeg `zoompan` filter with:
   - Flat timeline architecture (linear if-statement nesting instead of exponential)
   - Smooth transitions during zoom-in/zoom-out segments (0.5s duration)
   - Safe coordinate clamping to prevent edge artifacts
   - Pan centered on event location (x, y)
   - Framerate-adaptive expressions using detected video fps
8. **Encoding**: FFmpeg executes zoompan filter and encodes output as MP4 at detected framerate

### UI Components

**Main Window** (`index.html`, `src/index.css`)
- Glass-morphism design with semi-transparent backdrop blur
- Video preview container (16:9 aspect ratio)
- Start/Stop record buttons with state feedback
- Animated particle background system (50 particles)
- Border glow on focus events (red for typing, blue for dwell)
- Settings gear icon button (⚙️) in top-right corner

**Source Selection**
- Context menu populated via `get-sources` IPC handler
- Defaults to primary display
- Supports window capture via `desktopCapturer` API

**Settings Modal** (`index.html`, `src/renderer.ts`)
- Floating modal dialog overlaid on main window
- Accessible via ⚙️ gear icon in top-right corner
- Displays form fields for all configuration options
- Save/Reset buttons for settings management
- Close via ✕ button, ESC key, or background click
- Styled to match slim design aesthetic (minimal borders, clean layout)

## User Settings

S12R provides a floating settings modal (⚙️ button in top-right) that allows users to customize event detection, zoom levels, and transition styles. Settings persist across app restarts using electron-store.

### Available Settings

**Mouse Dwell Detection**
- **Threshold Radius**: How far the mouse can move while dwelling (5-100px, default: 20)
- **Trigger Time**: How long to dwell before zoom starts (100-5000ms, default: 1000)

**Typing Detection**
- **Max Keypress Gap**: Maximum time between keypresses to continue typing session (100-5000ms, default: 1000)
- **Trigger Duration**: Minimum typing duration before zoom activates (500-10000ms, default: 2000)

**Zoom Levels**
- **Typing Zoom**: Magnification factor for typing events (1.0-5.0x, default: 1.5x)
- **Dwell Zoom**: Magnification factor for mouse dwell events (1.0-5.0x, default: 2.0x)

**Transition Effects**
- **Style**: Choose between two transition curves:
  - **Eased (DEFAULT)**: Smooth acceleration/deceleration using smoothstep formula
  - **Linear**: Constant speed for mechanical motion
- **Duration**: Time to ramp zoom in/out (100-2000ms, default: 500)

**Event Filtering**
- **Min Duration**: Events shorter than this are not processed (0-10000ms, default: 2000)

### Settings Architecture

Settings are managed through the `SettingsStore` service (`src/services/settings-store.ts`):
- **Validation**: JSON schema validation with custom bounds checking for each setting
- **Persistence**: Uses electron-store for cross-platform encrypted storage
- **Singleton Pattern**: Single source of truth for all app configuration
- **IPC Integration**: Settings synced between main and renderer processes

### Implementation Details

- Settings are loaded on app startup via `settings-get` IPC handler
- User changes trigger `settings-save` which validates and persists settings
- Settings are passed through the entire FFmpeg processing pipeline:
  - Event detection uses timing thresholds
  - Expression builder uses minEventDurationMs for filtering
  - Expression generator uses transitionStyle to choose eased vs linear
- Default settings preserve backward compatibility with original hardcoded values

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `electron` | Desktop app framework |
| `electron-forge` | Building, packaging, signing |
| `vite` | Fast TypeScript compilation and bundling |
| `fluent-ffmpeg` | FFmpeg command building and processing |
| `uiohook-napi` | Global mouse/keyboard event detection |
| `@ffmpeg-installer/ffmpeg` | Bundled FFmpeg binary (external dep) |
| `@ffprobe-installer/ffprobe` | Bundled FFprobe binary (video analysis) |

## Build System

### Vite Configuration
- **Entry Points**: main process (`src/main.ts`), preload (`src/preload.ts`), renderer (`src/renderer.ts`)
- **External Dependencies**: FFmpeg packages bundled externally in vite.main.config.ts
- **Output**: `.vite/build/` directory

### Electron Forge Configuration (`forge.config.ts`)
- **Packager**: ASAR archiving enabled for security
- **Makers**:
  - Windows: Squirrel installer (.exe)
  - macOS: ZIP archive
  - Linux: DEB and RPM packages
- **Security Fuses**: ASAR integrity validation, cookie encryption, disabled NodeOptions
- **Plugin**: Auto-unpack-natives for platform-specific binaries (uiohook-napi)

### TypeScript Configuration
- Target: ESNext
- Module: CommonJS
- Strict mode: `noImplicitAny: true`
- Source maps enabled for debugging

## IPC Message Handlers (Main Process)

### From Renderer to Main:
- `get-sources` → Returns array of screen/window sources
- `show-context-menu` → Opens source selection menu
- `recording-started` → Enables event tracking
- `recording-stopped` → Disables event tracking
- `save-and-process-video` → Triggers FFmpeg processing pipeline

### From Main to Renderer:
- `focus-event` → Focus detection (dwell or typing) with coordinates
- `recording-state` → Enable/disable event tracking listeners

## FFmpeg Filter Architecture

### Cinematic Segments Approach
The FFmpeg zoom filter uses a **cinematic segments architecture** to enable smooth, dynamic zoom effects with unlimited events.

**Key Design**:
- Each event generates 4 segments: normal → zoom-in (ramp) → hold → zoom-out (ramp)
- Segments are time-indexed with precise start/end times (seconds)
- Zoom level and pan position smoothly interpolate during ramp segments
- Only events >= 2 seconds duration are processed (eliminates expression bloat)

**Segment Lifecycle for a 5-second dwell event**:
```
[0s - 1s]        : normal view (1x zoom, default position)
[1s - 1.5s]      : zoom-in ramp (1x → 2x zoom, smooth pan to event location)
[1.5s - 5.5s]    : hold zoom (2x zoom, fixed on event location)
[5.5s - 6s]      : zoom-out ramp (2x → 1x zoom, smooth pan back to default)
[6s+]            : return to normal view
```

**Expression Architecture**:
- Segments sorted by end-time and chained in reverse (linear if-statement nesting)
- Replaces exponential nesting (3^n) with linear growth (n segments)
- Result: 8 events with 4 segments each = 32 total segments = manageable expression complexity

**Example Linear Chain**:
```
if(time_in_segment_32, apply_segment_32,
  if(time_in_segment_31, apply_segment_31,
    if(time_in_segment_30, apply_segment_30, ... default_1x_zoom)))
```

### FFmpeg Compatibility & Expression Syntax

**Critical Variables & Functions** (2018 FFmpeg build):
- ✅ `on`: Output frame count (universally available)
- ✅ `iw`, `ih`: Input width/height
- ❌ `in_time`: NOT available in 2018 build (added 2020)
- ❌ `between()`: NOT available in 2018 build

**Workarounds Applied**:
- `in_time` → `on/${fps}` (frame count / framerate = seconds)
- `between(time, start, end)` → `gt(time, start)*lt(time, end)` (multiply conditions for AND logic)

**Example Expression**:
```javascript
// Zoom value with ramp-in segment (0.5s to 1.5s)
z = 'if(gt(on/29,0.5)*lt(on/29,1.0),
       1+(2-1)*(on/29-0.5)/0.5,   // Ramp from 1x to 2x over 0.5s
       if(gt(on/29,1.0)*lt(on/29,2.0),
         2.0,                      // Hold at 2x zoom
         1))'                      // Default to 1x
```

### Coordinate Normalization & Rounding

**Process** (`src/ffmpeg/coordinate-utils.ts`):
1. Convert screen coordinates to video-relative percentages (0.0–1.0 range)
2. Clamp to valid bounds [0, 1]
3. **Round to 1 decimal place** (e.g., 0.6692... → 0.7)

**Benefits**:
- Reduces expression length by ~85% (0.5 vs 0.52083333...)
- Maintains visual accuracy (1% video resolution)
- Improves FFmpeg processing performance

**Implementation**:
```typescript
const percentageX = (screenX - sourceInfo.x) / sourceInfo.width;
const clampedX = Math.max(0, Math.min(1, percentageX));
const roundedX = Math.round(clampedX * 10) / 10;  // 1 decimal precision
```

### Framerate Detection & Application

**Detection** (`src/services/video-processing.ts`):
```typescript
const metadata = await ffprobeVideo(videoPath);
// Example: { width: 1904, height: 1012, fps: 29 }
```

**Application in Expressions**:
- All time calculations use `on/${fps}` instead of hardcoded `on/30`
- For 29fps video: `on/29` in zoom/pan expressions
- For 30fps video: `on/30` in zoom/pan expressions

**In Filter Definition**:
```
zoompan=z='...':d=1:x='...':y='...':s=1904x1012:fps=29
```

## Known Issues & Limitations

### ⚠️ ACTIVE ISSUE: FFmpeg Filter Initialization Failure (In Progress)
**Symptom**: `"Error reinitializing filters! Failed to inject frame into filter network: Invalid argument"`

**Status**: Using TryLedger diagnostic tracking for root cause analysis
- ✅ Expression syntax verified (parentheses balanced, functions available)
- ✅ FFmpeg 2018 compatibility fixed (on/fps, gt/lt instead of between/in_time)
- ✅ Framerate detection improved (handles variable/invalid fps gracefully)
- ✅ Cinematic segments architecture reduces expression complexity
- ✅ All unit/integration tests passing
- ❌ Real FFmpeg execution may still fail with edge cases

**Debugging Approach**:
- `TryLedger` class logs every processing step with inputs, outputs, and timing
- Use `DEBUG_EXPRESSION=1 npm test` to enable verbose expression output
- Check console logs for step-by-step pipeline progress
- Review ledger summary to identify which stage introduces issues

**Known Potential Causes**:
1. Coordinate normalization edge cases (out-of-bounds values)
2. Complex nested if-statements in expressions may still exceed FFmpeg parsing limits
3. Possible zoompan filter behavioral differences in specific FFmpeg versions
4. Expression length or nesting depth limits in FFmpeg (undocumented)

**Investigation Tools**:
- `test-zoom-on-rawvideo.js` - Test script for minimal filter validation
- Expression builder logging and debug output via `debugExpression()`
- Test suite with granular assertions on each pipeline stage

### Testing Structure

Comprehensive test suite organized into unit and integration categories:

**Unit Tests** (`tests/unit/`)
- `coordinate-utils.test.ts` - Screen-to-video coordinate normalization with edge cases
- `event-merger.test.ts` - Overlapping event merging logic with weighted averaging
- `expression-builder.test.ts` - FFmpeg expression generation and cinematic segments
- `expression-builder-logging.test.ts` - Expression generation with verbose logging
- `filter-validation.test.ts` - FFmpeg filter syntax validation and parentheses balancing
- `try-ledger.test.ts` - TryLedger diagnostic tracking and step recording

**Integration Tests** (`tests/integration/`)
- `ffmpeg-execution.test.ts` - Full video processing pipeline with real FFmpeg
- `simple-filter.test.ts` - Basic FFmpeg filter operations on test videos
- `expression-builder-debug.test.ts` - Expression builder debugging with detailed output

**Debugging Tests**:
- `test-zoom-on-rawvideo.js` - Minimal FFmpeg filter test script for troubleshooting

Run individual test suites with:
```bash
npm test -- coordinate-utils      # Run single test file
npm test -- --grep "pattern"      # Run tests matching pattern
npm run test:ui                   # Open interactive UI dashboard
DEBUG_EXPRESSION=1 npm test       # Run tests with verbose expression output
```

Note: E2E testing with Playwright/Spectron not yet configured.

### Other Known Limitations

1. **Context Isolation**: Disabled in Electron config (potential security concern for mature versions)
2. **DevTools**: Automatically opens in development mode
3. **Preload Script**: Currently minimal; future security hardening may require expanding this
4. **No Logging Framework**: Consider structured logging (winston, pino) for production debugging

## Development Notes

### Coordinate Systems
- **Renderer**: Uses screen coordinates from mouse/keyboard events (pixels from screen edge)
- **Main Process**: Tracks absolute screen coordinates from input sources
- **FFmpeg**: Expects normalized coordinates (0.0–1.0 range where 0 is left/top, 1 is right/bottom)
- **Conversion Path**: Screen coords → normalize by source bounds → round to 1 decimal → FFmpeg

### Code Organization Patterns

1. **Single Responsibility**: Each module handles one concern
   - `video-processing.ts` - Orchestrates the entire pipeline
   - `expression-builder.ts` - Builds cinematic segments only
   - `expression-generator.ts` - Converts segments to FFmpeg expressions only
   - `coordinate-utils.ts` - Normalizes coordinates only
   - `event-merger.ts` - Merges overlapping events only
   - `try-ledger.ts` - Diagnostic tracking and logging only

2. **Diagnostic Tracking with TryLedger**:
   - All major processing steps wrapped in `ledger.step()` calls
   - Each step records inputs, outputs, execution time, and errors
   - Enable verbose logging by setting `DEBUG_EXPRESSION=1` environment variable
   - Call `ledger.emitSummary()` to print formatted trace of entire execution
   - Useful for reproducing bugs and understanding pipeline flow

3. **Debugging Support**:
   - `debugExpression()` in expression-builder outputs formatted FFmpeg filters
   - `TryLedger` provides ordered execution traces with timing info
   - Video processing logs each pipeline step to console
   - Test outputs stored in `test-outputs/` directory for inspection

4. **Error Handling**:
   - FFmpeg errors caught and logged with detailed context
   - Coordinate validation prevents out-of-bounds expressions
   - Event filtering removes events shorter than 2 seconds to prevent expression bloat
   - FPS detection includes fallback (default 30fps) for invalid values

### Performance Considerations
- Event polling at 100ms interval; adjust in `main.ts` if latency becomes concern
- Coordinate rounding to 1 decimal reduces expression length by ~85%
- Flat timeline architecture scales linearly with event count (not exponentially)
- Test suite runs in ~1-2 seconds; E2E tests not yet configured
