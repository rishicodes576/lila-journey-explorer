import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base './' keeps the built asset URLs relative so the bundle works on Vercel,
// GitHub Pages project sites, or any static host without reconfiguration.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500 },
})
