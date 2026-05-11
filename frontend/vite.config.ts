import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const configuredBasePath = env.VITE_BASE_PATH?.trim() || '/'
  const base = configuredBasePath.endsWith('/')
    ? configuredBasePath
    : `${configuredBasePath}/`

  return {
    base,
    plugins: [react()],
    server: {
      port: 5174,
      host: true,
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  }
})
