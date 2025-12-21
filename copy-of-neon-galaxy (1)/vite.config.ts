import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      // Prevent Vite from bundling these; they will be loaded via importmap in index.html
      external: ['react', 'react-dom', 'react-dom/client', 'three', 'lucide-react']
    }
  }
})