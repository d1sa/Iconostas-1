import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base lets the build work from a subdirectory (GitHub Pages, proxy prefix).
  base: './',
  plugins: [react()],
});
