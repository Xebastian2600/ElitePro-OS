import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith('VITE_') && process.env[key] === undefined) {
      process.env[key] = value
    }
  }

  return {
    test: {
      environment: 'node',
      include: ['src/**/*.integration.test.ts'],
      testTimeout: 30000,
      fileParallelism: false,
      env,
    },
  }
})
