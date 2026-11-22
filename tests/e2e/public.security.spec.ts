import fs from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { loadEnv } from 'vite'
import { sanitizeHtml, sanitizeText, sanitizeUrl } from '../../src/lib/sanitize'
import {
  boxContentSchema,
  commentContentSchema,
  createGroupSchema,
  groupNameSchema,
  groupTextMessageSchema,
  profileLinksArraySchema,
  profileLinkSchema,
  profileUpdateSchema,
  safeHttpUrlSchema,
} from '../../src/lib/validation'

test('Vercel applies security headers to every route', async () => {
  const config = JSON.parse(await fs.readFile('vercel.json', 'utf8'))
  const route = config.headers.find((rule: { source: string }) => rule.source === '/(.*)')
  const headers = Object.fromEntries(route.headers.map(({ key, value }: { key: string; value: string }) => [key, value]))

  expect(headers).toMatchObject({
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), geolocation=(), payment=(), usb=(), interest-cohort=(), microphone=(self), focus-without-user-activation=()',
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    'Cross-Origin-Resource-Policy': 'same-origin',
  })
  expect(headers['Content-Security-Policy'].split('; ')).toEqual(expect.arrayContaining([
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "frame-src https://www.youtube.com https://player.vimeo.com",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ]))
})

test('URL and input schemas reject malformed or unsafe input', () => {
  for (const value of [
    'javascript:alert(1)', 'data:text/html,test', 'vbscript:test', '//example.com',
    'https://user:pass@example.com', 'https://@example.com', 'https://exam\tple.com',
    'https:\\example.com', 'https://example.com\u0000',
  ]) {
    expect(sanitizeUrl(value)).toBe('')
    expect(safeHttpUrlSchema.safeParse(value).success).toBe(false)
  }
  expect(sanitizeUrl(' HTTPS://Example.COM ')).toBe('https://example.com/')
  expect(sanitizeUrl('https://example.com?email=user@example.com')).toBe('https://example.com/?email=user@example.com')
  const markup = '<script>placeholder</script>'
  for (const schema of [boxContentSchema, commentContentSchema, groupNameSchema, groupTextMessageSchema]) {
    expect(schema.safeParse(markup).success).toBe(false)
    expect(schema.safeParse('   \n').success).toBe(false)
  }
  expect(profileLinkSchema.safeParse({ label: markup, url: 'https://example.com' }).success).toBe(false)
  expect(profileLinksArraySchema.safeParse(Array(6).fill({ label: 'Link', url: 'https://example.com' })).success).toBe(false)
  expect(profileUpdateSchema.safeParse({ role: 'admin' }).success).toBe(false)
  expect(profileUpdateSchema.safeParse({ username: "name'; SELECT 1" }).success).toBe(false)
  expect(groupTextMessageSchema.safeParse("It's % useful").success).toBe(true)
  expect(createGroupSchema.safeParse({ name: 'Group', memberIds: ['invalid'], clientRequestId: 'invalid' }).success).toBe(false)
  expect(sanitizeText(' <b>hello</b>\u0000 ')).toBe('hello')
  expect(sanitizeHtml('<img src=x>')).toBe('&lt;img src=x&gt;')
})

test('browser sanitization strips markup and permits only basic formatting', async ({ page, baseURL }) => {
  test.skip(baseURL !== 'http://127.0.0.1:4173', 'Source modules are served by the local Vite server')
  await page.route('**/__nbox_security_test__', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
  await page.goto('/__nbox_security_test__')
  const output = await page.evaluate(async modulePath => {
    const { sanitizeText, sanitizeHtml } = await import(modulePath)
    return {
      text: sanitizeText('<b>Hello</b> &amp; welcome<img src=x>\u0000'),
      html: sanitizeHtml('<p class=x>Hello <strong data-test=x>friend</strong><img src=x><svg>hidden</svg></p>'),
    }
  }, '/src/lib/sanitize.ts')
  expect(output).toEqual({ text: 'Hello & welcome', html: '<p>Hello <strong>friend</strong></p>' })
})

test('production JavaScript contains no server credentials', async () => {
  const files = (await fs.readdir('dist/assets')).filter(file => file.endsWith('.js'))
  expect(files.length, 'Run pnpm build to generate the client bundle').toBeGreaterThan(0)
  const env = { ...loadEnv('production', process.cwd(), ''), ...process.env }
  const secrets = Object.entries(env).filter(([key, value]) =>
    /(?:SUPABASE.*(?:SERVICE_ROLE|SECRET)|(?:SERVER|DATABASE|DB)_.*(?:SECRET|PASSWORD)|E2E_.*PASSWORD)/i.test(key)
    && value && value.length >= 8,
  )

  for (const file of files) {
    const source = await fs.readFile('dist/assets/' + file, 'utf8')
    expect(/service_role|sb_secret_[a-zA-Z0-9_-]+|-----BEGIN [A-Z ]*PRIVATE KEY-----/i.test(source), file).toBe(false)
    for (const [name, secret] of secrets) {
      expect(source.includes(secret!), `${file} must exclude ${name}`).toBe(false)
    }
    for (const [token] of source.matchAll(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
      const payload = Buffer.from(token.split('.')[1], 'base64url').toString()
      expect(/"role"\s*:\s*"service_role"/.test(payload), file).toBe(false)
    }
  }
})
