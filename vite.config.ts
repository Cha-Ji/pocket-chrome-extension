import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import { resolve } from 'path'
import manifest from './manifest.json'

// Dev-only host_permissions (localhost data collector 등)
const DEV_HOST_PERMISSIONS = [
  'http://localhost:3001/*',
]

export default defineConfig(({ mode }) => {
  const isDev = mode === 'development'

  const resolvedManifest = isDev
    ? {
        ...manifest,
        host_permissions: [
          ...manifest.host_permissions,
          ...DEV_HOST_PERMISSIONS,
        ],
      }
    : manifest

  return {
    plugins: [
      react(),
      crx({ manifest: resolvedManifest }),
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          sidepanel: resolve(__dirname, 'src/side-panel/index.html'),
          // WebSocket inject script (페이지 컨텍스트용)
          'inject-websocket': resolve(__dirname, 'src/content-script/inject-websocket.js'),
        },
        output: {
          entryFileNames: (chunkInfo) => {
            // inject-websocket은 별도 이름으로 출력
            if (chunkInfo.name === 'inject-websocket') {
              return '[name].js'
            }
            return 'assets/[name]-[hash].js'
          },
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      exclude: ['tests/e2e/**', 'node_modules/**'],
      poolOptions: {
        threads: {
          maxThreads: 4,
          minThreads: 1,
        },
      },
      coverage: {
        provider: 'v8',
        reporter: ['text', 'text-summary', 'html', 'lcov'],
        reportsDirectory: './coverage',
        include: ['src/**/*.ts', 'src/**/*.tsx'],
        exclude: [
          'src/**/*.test.ts',
          'src/**/*.spec.ts',
          'src/test/**',
          'src/**/*.d.ts',
          'src/side-panel/main.tsx',
        ],
        thresholds: {
          statements: 60,
          branches: 50,
          functions: 60,
          lines: 60,
        },
      },
    },
  }
})
