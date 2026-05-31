import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/map-nav/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
  },
})
