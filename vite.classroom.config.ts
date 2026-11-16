// Vite build for the Classroom web app (classroom/web). Separate from the
// desktop renderer build, but shares its viewer engine through the "@" alias.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  root: path.resolve(__dirname, 'classroom/web'),
  base: '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@c': path.resolve(__dirname, 'classroom/web/src'),
      '@': path.resolve(__dirname, 'renderer'),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    proxy: { '/api': `http://localhost:${process.env.OFS_CLASSROOM_PORT ?? 8080}` },
  },
  build: {
    outDir: path.resolve(__dirname, 'classroom/web/dist'),
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
})
