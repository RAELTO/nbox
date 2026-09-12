import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { openAuthenticatedPage } from './support/app'
import { credentialsFor, projectAuthRole } from './support/auth'

type MediaMode = 'available' | 'denied'

interface MockVoiceCapabilityState {
  allowed: boolean
  calls: number
  delayMs: number
}

const voiceCapabilities = new WeakMap<Page, MockVoiceCapabilityState>()

async function installFakeVoiceMedia(page: Page, mode: MediaMode, delayMs = 0) {
  await page.addInitScript(({ mediaMode, mediaDelayMs }) => {
    const mediaState = { getUserMediaCalls: 0, stoppedTracks: 0 }

    class FakeMediaRecorder extends EventTarget {
      static isTypeSupported(type: string) {
        return type === 'audio/webm;codecs=opus' || type === 'audio/webm'
      }

      state: RecordingState = 'inactive'
      readonly mimeType: string

      constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
        super()
        this.mimeType = options?.mimeType || 'audio/webm;codecs=opus'
      }

      start() {
        this.state = 'recording'
      }

      stop() {
        if (this.state === 'inactive') return
        this.state = 'inactive'

        const chunk = new Blob([new Uint8Array([78, 66, 79, 88])], { type: this.mimeType })
        const dataEvent = new Event('dataavailable')
        Object.defineProperty(dataEvent, 'data', { value: chunk })
        this.dispatchEvent(dataEvent)
        this.dispatchEvent(new Event('stop'))
      }
    }

    Object.defineProperty(window, '__voiceTest', {
      configurable: true,
      value: mediaState,
    })
    Object.defineProperty(window, 'MediaRecorder', {
      configurable: true,
      writable: true,
      value: FakeMediaRecorder,
    })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          mediaState.getUserMediaCalls += 1
          if (mediaDelayMs > 0) {
            await new Promise(resolve => window.setTimeout(resolve, mediaDelayMs))
          }
          if (mediaMode === 'denied') {
            throw new DOMException('Permission denied by the test', 'NotAllowedError')
          }

          return {
            getTracks: () => [{
              stop: () => { mediaState.stoppedTracks += 1 },
            }],
          }
        },
      },
    })
  }, { mediaMode: mode, mediaDelayMs: delayMs })
}

async function openFirstConversation(page: Page) {
  await openAuthenticatedPage(page, '/nbox')
  await expect(page.locator('.chat-list-loading')).toBeHidden({ timeout: 15_000 })

  const conversations = page.locator('.chat-item-open')
  await expect.poll(() => conversations.count(), { timeout: 5_000 }).toBeGreaterThan(0).catch(() => {})
  test.skip(await conversations.count() === 0, 'This test user has no conversations')

  await conversations.first().click()
  const composer = page.locator('.chat-thread .chat-composer:not(.compact)')
  await expect(composer).toBeVisible()
  return composer
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => (
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
  )), 'The voice composer should not cause horizontal overflow').toBe(true)
}

test.beforeEach(async ({ page }, testInfo) => {
  const role = projectAuthRole(testInfo.project.metadata)
  test.skip(!credentialsFor(role), `Local credentials are not configured for the ${role} role`)

  const capability = { allowed: true, calls: 0, delayMs: 0 }
  voiceCapabilities.set(page, capability)
  await page.route('**/rest/v1/rpc/get_voice_note_permission', async route => {
    capability.calls += 1
    if (capability.delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, capability.delayMs))
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        allowed: capability.allowed,
        reason: capability.allowed ? 'allowed' : 'recipient_disabled',
      }),
    })
  })
})

