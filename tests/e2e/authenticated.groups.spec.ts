import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { groupFixturesConfigured, withGroupFixture } from './support/groups'

test('group creation, voice controls, reception privacy, and membership lifecycle', async ({ browser, page, baseURL }) => {
  test.skip(!groupFixturesConfigured, 'Enable E2E_GROUPS_ENABLED with three dedicated accounts and two accepted contacts for the demo account')
  await withGroupFixture(browser, page, baseURL!, async ({ owner, member, other, groupId, createRequestId, name }) => {
    const group = { p_conversation_id: groupId }
    const request = () => ({ p_client_request_id: randomUUID() })

    await test.step('US1 creates one group and publishes one message per request', async () => {
      expect(await owner.rpc('create_group_conversation', {
        p_name: name, p_member_ids: [member.id, other.id], p_client_request_id: createRequestId,
      })).toBe(groupId)
      expect(await member.rpc<unknown[]>('get_group_members', group)).toHaveLength(3)
      const args = { ...group, ...request(), p_body: 'Before rejoin' }
      const sent = await owner.rpc('publish_group_text_message', args)
      expect(await owner.rpc('publish_group_text_message', args)).toBe(sent)
    })

    const messageId = randomUUID()
    const attachmentId = randomUUID()
    const path = `${groupId}/${owner.id}/${messageId}/${attachmentId}.webm`
    const audio = [78, 66, 79, 88]
    const voice = {
      ...group, ...request(), p_message_id: messageId, p_attachment_id: attachmentId,
      p_storage_path: path, p_mime_type: 'audio/webm', p_size_bytes: audio.length,
      p_duration_ms: 100, p_expected_policy_version: 1,
    }

    await test.step('US2 blocks disabled and stale voice publication', async () => {
      const upload = await owner.request(`/storage/v1/object/chat-media/${path}`, 'POST', audio, 'audio/webm')
      expect(upload.status).toBeLessThan(300)
      const disable = { ...group, ...request(), p_enabled: false }
      await member.expectError('set_group_voice_publication', disable, 'group_admin_required')
      await owner.rpc('set_group_voice_publication', disable)
      await owner.expectError('publish_group_voice_message', voice, 'group_voice_disabled')
      await owner.rpc('set_group_voice_publication', { ...group, ...request(), p_enabled: true })
      await owner.expectError('publish_group_voice_message', voice, 'stale_group_policy')
      expect(await owner.rpc('publish_group_voice_message', { ...voice, p_expected_policy_version: 3 })).toBe(messageId)
    })

    await test.step('US3 retains the message shell when personal reception blocks media', async () => {
      const attachments = `/rest/v1/message_attachments?message_id=eq.${messageId}`
      const sign = `/storage/v1/object/sign/chat-media/${path}`
      expect((await member.request<unknown[]>(attachments)).data).toHaveLength(1)
      expect((await member.request(sign, 'POST', { expiresIn: 30 })).status).toBe(200)
      await member.rpc('set_group_voice_reception', { ...group, p_mode: 'block' })
      expect((await member.request<unknown[]>(`/rest/v1/messages?id=eq.${messageId}`)).data).toHaveLength(1)
      expect((await member.request<unknown[]>(attachments)).data).toEqual([])
      expect((await member.request(sign, 'POST', { expiresIn: 30 })).status).toBeGreaterThanOrEqual(400)
      expect(await member.rpc('get_group_voice_state', group)).toMatchObject({
        effective_can_receive: false, effective_can_publish: true,
      })
    })

    await test.step('US4 enforces rejoin boundaries and closes with one admin', async () => {
      await owner.expectError('leave_group', { ...group, ...request() }, 'last_group_admin')
      await member.rpc('leave_group', { ...group, ...request() })
      await member.expectError('get_group_members', group, 'not_group_member')
      await owner.rpc('add_group_member', { ...group, ...request(), p_user_id: member.id })
      expect((await member.request<unknown[]>(`/rest/v1/messages?id=eq.${messageId}`)).data).toEqual([])
      expect(await member.rpc('get_group_voice_state', group)).toMatchObject({ personal_mode: 'inherit' })
      await owner.rpc('set_group_member_role', { ...group, ...request(), p_user_id: member.id, p_role: 'admin' })
      await owner.rpc('set_group_member_role', { ...group, ...request(), p_user_id: member.id, p_role: 'member' })
      await owner.rpc('rename_group_conversation', { ...group, ...request(), p_name: name + ' renamed' })
      for (const participant of [member, other]) {
        await owner.rpc('remove_group_member', { ...group, ...request(), p_user_id: participant.id })
      }
      await owner.rpc('close_group_conversation', { ...group, ...request() })
      expect((await owner.request<unknown[]>(`/rest/v1/conversations?id=eq.${groupId}`)).data).toEqual([])
    })
  })
})
