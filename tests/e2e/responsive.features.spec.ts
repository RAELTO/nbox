import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { loadEnv } from 'vite'

const VIEWPORTS = [
  { name: '360x800', width: 360, height: 800, isMobile: true },
  { name: '390x844', width: 390, height: 844, isMobile: true },
  { name: '768x1024', width: 768, height: 1024, isMobile: false },
  { name: '1024x768', width: 1024, height: 768, isMobile: false },
  { name: '1440x900', width: 1440, height: 900, isMobile: false },
] as const

const USER_ID = '11111111-1111-4111-8111-111111111111'
const CONTACT_A_ID = '22222222-2222-4222-8222-222222222222'
const CONTACT_B_ID = '33333333-3333-4333-8333-333333333333'
const GROUP_ID = '44444444-4444-4444-8444-444444444444'
const DIRECT_ID = '55555555-5555-4555-8555-555555555555'
const PINNED_BOX_ID = '66666666-6666-4666-8666-666666666666'
const MEDIA_BOX_ID = '77777777-7777-4777-8777-777777777777'

function supabaseStorageKey(): string {
  const env = { ...loadEnv('e2e', process.cwd(), ''), ...process.env }
  const url = env.VITE_SUPABASE_URL?.trim() || 'https://korxgckhjvsrknunqiif.supabase.co'
  const ref = new URL(url).hostname.split('.')[0]
  return `sb-${ref}-auth-token`
}

function makeFakeJwt(userId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'demo@nbox.test',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString('base64url')
  return `${header}.${payload}.fake-signature`
}

