import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'

// Plugin to prune dist/downloads after build so Electron and Capacitor don't pack gigabytes of installers inside themselves
function pruneDistDownloads() {
  return {
    name: 'prune-dist-downloads',
    closeBundle() {
      const dlPath = path.resolve(__dirname, 'dist/downloads')
      if (fs.existsSync(dlPath)) {
        fs.rmSync(dlPath, { recursive: true, force: true })
      }
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    pruneDistDownloads()
  ],
  server: {
    port: 5173,
    host: true, // Enables mobile phone access on local network (e.g. http://192.168.x.x:5173)
    watch: {
      ignored: [
        '**/server/**',
        '**/data/**',
        '**/*.json',
        '**/.git/**'
      ],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
