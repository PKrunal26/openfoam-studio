import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 300_000,   // 5 minutes default for Docker tests
    hookTimeout: 300_000,
    reporters: ['verbose'],
  },
})