test('@voice shared composer preserves regular text messaging', async ({ page }) => {
  await installFakeVoiceMedia(page, 'available')
  const composer = await openFirstConversation(page)
  let insertPayload: Record<string, unknown> | null = null

  await page.route('**/rest/v1/messages*', async route => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    insertPayload = route.request().postDataJSON() as Record<string, unknown>
    const now = new Date().toISOString()
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '44444444-4444-4444-8444-444444444444',
        conversation_id: insertPayload.conversation_id,
        sender_id: insertPayload.sender_id,
        body: insertPayload.body,
        kind: 'text',
        created_at: now,
        edited_at: null,
        deleted_at: null,
        sender: { id: insertPayload.sender_id, username: 'text-test', display_name: 'Text test', avatar_url: null },
        attachments: [],
      }),
    })
  })

  const input = composer.getByRole('textbox', { name: 'Message' })
  await input.fill('  Still a text message  ')
  await composer.getByRole('button', { name: 'Send message' }).click()

  await expect(input).toHaveValue('')
  expect(insertPayload).toMatchObject({ body: 'Still a text message' })
})

test('@voice desktop floating chat uses the shared recorder', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440')
  await installFakeVoiceMedia(page, 'available')
  await openAuthenticatedPage(page)
  const openContact = page.locator('.sidebar-contact-open').first()
  await openContact.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {})
  test.skip(!await openContact.isVisible().catch(() => false), 'This test user has no sidebar contact')

  const conversationId = '55555555-5555-4555-8555-555555555555'
  await page.route('**/rest/v1/conversations*', async route => {
    const url = new URL(route.request().url())
    if (url.searchParams.has('user_a') && url.searchParams.has('user_b')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: conversationId }) })
      return
    }
    await route.continue()
  })
  await page.route('**/rest/v1/messages*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'Content-Range': '*/0' },
    body: '[]',
  }))

  await openContact.click()
  const floatingComposer = page.locator('.float-chat .chat-composer.compact')
  await expect(floatingComposer).toBeVisible()
  await floatingComposer.getByRole('button', { name: 'Record voice message' }).click()
  await expect(floatingComposer.getByRole('button', { name: 'Stop voice recording' })).toBeVisible()
  await floatingComposer.getByRole('button', { name: 'Cancel voice recording' }).click()
  await expect(floatingComposer.getByRole('button', { name: 'Record voice message' })).toBeVisible()
})

test('@voice records, previews, and discards without uploading', async ({ page }) => {
  await installFakeVoiceMedia(page, 'available')
  const composer = await openFirstConversation(page)

  await composer.getByRole('button', { name: 'Record voice message' }).click()
  await expect(composer.getByRole('status')).toContainText('REC')
  await expect(composer.getByRole('button', { name: 'Stop voice recording' })).toBeFocused()

  await composer.getByRole('button', { name: 'Stop voice recording' }).click()
  await expect(composer.getByRole('button', { name: /voice note preview/ })).toBeVisible()
  await expect(composer.getByRole('button', { name: 'Send voice note' })).toBeVisible()

  await composer.getByRole('button', { name: 'Discard voice note' }).click()
  await expect(composer.getByRole('button', { name: 'Record voice message' })).toBeVisible()
  await expect(composer.locator('audio')).toHaveCount(0)

  const state = await page.evaluate(() => (
    window as typeof window & { __voiceTest: { getUserMediaCalls: number; stoppedTracks: number } }
  ).__voiceTest)
  expect(state).toEqual({ getUserMediaCalls: 1, stoppedTracks: 1 })
})

test('@voice coalesces rapid microphone taps into one browser permission request', async ({ page }) => {
  const capability = voiceCapabilities.get(page)
  if (!capability) throw new Error('Voice capability mock was not installed')
  capability.delayMs = 150
  await installFakeVoiceMedia(page, 'available', 150)
  const composer = await openFirstConversation(page)
  const microphone = composer.getByRole('button', { name: 'Record voice message' })
  await expect(microphone).toBeEnabled()

  await microphone.dispatchEvent('click')
  await microphone.dispatchEvent('click')

  await expect(composer.getByRole('button', { name: 'Stop voice recording' })).toBeVisible()
  const state = await page.evaluate(() => (
    window as typeof window & { __voiceTest: { getUserMediaCalls: number } }
  ).__voiceTest)
  expect(state.getUserMediaCalls).toBe(1)

  await composer.getByRole('button', { name: 'Cancel voice recording' }).click()
})

