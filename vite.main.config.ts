import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: ['uiohook-napi', '@ffmpeg-installer/ffmpeg', '@ffprobe-installer/ffprobe'],
    },
  },
});
