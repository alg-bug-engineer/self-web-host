import { defineConfig } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'

const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, '')
const localPort = 3217
const baseURL = externalBaseURL || `http://127.0.0.1:${localPort}`

export default defineConfig({
  testDir: './scripts/tests/ui',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile-chromium',
      use: { viewport: { width: 390, height: 844 }, isMobile: true },
    },
  ],
  webServer: externalBaseURL
    ? undefined
    : {
        command: 'npm start',
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          PORT: String(localPort),
          ANALYTICS_DATA_DIR: path.join(os.tmpdir(), 'ai-knowledgepoints-ui-test'),
        },
      },
})