test('@voice ignores a microphone response that arrives after cancellation', async ({ page }) => {
  await installFakeVoiceMedia(page, 'available', 250)
  const composer = await openFirstConversation(page)
  const microphone = composer.getByRole('button', { name: 'Record voice message' })
  await expect(microphone).toBeEnabled()

  await microphone.click()
  await expect(composer).toContainText('CONNECTING MIC')
  await composer.getByRole('button', { name: 'Cancel voice recording' }).click()

  await expect(composer.getByRole('button', { name: 'Record voice message' })).toBeVisible()
  await expect(composer.getByRole('button', { name: 'Stop voice recording' })).toHaveCount(0)
  await expect.poll(async () => page.evaluate(() => (
    window as typeof window & { __voiceTest: { stoppedTracks: number } }
  ).__voiceTest.stoppedTracks)).toBe(1)
})

test('@voice reports denied microphone permission and recovers', async ({ page }) => {
  await installFakeVoiceMedia(page, 'denied')
  const composer = await openFirstConversation(page)

  await composer.getByRole('button', { name: 'Record voice message' }).click()
  await expect(composer.getByRole('alert')).toContainText('Microphone access was denied')
  await expect(composer.getByRole('button', { name: 'Record voice message' })).toBeVisible()

  await composer.getByRole('button', { name: 'Dismiss' }).click()
  await expect(composer.getByRole('alert')).toHaveCount(0)
  await expect(composer.getByRole('button', { name: 'Record voice message' })).toBeEnabled()
})

test('@voice recipient block prevents microphone access and keeps text available', async ({ page }, testInfo) => {
  await installFakeVoiceMedia(page, 'available')
  const capability = voiceCapabilities.get(page)
  if (!capability) throw new Error('Voice capability mock was not installed')
  capability.allowed = false

  const composer = await openFirstConversation(page)
  await expect(composer.getByText('This person is not accepting voice notes in this chat.')).toBeVisible()
  await expect(composer.getByRole('button', { name: 'Voice notes are disabled by the recipient' })).toBeDisabled()
  await expect(composer.getByRole('textbox', { name: 'Message' })).toBeEnabled()
  await expectNoHorizontalOverflow(page)

  const mediaState = await page.evaluate(() => (
    window as typeof window & { __voiceTest: { getUserMediaCalls: number } }
  ).__voiceTest)
  expect(mediaState.getUserMediaCalls).toBe(0)

  let sentText: Record<string, unknown> | null = null
  await page.route('**/rest/v1/messages*', async route => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    sentText = route.request().postDataJSON() as Record<string, unknown>
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        ...sentText,
        id: '77777777-7777-4777-8777-777777777777',
        kind: 'text',
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
        sender: { id: sentText.sender_id, username: 'text-test', display_name: 'Text test', avatar_url: null },
        attachments: [],
      }),
    })
  })
  await composer.getByRole('textbox', { name: 'Message' }).fill('Text still works')
  await composer.getByRole('button', { name: 'Send message' }).click()
  await expect.poll(() => sentText).toMatchObject({ body: 'Text still works' })

  await composer.locator('.voice-compose-notice').screenshot({
    path: testInfo.outputPath('voice-recipient-blocked.png'),
    animations: 'disabled',
    caret: 'hide',
  })

  const results = await new AxeBuilder({ page })
    .include('.chat-thread .chat-composer')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(results.violations.filter(violation =>
    violation.impact === 'critical' || violation.impact === 'serious',
  )).toEqual([])
})

