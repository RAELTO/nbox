import { randomUUID } from 'node:crypto'
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { loadEnv } from 'vite'
import { authStatePath, credentialsFor, type AuthRole } from './auth'

const env = { ...loadEnv('e2e', process.cwd(), ''), ...process.env }
const roles = ['demo', 'user', 'admin'] as const

export const groupFixturesConfigured = env.E2E_GROUPS_ENABLED === 'true'
  && roles.every(role => credentialsFor(role))
  && Boolean(env.VITE_SUPABASE_URL && (env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY))

interface Reply<T> {
  status: number
  data: T
}

interface Session {
  access_token: string
  user: { id: string }
}

class GroupActor {
  constructor(readonly page: Page, readonly id: string) {}

  request<T>(path: string, method = 'GET', body?: object | number[], contentType = 'application/json'): Promise<Reply<T>> {
    return this.page.evaluate(async ({ url, key, path, method, body, contentType }) => {
      const session = JSON.parse(localStorage.getItem(`sb-${new URL(url).hostname.split('.')[0]}-auth-token`) || 'null') as Session | null
      if (!session?.access_token) throw new Error('Expected an authenticated Supabase session')
      const response = await fetch(url + path, {
        method,
        headers: { apikey: key, Authorization: `Bearer ${session.access_token}`, 'Content-Type': contentType },
        body: body && (contentType === 'application/json' ? JSON.stringify(body) : new Uint8Array(body as number[])),
      })
      return { status: response.status, data: await response.json() }
    }, {
      url: env.VITE_SUPABASE_URL!.replace(/\/$/, ''),
      key: (env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY)!,
      path, method, body, contentType,
    })
  }

  async rpc<T>(name: string, args: object): Promise<T> {
    const reply = await this.request<T>(`/rest/v1/rpc/${name}`, 'POST', args)
    expect(reply.status, name).toBe(200)
    return reply.data
  }

  async expectError(name: string, args: object, message: string) {
    const reply = await this.request<{ message: string }>(`/rest/v1/rpc/${name}`, 'POST', args)
    expect(reply.status).toBeGreaterThanOrEqual(400)
    expect(reply.data.message).toBe(message)
  }
}

async function actorFor(page: Page, baseURL: string) {
  await page.goto(baseURL + '/login', { waitUntil: 'domcontentloaded' })
  const id = await page.evaluate(url => {
    const key = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`
    const session = JSON.parse(localStorage.getItem(key) || 'null') as Session | null
    return session?.user.id
  }, env.VITE_SUPABASE_URL!)
  expect(id, 'The fixture account has a browser auth session').toBeTruthy()
  return new GroupActor(page, id!)
}

export async function withGroupFixture(
  browser: Browser,
  ownerPage: Page,
  baseURL: string,
  run: (fixture: { owner: GroupActor; member: GroupActor; other: GroupActor; groupId: string; createRequestId: string; name: string }) => Promise<void>,
) {
  const contexts: BrowserContext[] = []
  try {
    const openActor = async (role: AuthRole) => {
      const context = await browser.newContext({ storageState: authStatePath(role), ignoreHTTPSErrors: true })
      contexts.push(context)
      return actorFor(await context.newPage(), baseURL)
    }
    const owner = await actorFor(ownerPage, baseURL)
    const member = await openActor('user')
    const other = await openActor('admin')
    expect(new Set([owner.id, member.id, other.id]).size).toBe(3)

    const createRequestId = randomUUID()
    const name = 'E2E group ' + createRequestId.slice(0, 8)
    const groupId = await owner.rpc<string>('create_group_conversation', {
      p_name: name, p_member_ids: [member.id, other.id], p_client_request_id: createRequestId,
    })
    try {
      await run({ owner, member, other, groupId, createRequestId, name })
    } finally {
      const roster = await owner.request<Array<{ user_id: string }>>('/rest/v1/rpc/get_group_members', 'POST', { p_conversation_id: groupId })
      // A successful lifecycle test already closes its own fixture.
      if (roster.status === 200) {
        for (const participant of roster.data.filter(row => row.user_id !== owner.id)) {
          await owner.rpc('remove_group_member', {
            p_conversation_id: groupId, p_user_id: participant.user_id, p_client_request_id: randomUUID(),
          })
        }
        await owner.rpc('close_group_conversation', { p_conversation_id: groupId, p_client_request_id: randomUUID() })
      }
    }
  } finally {
    await Promise.all(contexts.map(context => context.close()))
  }
}
