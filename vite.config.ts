import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
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
        target: process.env.VITE_API_PROXY_TARGET?.trim() || `http://localhost:${process.env.PORT?.trim() || 3001}`,
        changeOrigin: true,
      },
    },
  },
})