test('@voice recipient block after recording prevents the upload and preserves the draft', async ({ page }) => {
  await installFakeVoiceMedia(page, 'available')
  const capability = voiceCapabilities.get(page)
  if (!capability) throw new Error('Voice capability mock was not installed')
  let uploadRequests = 0
  await page.route('**/storage/v1/object/chat-media/**', async route => {
    uploadRequests += 1
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  const composer = await openFirstConversation(page)
  await composer.getByRole('button', { name: 'Record voice message' }).click()
  await composer.getByRole('button', { name: 'Stop voice recording' }).click()
  capability.allowed = false
  await composer.getByRole('button', { name: 'Send voice note' }).click()

  await expect(composer.getByRole('alert')).toContainText('Your recording was not uploaded')
  await expect(composer.getByRole('button', { name: /voice note preview/ })).toBeVisible()
  expect(uploadRequests).toBe(0)
})

test('@voice uploads first and publishes metadata through the atomic RPC', async ({ page }) => {
  await installFakeVoiceMedia(page, 'available')
  const composer = await openFirstConversation(page)
  let uploadPath = ''
  let rpcPayload: Record<string, unknown> | null = null

  await page.route('**/storage/v1/object/chat-media/**', async route => {
    uploadPath = decodeURIComponent(new URL(route.request().url()).pathname.split('/chat-media/')[1] ?? '')
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ Key: `chat-media/${uploadPath}` }),
    })
  })
  await page.route('**/rest/v1/rpc/create_voice_message', async route => {
    rpcPayload = route.request().postDataJSON() as Record<string, unknown>
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(rpcPayload.p_message_id),
    })
  })
  await composer.getByRole('button', { name: 'Record voice message' }).click()
  await composer.getByRole('button', { name: 'Stop voice recording' }).click()
  await expect(composer.getByRole('button', { name: 'Send voice note' })).toBeVisible()
  await composer.getByRole('button', { name: 'Send voice note' }).click()

  await expect(composer.getByRole('button', { name: 'Record voice message' })).toBeVisible()
  expect(uploadPath).toMatch(/^[0-9a-f-]+\/[0-9a-f-]+\/[0-9a-f-]+\/[0-9a-f-]+\.webm$/)
  expect(rpcPayload).toMatchObject({
    p_storage_path: uploadPath,
    p_mime_type: 'audio/webm',
    p_size_bytes: 4,
  })
  expect(Number(rpcPayload?.p_duration_ms)).toBeGreaterThan(0)
})

test('@voice removes an unreferenced upload when publication fails', async ({ page }) => {
  await installFakeVoiceMedia(page, 'available')
  const composer = await openFirstConversation(page)
  let uploadPath = ''
  let cleanupPaths: string[] = []

  await page.route('**/storage/v1/object/chat-media/**', async route => {
    uploadPath = decodeURIComponent(new URL(route.request().url()).pathname.split('/chat-media/')[1] ?? '')
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ Key: `chat-media/${uploadPath}` }),
    })
  })
  await page.route(/\/storage\/v1\/object\/chat-media(?:\?.*)?$/, async route => {
    cleanupPaths = (route.request().postDataJSON() as { prefixes?: string[] } | null)?.prefixes ?? []
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route('**/rest/v1/rpc/create_voice_message', route => route.fulfill({
    status: 400,
    contentType: 'application/json',
    body: JSON.stringify({ code: '22023', message: 'Forced publication failure' }),
  }))
  await composer.getByRole('button', { name: 'Record voice message' }).click()
  await composer.getByRole('button', { name: 'Stop voice recording' }).click()
  await composer.getByRole('button', { name: 'Send voice note' }).click()

  await expect(composer.getByRole('alert')).toContainText('Your recording is still here to retry')
  await expect(composer.getByRole('button', { name: /voice note preview/ })).toBeVisible()
  expect(cleanupPaths).toEqual([uploadPath])
})

