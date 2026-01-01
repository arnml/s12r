# S12R - Screen Recorder with Smart Zoom

A desktop screen recording application that automatically applies zoom effects to highlight user focus points (mouse dwell and typing events).

## Features

- 🎥 Record screen with automatic zoom on mouse dwell and typing
- ⚙️ Configurable settings for detection timing and zoom levels
- 🎬 FFmpeg-based video processing
- 💾 Settings persistence across sessions

## Quick Start

### Install Dependencies
```bash
npm install
```

### Development
```bash
npm start
```

### Run Tests
```bash
npm test
```

### Build for Distribution
```bash
npm make
```

## Settings

Access settings via the ⚙️ button in the top-right corner:
- Mouse dwell detection timing and zoom level
- Typing detection settings
- Zoom levels and transition effects (eased/linear)
- Event filtering

## Project Structure

- `src/main.ts` - Main process (window management, event tracking)
- `src/renderer.ts` - Renderer process (UI, video capture)
- `src/services/` - Core services (video processing, settings storage)
- `src/ffmpeg/` - FFmpeg filter generation
- `tests/` - Test suite

## License

MIT
