import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy /generate, /health etc. to Flask during development
    proxy: {
      '/generate':    'http://localhost:5000',
      '/health':      'http://localhost:5000',
      '/cache':       'http://localhost:5000',
    }
  }
})