async function installMockSessionAndApi(page: Page) {
  const storageKey = supabaseStorageKey()
  const accessToken = makeFakeJwt(USER_ID)
  const now = new Date().toISOString()

  const telemetry = {
    signedUrlCalls: 0,
    notifPatchPayloads: [] as Array<{ url: string; body: unknown }>,
    groupTextPayloads: [] as unknown[],
    createGroupPayloads: [] as unknown[],
  }

  let notifications = [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      recipient_id: USER_ID,
      actor_id: CONTACT_A_ID,
      kind: 'vote',
      source_table: 'box_votes',
      source_id: PINNED_BOX_ID,
      box_id: PINNED_BOX_ID,
      comment_id: null,
      contact_request_id: null,
      metadata: { vote: 'like' },
      dedup_key: 'vote:1',
      read_at: null,
      created_at: now,
      updated_at: now,
      actor: {
        id: CONTACT_A_ID,
        username: 'alex_skate',
        display_name: 'Alex Skate',
        avatar_url: null,
      },
    },
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
      recipient_id: USER_ID,
      actor_id: CONTACT_B_ID,
      kind: 'comment',
      source_table: 'box_comments',
      source_id: MEDIA_BOX_ID,
      box_id: MEDIA_BOX_ID,
      comment_id: null,
      contact_request_id: null,
      metadata: {},
      dedup_key: 'comment:2',
      read_at: null,
      created_at: now,
      updated_at: now,
      actor: {
        id: CONTACT_B_ID,
        username: 'maya_zine',
        display_name: 'Maya Zine',
        avatar_url: null,
      },
    },
  ]

  await page.addInitScript(
    ({ key, token, userId }) => {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600
      window.localStorage.setItem(
        key,
        JSON.stringify({
          access_token: token,
          refresh_token: 'fake-refresh',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: expiresAt,
          user: {
            id: userId,
            aud: 'authenticated',
            role: 'authenticated',
            email: 'demo@nbox.test',
            app_metadata: { provider: 'email' },
            user_metadata: { display_name: 'Demo Brutal', username: 'demo_brutal' },
          },
        }),
      )
    },
    { key: storageKey, token: accessToken, userId: USER_ID },
  )

  await page.route('**/realtime/v1/**', route => route.abort())
  await page.route('**/auth/v1/user*', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: USER_ID,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'demo@nbox.test',
      }),
    }),
  )

  await page.route('**/storage/v1/object/sign/chat-media/**', async route => {
    telemetry.signedUrlCalls += 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ signedURL: '/storage/v1/object/sign/chat-media/mock.webm?token=x' }),
    })
  })

  await page.route('**/rest/v1/**', async route => {
    const req = route.request()
    const url = new URL(req.url())
    const pathname = url.pathname
    const accept = req.headers()['accept'] ?? ''
    const isSingle = accept.includes('application/vnd.pgrst.object+json')
    const method = req.method()

    const json = (body: unknown, status = 200, extraHeaders?: Record<string, string>) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers: extraHeaders,
        body: JSON.stringify(body),
      })

    if (pathname.endsWith('/rpc/get_inbox_conversations')) {
      return json({
        items: [
          {
            id: GROUP_ID,
            type: 'group',
            name: 'Weekend Crew',
            status: 'active',
            member_count: 3,
            my_role: 'admin',
            voice_notes_allowed: false,
            voice_policy_version: 2,
            history_from_sequence: 1,
            last_message_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
            last_message_sender_id: null,
            last_message_at: now,
            last_message_text: null,
            last_message_kind: 'system',
            last_system_event_type: 'group_voice_policy_changed',
            created_at: now,
            updated_at: now,
            my_last_read_at: null,
            has_unread: false,
            my_voice_notes_mode: 'block',
          },
          {
            id: DIRECT_ID,
            type: 'direct',
            user_a: USER_ID,
            user_b: CONTACT_A_ID,
            other: {
              id: CONTACT_A_ID,
              username: 'alex_skate',
              display_name: 'Alex Skate',
              avatar_url: null,
            },
            last_message_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9',
            last_message_sender_id: CONTACT_A_ID,
            last_message_at: now,
            last_message_text: 'See you at the plaza',
            last_message_kind: 'text',
            last_system_event_type: null,
            created_at: now,
            updated_at: now,
            my_last_read_at: now,
            has_unread: false,
            my_voice_notes_mode: 'inherit',
          },
        ],
        has_more: false,
      })
    }

    if (pathname.endsWith('/rpc/get_group_voice_state')) {
      return json({
        conversation_id: GROUP_ID,
        status: 'active',
        voice_notes_allowed: false,
        voice_policy_version: 2,
        my_role: 'admin',
        personal_mode: 'block',
        global_enabled: true,
        effective_can_receive: false,
        effective_can_publish: false,
      })
    }

    if (pathname.endsWith('/rpc/get_voice_note_permission')) {
      return json({
        allowed: false,
        reason: 'group_voice_disabled',
        policy_version: 2,
      })
    }

    if (pathname.endsWith('/rpc/get_group_members')) {
      return json([
        {
          user_id: USER_ID,
          username: 'demo_brutal',
          display_name: 'Demo Brutal',
          avatar_url: null,
          role: 'admin',
          joined_at: now,
        },
        {
          user_id: CONTACT_A_ID,
          username: 'alex_skate',
          display_name: 'Alex Skate',
          avatar_url: null,
          role: 'member',
          joined_at: now,
        },
        {
          user_id: CONTACT_B_ID,
          username: 'maya_zine',
          display_name: 'Maya Zine',
          avatar_url: null,
          role: 'member',
          joined_at: now,
        },
      ])
    }

    if (pathname.endsWith('/rpc/create_group_conversation')) {
      telemetry.createGroupPayloads.push(req.postDataJSON())
      return json(GROUP_ID)
    }

    if (pathname.endsWith('/rpc/publish_group_text_message')) {
      telemetry.groupTextPayloads.push(req.postDataJSON())
      return json('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5')
    }

    if (pathname.endsWith('/profiles')) {
      const profile = {
        id: USER_ID,
        display_name: 'Demo Brutal',
        username: 'demo_brutal',
        bio: 'Building modular brutalist boxes.',
        avatar_url: null,
        role: 'user',
        is_banned: false,
        voice_notes_enabled: true,
        pinned_box_id: PINNED_BOX_ID,
        links: [
          { label: 'NBOX Repo', url: 'https://nbox.dev' },
          { label: 'Blocked XSS', url: 'javascript:alert(1)' },
        ],
        created_at: '2026-01-15T12:00:00.000Z',
        updated_at: now,
      }
      return json(isSingle ? profile : [profile])
    }

    if (pathname.endsWith('/boxes')) {
      if (req.method() === 'HEAD' || url.searchParams.get('select') === 'id') {
        return json([], 200, { 'Content-Range': '0-1/2' })
      }
      return json([
        {
          id: PINNED_BOX_ID,
          author_id: USER_ID,
          type: 'quick',
          content: 'Pinned manifesto drop for NBOX.',
          payload: {},
          status: 'published',
          published_at: now,
          created_at: now,
          updated_at: now,
          author: {
            id: USER_ID,
            username: 'demo_brutal',
            display_name: 'Demo Brutal',
            avatar_url: null,
            role: 'user',
          },
          tags: [],
          reaction_count: [{ count: 1 }],
          comment_count: [{ count: 0 }],
        },
        {
          id: MEDIA_BOX_ID,
          author_id: USER_ID,
          type: 'media',
          content: 'Concrete skatepark study',
          payload: {
            kind: 'video',
            url: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
          },
          status: 'published',
          published_at: now,
          created_at: now,
          updated_at: now,
          author: {
            id: USER_ID,
            username: 'demo_brutal',
            display_name: 'Demo Brutal',
            avatar_url: null,
            role: 'user',
          },
          tags: [],
          reaction_count: [{ count: 0 }],
          comment_count: [{ count: 0 }],
        },
      ])
    }

    if (pathname.endsWith('/box_saves')) {
      return json([
        {
          created_at: now,
          box: {
            id: MEDIA_BOX_ID,
            author_id: CONTACT_A_ID,
            type: 'quick',
            content: 'Saved drop from Alex',
            payload: {},
            status: 'published',
            published_at: now,
            created_at: now,
            updated_at: now,
            author: {
              id: CONTACT_A_ID,
              username: 'alex_skate',
              display_name: 'Alex Skate',
              avatar_url: null,
              role: 'user',
            },
            tags: [],
            reaction_count: [{ count: 0 }],
            comment_count: [{ count: 0 }],
          },
        },
      ])
    }

    if (pathname.endsWith('/contacts')) {
      return json([
        {
          user_a: USER_ID,
          user_b: CONTACT_A_ID,
          created_at: now,
          profile_a: { id: USER_ID, username: 'demo_brutal', display_name: 'Demo Brutal', avatar_url: null },
          profile_b: { id: CONTACT_A_ID, username: 'alex_skate', display_name: 'Alex Skate', avatar_url: null },
        },
        {
          user_a: USER_ID,
          user_b: CONTACT_B_ID,
          created_at: now,
          profile_a: { id: USER_ID, username: 'demo_brutal', display_name: 'Demo Brutal', avatar_url: null },
          profile_b: { id: CONTACT_B_ID, username: 'maya_zine', display_name: 'Maya Zine', avatar_url: null },
        },
      ])
    }

    if (pathname.endsWith('/messages')) {
      return json([
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
          conversation_id: GROUP_ID,
          sender_id: CONTACT_A_ID,
          body: 'Voice note',
          kind: 'voice',
          group_sequence: 3,
          client_request_id: null,
          system_event_type: null,
          system_event_payload: null,
          created_at: now,
          edited_at: null,
          deleted_at: null,
          sender: { id: CONTACT_A_ID, username: 'alex_skate', display_name: 'Alex Skate', avatar_url: null },
          attachments: [],
        },
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
          conversation_id: GROUP_ID,
          sender_id: null,
          body: 'Group voice policy changed',
          kind: 'system',
          group_sequence: 2,
          client_request_id: null,
          system_event_type: 'group_voice_policy_changed',
          system_event_payload: { actor_id: USER_ID, actor_name: 'Demo Brutal', enabled: false },
          created_at: now,
          edited_at: null,
          deleted_at: null,
          sender: null,
          attachments: [],
        },
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
          conversation_id: GROUP_ID,
          sender_id: null,
          body: 'Group created',
          kind: 'system',
          group_sequence: 1,
          client_request_id: null,
          system_event_type: 'group_created',
          system_event_payload: { actor_id: USER_ID, actor_name: 'Demo Brutal', group_name: 'Weekend Crew' },
          created_at: now,
          edited_at: null,
          deleted_at: null,
          sender: null,
          attachments: [],
        },
      ])
    }

    if (pathname.endsWith('/notifications')) {
      if (method === 'PATCH') {
        const body = req.postDataJSON()
        telemetry.notifPatchPayloads.push({ url: req.url(), body })
        const idFilter = url.searchParams.get('id')?.replace(/^eq\./, '')
        notifications = notifications.map(n =>
          !idFilter || n.id === idFilter ? { ...n, read_at: now } : n,
        )
        return json([], 204)
      }
      if (req.method() === 'HEAD') {
        const unread = notifications.filter(n => !n.read_at).length
        return json([], 200, { 'Content-Range': `0-0/${unread}` })
      }
      return json(notifications)
    }

    if (pathname.endsWith('/follows') || pathname.endsWith('/contact_requests') || pathname.endsWith('/box_tags') || pathname.endsWith('/box_reactions') || pathname.endsWith('/box_votes') || pathname.endsWith('/box_shares')) {
      if (req.method() === 'HEAD') {
        return json([], 200, { 'Content-Range': '0-0/0' })
      }
      return json([])
    }

    return json(isSingle ? null : [])
  })

  return telemetry
}

