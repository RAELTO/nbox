import { defineConfig, devices, type Project } from '@playwright/test'
import { loadEnv } from 'vite'
import { authStatePath } from './tests/e2e/support/auth'

const loadedEnv = loadEnv('e2e', process.cwd(), '')
const env = { ...loadedEnv, ...process.env }
const isCI = Boolean(env.CI)
const localBaseURL = 'http://127.0.0.1:4173'
const externalBaseURL = env.E2E_BASE_URL?.trim()
const baseURL = externalBaseURL || localBaseURL
const usesExternalServer = Boolean(externalBaseURL && externalBaseURL.replace(/\/$/, '') !== localBaseURL)

const chromium = devices['Desktop Chrome']

const authenticatedResponsiveProjects: Project[] = [
  {
    name: 'desktop-1440',
    use: { ...chromium, viewport: { width: 1440, height: 900 } },
  },
  {
    name: 'tablet-landscape',
    use: { ...chromium, viewport: { width: 1024, height: 768 }, hasTouch: true },
  },
  {
    name: 'tablet-portrait',
    use: { ...devices['iPad (gen 7)'], viewport: { width: 768, height: 1024 } },
  },
  {
    name: 'mobile-390',
    use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } },
  },
  {
    name: 'mobile-small',
    use: { ...devices['iPhone SE'], viewport: { width: 360, height: 800 } },
  },
].map(project => ({
  ...project,
  testMatch: /authenticated\.(navigation|visual|a11y|interactions|voice)\.spec\.ts/,
  dependencies: ['auth-setup'],
  metadata: { authRole: 'demo' },
  use: {
    ...project.use,
    storageState: authStatePath('demo'),
    // Playwright WebKit on Windows can reject the local trust chain used by
    // external test services even when production browsers accept it.
    ignoreHTTPSErrors: true,
  },
}))

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: '.tmp/playwright/results',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: '.tmp/playwright/report', open: 'never' }],
  ],
  use: {
    baseURL,
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'America/Bogota',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  webServer: usesExternalServer
    ? undefined
    : {
        command: 'pnpm exec vite --host 127.0.0.1 --port 4173',
        url: baseURL,
        reuseExistingServer: !isCI,
        timeout: 120_000,
      },
  projects: [
    {
      name: 'auth-setup',
      testMatch: /auth\.setup\.ts/,
      use: { ...chromium, trace: 'off', screenshot: 'off', video: 'off' },
    },
    {
      name: 'public-chromium',
      testMatch: /public\.(smoke|visual|a11y|performance)\.spec\.ts/,
      use: { ...chromium, viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'public-firefox',
      testMatch: /public\.(smoke|a11y)\.spec\.ts/,
      use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'public-webkit',
      testMatch: /public\.(smoke|a11y)\.spec\.ts/,
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } },
    },
    ...authenticatedResponsiveProjects,
    {
      name: 'admin-role',
      testMatch: /authenticated\.role\.spec\.ts/,
      dependencies: ['auth-setup'],
      metadata: { authRole: 'admin' },
      use: {
        ...chromium,
        viewport: { width: 1440, height: 900 },
        storageState: authStatePath('admin'),
      },
    },
    {
      name: 'user-role',
      testMatch: /authenticated\.role\.spec\.ts/,
      dependencies: ['auth-setup'],
      metadata: { authRole: 'user' },
      use: {
        ...chromium,
        viewport: { width: 1440, height: 900 },
        storageState: authStatePath('user'),
      },
    },
  ],
})