test('@voice final policy race removes the upload and shows the recipient notice', async ({ page }) => {
  await installFakeVoiceMedia(page, 'available')
  const composer = await openFirstConversation(page)
  let uploadPath = ''
  let cleanupPaths: string[] = []

  await page.route('**/storage/v1/object/chat-media/**', async route => {
    uploadPath = decodeURIComponent(new URL(route.request().url()).pathname.split('/chat-media/')[1] ?? '')
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  await page.route(/\/storage\/v1\/object\/chat-media(?:\?.*)?$/, async route => {
    cleanupPaths = (route.request().postDataJSON() as { prefixes?: string[] } | null)?.prefixes ?? []
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route('**/rest/v1/rpc/create_voice_message', route => route.fulfill({
    status: 403,
    contentType: 'application/json',
    body: JSON.stringify({
      code: '42501',
      details: null,
      hint: null,
      message: 'VOICE_NOTES_BLOCKED_BY_RECIPIENT',
    }),
  }))

  await composer.getByRole('button', { name: 'Record voice message' }).click()
  await composer.getByRole('button', { name: 'Stop voice recording' }).click()
  await composer.getByRole('button', { name: 'Send voice note' }).click()

  await expect(composer.getByRole('alert')).toContainText('Your recording was not uploaded')
  await expect(composer.getByRole('button', { name: /voice note preview/ })).toBeVisible()
  expect(cleanupPaths).toEqual([uploadPath])
})

test('@voice per-chat setting saves a personal block without a real database write', async ({ page }, testInfo) => {
  await installFakeVoiceMedia(page, 'available')
  const composer = await openFirstConversation(page)
  let savedPolicy: Record<string, unknown> | null = null
  let persistedPolicy = 'inherit'

  await page.route('**/rest/v1/profiles*', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ voice_notes_enabled: true }) })
      return
    }
    await route.continue()
  })
  await page.route('**/rest/v1/conversation_participants*', async route => {
    if (route.request().method() === 'PATCH') {
      savedPolicy = route.request().postDataJSON() as Record<string, unknown>
      persistedPolicy = String(savedPolicy.voice_notes_mode)
      await route.fulfill({ status: 204, body: '' })
      return
    }
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ voice_notes_mode: persistedPolicy }) })
  })

  const thread = composer.locator('..')
  await thread.getByRole('button', { name: 'Voice note settings' }).click()
  const dialog = page.getByRole('dialog', { name: 'Voice notes' })
  await expect(dialog).toBeVisible()
  const allowHere = dialog.getByRole('radio', { name: /Allow here/ })
  const blockHere = dialog.getByRole('radio', { name: /Block here/ })
  if (await blockHere.getAttribute('aria-checked') === 'true') {
    await allowHere.click()
    await expect.poll(() => savedPolicy).toEqual({ voice_notes_mode: 'allow' })
    savedPolicy = null
  }
  await blockHere.click()
  await expect.poll(() => savedPolicy).toEqual({ voice_notes_mode: 'block' })
  await expect(blockHere).toBeChecked()

  await dialog.screenshot({
    path: testInfo.outputPath('voice-policy-dialog.png'),
    animations: 'disabled',
  })
  const results = await new AxeBuilder({ page })
    .include('.voice-policy-panel')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(results.violations.filter(violation =>
    violation.impact === 'critical' || violation.impact === 'serious',
  )).toEqual([])
})

test('@voice global setting emits an intercepted profile update', async ({ page }, testInfo) => {
  await openAuthenticatedPage(page, '/my-box')
  const setting = page.locator('#voice-note-settings')
  await expect(setting).toBeVisible()

  let savedPreference: Record<string, unknown> | null = null
  await page.route('**/rest/v1/profiles*', async route => {
    if (route.request().method() !== 'PATCH') {
      await route.continue()
      return
    }
    savedPreference = route.request().postDataJSON() as Record<string, unknown>
    await route.fulfill({ status: 204, body: '' })
  })

  const allow = setting.getByRole('radio', { name: /Allow/ })
  const block = setting.getByRole('radio', { name: /Block/ })
  const next = await allow.getAttribute('aria-checked') === 'true' ? block : allow
  const expected = next === block
    ? { voice_notes_enabled: false }
    : { voice_notes_enabled: true }
  await next.click()
  await expect.poll(() => savedPreference).toEqual(expected)

  await setting.screenshot({
    path: testInfo.outputPath('voice-global-setting.png'),
    animations: 'disabled',
  })
  const results = await new AxeBuilder({ page })
    .include('#voice-note-settings')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(results.violations.filter(violation =>
    violation.impact === 'critical' || violation.impact === 'serious',
  )).toEqual([])
})

