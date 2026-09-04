import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          butterchurn: ['butterchurn'],
          presets: ['butterchurn-presets'],
          'music-metadata': ['music-metadata'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['butterchurn', 'butterchurn-presets'],
  },
  server: { port: 5173, strictPort: false },
  preview: { port: 4173, strictPort: false },
});