async function assertNoHorizontalOverflow(page: Page, contextLabel: string) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(
    overflow.scrollWidth,
    `Horizontal overflow in ${contextLabel}: scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1)
}

async function assertNoBlockingAxeViolations(page: Page, scope?: string) {
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
  if (scope) builder = builder.include(scope)
  const results = await builder.analyze()
  const blocking = results.violations.filter(
    v => v.impact === 'critical' || v.impact === 'serious',
  )
  expect(blocking, `Blocking Axe violations${scope ? ` in ${scope}` : ''}: ${JSON.stringify(blocking)}`).toEqual([])
}

for (const vp of VIEWPORTS) {
  test.describe(`@responsive viewport ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.isMobile })

    test(`profile tabs, pinned box, about links & sanitization fit ${vp.name}`, async ({ page }) => {
      await installMockSessionAndApi(page)
      await page.goto('/profile/demo_brutal', { waitUntil: 'domcontentloaded' })

      await expect(page.getByText('PINNED BOX')).toBeVisible()
      await expect(page.getByText('Pinned manifesto drop for NBOX.')).toBeVisible()
      await assertNoHorizontalOverflow(page, `profile boxes ${vp.name}`)

      const tabs = page.getByRole('tablist', { name: 'Profile sections' })
      await expect(tabs).toBeVisible()
      await page.getByRole('tab', { name: /Media/i }).click()
      await expect(page.getByText('Concrete skatepark study')).toBeVisible()
      await assertNoHorizontalOverflow(page, `profile media ${vp.name}`)

      await page.getByRole('tab', { name: /Saves/i }).click()
      await expect(page.getByText('Saved drop from Alex')).toBeVisible()

      await page.getByRole('tab', { name: /About/i }).click()
      await expect(page.getByText(/January 15, 2026/)).toBeVisible()
      await expect(page.getByRole('link', { name: /NBOX Repo/i })).toBeVisible()
      await expect(page.getByText('Blocked XSS')).toHaveCount(0)
      await assertNoHorizontalOverflow(page, `profile about ${vp.name}`)
      await assertNoBlockingAxeViolations(page, '.profile-tabs-wrap')
    })

    test(`group chat create, voice controls, placeholder & details fit ${vp.name}`, async ({ page }) => {
      const telemetry = await installMockSessionAndApi(page)
      await page.goto('/nbox', { waitUntil: 'domcontentloaded' })
      await expect(page.getByText('Weekend Crew')).toBeVisible()
      await assertNoHorizontalOverflow(page, `inbox list ${vp.name}`)

      await page.getByRole('button', { name: 'New' }).click()
      const createDialog = page.getByRole('dialog', { name: 'New chat' })
      await expect(createDialog).toBeVisible()
      await assertNoHorizontalOverflow(page, `create group dialog ${vp.name}`)

      const createSubmit = createDialog.getByRole('button', { name: 'Create group' })
      await expect(createSubmit).toBeDisabled()
      await createDialog.getByLabel('Group name').fill('Night Riders')
      await createDialog.getByLabel(/Alex Skate/i).check()
      await createDialog.getByLabel(/Maya Zine/i).check()
      await expect(createSubmit).toBeEnabled()
      await createSubmit.click()
      await expect.poll(() => telemetry.createGroupPayloads.length).toBe(1)

      if (vp.width <= 820) {
        await expect(page.locator('.chat-thread')).toBeVisible()
        await page.locator('[data-mobile-back]').click()
        await expect(page.getByText('Weekend Crew').first()).toBeVisible()
        await page.getByText('Weekend Crew').first().click()
      } else {
        await expect(page.getByText('Weekend Crew').first()).toBeVisible()
        await page.getByText('Weekend Crew').first().click()
      }

      await expect(page.getByText('Demo Brutal disabled voice notes for this group.')).toBeVisible()
      await expect(page.getByText('Voice note hidden')).toBeVisible()
      await expect(page.locator('.chat-thread audio')).toHaveCount(0)
      expect(telemetry.signedUrlCalls).toBe(0)

      await expect(page.getByText('An admin disabled voice notes in this group.')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Voice notes are disabled in this group' })).toBeDisabled()
      const msgInput = page.getByRole('textbox', { name: 'Message' })
      await msgInput.fill('Text works while voice is blocked')
      await page.getByRole('button', { name: 'Send message' }).click()
      await expect.poll(() => telemetry.groupTextPayloads.length).toBe(1)
      await assertNoHorizontalOverflow(page, `group thread ${vp.name}`)

      await page.getByRole('button', { name: 'Group details' }).click()
      const detailsDialog = page.getByRole('dialog', { name: 'Group details' })
      await expect(detailsDialog).toBeVisible()
      await expect(detailsDialog.getByText('PRIVATE TO YOU')).toBeVisible()
      await expect(detailsDialog.getByText('ADMIN CONTROL')).toBeVisible()
      await assertNoHorizontalOverflow(page, `group details ${vp.name}`)
      await assertNoBlockingAxeViolations(page, '.group-details-panel')
    })

    test(`notifications require explicit mark-read actions at ${vp.name}`, async ({ page }) => {
      const telemetry = await installMockSessionAndApi(page)
      await page.goto('/notifications', { waitUntil: 'domcontentloaded' })

      await expect(page.getByText('2 unread')).toBeVisible()
      expect(telemetry.notifPatchPayloads.length).toBe(0)

      await page.getByRole('button', { name: 'Mark read' }).first().click()
      await expect.poll(() => telemetry.notifPatchPayloads.length).toBe(1)

      await page.getByRole('button', { name: 'Mark all read' }).click()
      await expect.poll(() => telemetry.notifPatchPayloads.length).toBe(2)
      await expect(page.getByRole('button', { name: 'Mark all read' })).toHaveCount(0)

      await assertNoHorizontalOverflow(page, `notifications ${vp.name}`)
      await assertNoBlockingAxeViolations(page, '#main-content')
    })
  })
}