test('@voice message requests its private audio only when playback starts', async ({ page }, testInfo) => {
  await installFakeVoiceMedia(page, 'available')
  await page.addInitScript(() => {
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value() {
        this.dispatchEvent(new Event('play'))
        return Promise.resolve()
      },
    })
  })

  await page.route('**/rest/v1/messages*', async route => {
    const url = new URL(route.request().url())
    const conversationId = url.searchParams.get('conversation_id')?.replace(/^eq\./, '')
    if (route.request().method() !== 'GET' || !conversationId) {
      await route.continue()
      return
    }
    const messageId = '11111111-1111-4111-8111-111111111111'
    const senderId = '22222222-2222-4222-8222-222222222222'
    const now = new Date().toISOString()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': '0-0/1' },
      body: JSON.stringify([{
        id: messageId,
        conversation_id: conversationId,
        sender_id: senderId,
        body: 'Voice note',
        kind: 'voice',
        created_at: now,
        edited_at: null,
        deleted_at: null,
        sender: { id: senderId, username: 'voice-test', display_name: 'Voice test', avatar_url: null },
        attachments: [{
          id: '33333333-3333-4333-8333-333333333333',
          message_id: messageId,
          kind: 'voice',
          storage_path: `${conversationId}/${senderId}/${messageId}/33333333-3333-4333-8333-333333333333.webm`,
          mime_type: 'audio/webm',
          size_bytes: 4,
          duration_ms: 12_000,
          position: 0,
          created_at: now,
        }],
      }]),
    })
  })

  let signedUrlRequests = 0
  await page.route('**/storage/v1/object/sign/chat-media/**', async route => {
    signedUrlRequests += 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ signedURL: '/storage/v1/object/sign/chat-media/voice-test.webm?token=test' }),
    })
  })

  await openFirstConversation(page)
  const voiceBubble = page.locator('.chat-thread .msg-bubble.voice').first()
  const playButton = voiceBubble.getByRole('button', { name: /Play voice note/ })
  await expect(playButton).toBeVisible()
  expect(signedUrlRequests).toBe(0)

  await voiceBubble.screenshot({
    path: testInfo.outputPath('voice-message-bubble.png'),
    animations: 'disabled',
  })
  await playButton.click()
  await expect.poll(() => signedUrlRequests).toBe(1)
  await expect(voiceBubble.getByRole('button', { name: /Pause voice note/ })).toBeVisible()
})

test('@voice composer fits recording and preview states at every viewport', async ({ page }, testInfo) => {
  await installFakeVoiceMedia(page, 'available')
  const composer = await openFirstConversation(page)

  await expectNoHorizontalOverflow(page)
  await composer.getByRole('button', { name: 'Record voice message' }).click()
  await expect(composer.getByRole('button', { name: 'Stop voice recording' })).toBeVisible()
  await expectNoHorizontalOverflow(page)

  await composer.getByRole('button', { name: 'Stop voice recording' }).click()
  await expect(composer.getByRole('button', { name: /voice note preview/ })).toBeVisible()
  await expectNoHorizontalOverflow(page)

  await composer.screenshot({
    path: testInfo.outputPath('voice-preview-composer.png'),
    animations: 'disabled',
    caret: 'hide',
  })

  const results = await new AxeBuilder({ page })
    .include('.chat-composer.voice-compose.preview')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const blocking = results.violations.filter(violation =>
    violation.impact === 'critical' || violation.impact === 'serious',
  )

  await testInfo.attach('axe-voice-preview.json', {
    body: Buffer.from(JSON.stringify(results.violations, null, 2)),
    contentType: 'application/json',
  })
  expect(blocking, 'See the attached axe-voice-preview.json report').toEqual([])
})
