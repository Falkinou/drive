import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // The VPS serves Drive at /. GitHub Pages only publishes a compatibility
  // redirect from the former /drive/ URL.
  base: process.env.GITHUB_ACTIONS ? '/drive/' : '/',
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/health': 'http://127.0.0.1:3000',
    },
  },
  test: {
    include: ['src/**/*.test.{js,jsx}'],
  },
})
