import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const shared = { '@shared': resolve('src/shared') };

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: shared },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: shared },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          capture: resolve('src/preload/capture.ts'),
        },
        // Sandboxed preloads cannot load ES modules.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    plugins: [react()],
    resolve: { alias: { ...shared, '@renderer': resolve('src/renderer/src') } },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          capture: resolve('src/renderer/capture.html'),
        },
      },
    },
  },
});
