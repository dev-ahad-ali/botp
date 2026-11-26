import path from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()], build: { lib: { entry: 'electron/main.ts' } } },
  preload: { plugins: [externalizeDepsPlugin()], build: { lib: { entry: 'electron/preload.ts' } } },
  renderer: {
    root: 'src',
    plugins: [tailwindcss(), react()],
    build: { rolldownOptions: { input: path.resolve('src/index.html') } },
  },
});