test('gracefully falls back when Supabase migrations are not yet applied', async ({ page }) => {
  await installMockSessionAndApi(page)
  const now = new Date().toISOString()
  let inboxRpcCalls = 0
  let extendedProfileCalls = 0
  let groupSeqMessageCalls = 0

  await page.route('**/rest/v1/rpc/get_inbox_conversations*', async route => {
    inboxRpcCalls += 1
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'PGRST202',
        details: 'Searched for the function public.get_inbox_conversations with parameter p_limit',
        hint: 'Perhaps you meant to call the function public.get_voice_note_permission',
        message: 'Could not find the function public.get_inbox_conversations(p_limit) in the schema cache',
      }),
    })
  })

  await page.route('**/rest/v1/profiles*', async route => {
    const req = route.request()
    const url = new URL(req.url())
    const selectParam = url.searchParams.get('select') ?? ''
    if (selectParam.includes('pinned_box_id') || selectParam.includes('links')) {
      extendedProfileCalls += 1
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          code: '42703',
          details: null,
          hint: null,
          message: 'column profiles.pinned_box_id does not exist',
        }),
      })
      return
    }
    const isSingle = (req.headers()['accept'] ?? '').includes('application/vnd.pgrst.object+json')
    const legacyProfile = {
      id: USER_ID,
      display_name: 'Demo Brutal',
      username: 'demo_brutal',
      bio: 'Building modular brutalist boxes.',
      avatar_url: null,
      role: 'user',
      is_banned: false,
      voice_notes_enabled: true,
      created_at: '2026-01-15T12:00:00.000Z',
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(isSingle ? legacyProfile : [legacyProfile]),
    })
  })

  await page.route('**/rest/v1/conversations*', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: DIRECT_ID,
          type: 'direct',
          user_a: USER_ID,
          user_b: CONTACT_A_ID,
          last_message_at: now,
          last_message_text: 'Legacy direct text',
          created_at: now,
          profile_a: { id: USER_ID, username: 'demo_brutal', display_name: 'Demo Brutal', avatar_url: null },
          profile_b: { id: CONTACT_A_ID, username: 'alex_skate', display_name: 'Alex Skate', avatar_url: null },
        },
      ]),
    })
  })

  await page.route('**/rest/v1/conversation_participants*', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { conversation_id: DIRECT_ID, last_read_at: now, voice_notes_mode: 'inherit' },
      ]),
    })
  })

  await page.route('**/rest/v1/messages*', async route => {
    const url = new URL(route.request().url())
    const orderParam = url.searchParams.get('order') ?? ''
    if (orderParam.includes('group_sequence')) {
      groupSeqMessageCalls += 1
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          code: '42703',
          details: null,
          hint: null,
          message: 'column messages.group_sequence does not exist',
        }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9',
          conversation_id: DIRECT_ID,
          sender_id: CONTACT_A_ID,
          body: 'Legacy direct text',
          kind: 'text',
          created_at: now,
          edited_at: null,
          deleted_at: null,
          sender: { id: CONTACT_A_ID, username: 'alex_skate', display_name: 'Alex Skate', avatar_url: null },
          attachments: [],
        },
      ]),
    })
  })

  await page.goto('/my-box', { waitUntil: 'domcontentloaded' })
  await expect(page.getByLabel('Display name')).toHaveValue('Demo Brutal')
  await expect(page.locator('#main-content').getByText('@demo_brutal')).toBeVisible()
  expect(extendedProfileCalls).toBeLessThanOrEqual(2)

  await page.locator('.side-nav').getByRole('link', { name: 'NBOX' }).click()
  const chatRow = page.locator('.chat-list').getByText('Alex Skate').first()
  await expect(chatRow).toBeVisible()
  await chatRow.click()
  await expect(page.locator('.chat-thread').getByText('Legacy direct text').first()).toBeVisible()
  expect(inboxRpcCalls).toBe(1)
  expect(groupSeqMessageCalls).toBe(1)
})
