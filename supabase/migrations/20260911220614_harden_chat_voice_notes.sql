-- ============================================================
-- Harden chat voice notes and centralize active membership.
-- ============================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_active_conversation_participant(
  p_conversation_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = p_conversation_id
      and cp.user_id = p_user_id
      and cp.deleted_at is null
  );
$$;

revoke all on function private.is_active_conversation_participant(uuid, uuid) from public;
grant execute on function private.is_active_conversation_participant(uuid, uuid) to authenticated;

create or replace function private.chat_media_is_unreferenced(p_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.message_attachments a
    where a.storage_path = p_storage_path
  );
$$;

revoke all on function private.chat_media_is_unreferenced(text) from public;
grant execute on function private.chat_media_is_unreferenced(text) to authenticated;

-- A position allows the same attachment model to support multi-file messages
-- later. The unique index also covers the message_id foreign key.
alter table public.message_attachments
  add column position smallint not null default 0 check (position >= 0);

drop index if exists public.message_attachments_message_id_idx;
create unique index message_attachments_message_position_uidx
  on public.message_attachments(message_id, position);

drop policy if exists "message_attachments_select_participant"
  on public.message_attachments;
drop policy if exists "message_attachments_insert_sender"
  on public.message_attachments;
drop policy if exists "message_attachments_delete_sender"
  on public.message_attachments;

create policy "message_attachments_select_participant"
  on public.message_attachments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.messages m
      where m.id = message_attachments.message_id
        and m.deleted_at is null
        and (select private.is_active_conversation_participant(
          m.conversation_id,
          (select auth.uid())
        ))
    )
  );

create policy "message_attachments_insert_sender"
  on public.message_attachments
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.messages m
      where m.id = message_attachments.message_id
        and m.sender_id = (select auth.uid())
        and (select private.is_active_conversation_participant(
          m.conversation_id,
          (select auth.uid())
        ))
        and split_part(message_attachments.storage_path, '/', 1) = m.conversation_id::text
        and split_part(message_attachments.storage_path, '/', 2) = (select auth.uid())::text
        and split_part(message_attachments.storage_path, '/', 3) = m.id::text
    )
  );

-- Message access now depends on participant membership rather than user_a/user_b,
-- so the same policies can support group conversations later.
drop policy if exists "msg_select_participant" on public.messages;
drop policy if exists "msg_insert_participant" on public.messages;
drop policy if exists "msg_update_own" on public.messages;

create policy "msg_select_participant"
  on public.messages
  for select
  to authenticated
  using (
    (select private.is_active_conversation_participant(
      conversation_id,
      (select auth.uid())
    ))
  );

create policy "msg_insert_participant"
  on public.messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
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
    and (select private.is_active_conversation_participant(
      conversation_id,
      (select auth.uid())
    ))
  )
  with check (
    sender_id = (select auth.uid())
    and (select private.is_active_conversation_participant(
      conversation_id,
      (select auth.uid())
    ))
  );

drop policy if exists "chat_media_select_participant" on storage.objects;
drop policy if exists "chat_media_insert_sender" on storage.objects;
drop policy if exists "chat_media_delete_sender" on storage.objects;

create policy "chat_media_select_participant"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'chat-media'
    and (
      (
        owner_id = (select auth.uid())::text
        and (select private.chat_media_is_unreferenced(name))
      )
      or exists (
        select 1
        from public.message_attachments a
        join public.messages m on m.id = a.message_id
        where a.storage_path = storage.objects.name
          and m.deleted_at is null
          and (select private.is_active_conversation_participant(
            m.conversation_id,
            (select auth.uid())
          ))
      )
    )
  );

create policy "chat_media_insert_sender"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'chat-media'
    and owner_id = (select auth.uid())::text
    and split_part(name, '/', 2) = (select auth.uid())::text
    and split_part(name, '/', 3) <> ''
    and split_part(name, '/', 4) <> ''
    and split_part(name, '/', 5) = ''
    and exists (
      select 1
      from public.conversation_participants cp
      where cp.conversation_id::text = split_part(name, '/', 1)
        and cp.user_id = (select auth.uid())
        and cp.deleted_at is null
    )
  );

create policy "chat_media_delete_unreferenced_sender"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'chat-media'
    and owner_id = (select auth.uid())::text
    and (select private.chat_media_is_unreferenced(name))
  );

-- Replace the first MVP signature with IDs supplied by the client. The IDs are
-- encoded in the immutable object path and the uploaded object is verified
-- before the message becomes visible through Realtime.
drop function if exists public.create_voice_message(uuid, text, text, bigint, integer);

create or replace function public.create_voice_message(
  p_message_id uuid,
  p_attachment_id uuid,
  p_conversation_id uuid,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_duration_ms integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_mime_type text := lower(split_part(trim(p_mime_type), ';', 1));
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not (select private.is_active_conversation_participant(
    p_conversation_id,
    v_user_id
  )) then
    raise exception 'Conversation access denied' using errcode = '42501';
  end if;

  if split_part(p_storage_path, '/', 1) <> p_conversation_id::text
     or split_part(p_storage_path, '/', 2) <> v_user_id::text
     or split_part(p_storage_path, '/', 3) <> p_message_id::text
     or split_part(split_part(p_storage_path, '/', 4), '.', 1) <> p_attachment_id::text
     or split_part(p_storage_path, '/', 5) <> '' then
    raise exception 'Invalid voice note path' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'chat-media'
      and o.name = p_storage_path
      and o.owner_id = v_user_id::text
      and coalesce((o.metadata->>'size')::bigint, -1) = p_size_bytes
      and lower(split_part(coalesce(o.metadata->>'mimetype', ''), ';', 1)) = v_mime_type
  ) then
    raise exception 'Voice note upload not found or metadata mismatch'
      using errcode = '22023';
  end if;

  insert into public.messages (id, conversation_id, sender_id, body, kind)
  values (p_message_id, p_conversation_id, v_user_id, 'Voice note', 'voice');

  insert into public.message_attachments (
    id,
    message_id,
    kind,
    storage_path,
    mime_type,
    size_bytes,
    duration_ms,
    position
  ) values (
    p_attachment_id,
    p_message_id,
    'voice',
    p_storage_path,
    v_mime_type,
    p_size_bytes,
    p_duration_ms,
    0
  );

  return p_message_id;
end;
$$;

revoke execute on function public.create_voice_message(
  uuid, uuid, uuid, text, text, bigint, integer
) from public, anon;
grant execute on function public.create_voice_message(
  uuid, uuid, uuid, text, text, bigint, integer
) to authenticated;
