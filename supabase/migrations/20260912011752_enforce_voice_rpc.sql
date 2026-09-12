-- Voice messages must be published through create_voice_message so the
-- referenced private Storage object and its metadata are verified atomically.

drop policy if exists "message_attachments_insert_sender"
  on public.message_attachments;

revoke insert, update, delete on public.message_attachments from anon, authenticated;
grant select on public.message_attachments to authenticated;

drop policy if exists "msg_insert_participant" on public.messages;
drop policy if exists "msg_update_own" on public.messages;

create policy "msg_insert_participant"
  on public.messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and kind <> 'voice'
    and (select private.is_active_conversation_participant(
      conversation_id,
      (select auth.uid())
    ))
  );

create policy "msg_update_own"
  on public.messages
  for update
  to authenticated
  using (
    sender_id = (select auth.uid())
    and kind <> 'voice'
    and (select private.is_active_conversation_participant(
      conversation_id,
      (select auth.uid())
    ))
  )
  with check (
    sender_id = (select auth.uid())
    and kind <> 'voice'
    and (select private.is_active_conversation_participant(
      conversation_id,
      (select auth.uid())
    ))
  );

alter function public.create_voice_message(
  uuid, uuid, uuid, text, text, bigint, integer
) security definer;

revoke execute on function public.create_voice_message(
  uuid, uuid, uuid, text, text, bigint, integer
) from public, anon;
grant execute on function public.create_voice_message(
  uuid, uuid, uuid, text, text, bigint, integer
) to authenticated;
