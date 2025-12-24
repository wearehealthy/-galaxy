import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './', // Ensures assets load correctly on GitHub Pages
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // Removed rollupOptions.external to ensure React, Three.js, etc. are bundled
  }
})