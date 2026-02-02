import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy API requests to the backend during development
      '/estimate': 'http://localhost:8000',
      '/order': 'http://localhost:8000',
      '/orders': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
      '/costs': 'http://localhost:8000',
      '/history': 'http://localhost:8000',
    },
  },
})
