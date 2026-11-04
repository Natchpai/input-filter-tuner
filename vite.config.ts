import path from 'path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { execFileSync } from 'child_process'
import { defineConfig } from 'vitest/config'

// Build stamp: GITHUB_SHA in GitHub Actions, else the local HEAD
function commit() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return 'local'
  }
}

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves a project site from https://<user>.github.io/<repo>/;
  // set this to '/<repo>/' (or '/' for a user site or a custom domain)
  base: '/input-filter-tuner/',
  define: {
    __BUILD__: JSON.stringify({
      commit: commit(),
      date: new Date().toISOString().slice(0, 10),
    }),
  },
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
