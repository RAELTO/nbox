-- ============================================================
-- Chat voice notes: private media + attachment metadata
-- Audio bytes live in Storage; Postgres only stores metadata.
-- ============================================================

-- Voice messages keep the existing non-empty body invariant. The body is a
-- human-readable fallback ("Voice note") used by conversation previews.
alter table public.messages
  drop constraint if exists messages_kind_check;

alter table public.messages
  add constraint messages_kind_check
  check (kind in ('text', 'image', 'voice', 'system'));

create table public.message_attachments (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references public.messages(id) on delete cascade,
  kind         text not null check (kind in ('voice', 'image', 'video', 'file')),
  storage_path text not null unique,
  mime_type    text not null,
  size_bytes   bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  duration_ms  integer check (duration_ms is null or (duration_ms > 0 and duration_ms <= 300000)),
  created_at   timestamptz not null default now(),
  check (
    (kind = 'voice' and duration_ms is not null and mime_type in ('audio/webm', 'audio/mp4', 'audio/ogg'))
    or (kind <> 'voice')
  )
);

create index message_attachments_message_id_idx
  on public.message_attachments(message_id);

alter table public.message_attachments enable row level security;

create policy "message_attachments_select_participant"
  on public.message_attachments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.messages m
      join public.conversation_participants cp
        on cp.conversation_id = m.conversation_id
      where m.id = message_attachments.message_id
        and cp.user_id = (select auth.uid())
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
      join public.conversation_participants cp
        on cp.conversation_id = m.conversation_id
      where m.id = message_attachments.message_id
        and m.sender_id = (select auth.uid())
        and cp.user_id = (select auth.uid())
        and split_part(message_attachments.storage_path, '/', 1) = m.conversation_id::text
        and split_part(message_attachments.storage_path, '/', 2) = (select auth.uid())::text
    )
  );

create policy "message_attachments_delete_sender"
  on public.message_attachments
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.messages m
      where m.id = message_attachments.message_id
        and m.sender_id = (select auth.uid())
    )
  );

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'chat-media',
  'chat-media',
  false,
  10485760,
  array['audio/webm', 'audio/mp4', 'audio/ogg']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "chat_media_select_participant"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'chat-media'
    and exists (
      select 1
      from public.conversation_participants cp
      where cp.conversation_id::text = (storage.foldername(name))[1]
        and cp.user_id = (select auth.uid())
    )
  );

create policy "chat_media_insert_sender"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and exists (
      select 1
      from public.conversation_participants cp
      where cp.conversation_id::text = (storage.foldername(name))[1]
        and cp.user_id = (select auth.uid())
    )
  );

create policy "chat_media_delete_sender"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

-- Inserts the message and its attachment metadata atomically after Storage has
-- accepted the file. This prevents Realtime clients from seeing a voice message
-- before its attachment row exists.
create or replace function public.create_voice_message(
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
  v_message_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if split_part(p_storage_path, '/', 1) <> p_conversation_id::text
     or split_part(p_storage_path, '/', 2) <> (select auth.uid())::text then
    raise exception 'Invalid voice note path' using errcode = '22023';
  end if;

  insert into public.messages (conversation_id, sender_id, body, kind)
  values (p_conversation_id, (select auth.uid()), 'Voice note', 'voice')
  returning id into v_message_id;

  insert into public.message_attachments (
    message_id,
    kind,
    storage_path,
    mime_type,
    size_bytes,
    duration_ms
  ) values (
    v_message_id,
    'voice',
    p_storage_path,
    p_mime_type,
    p_size_bytes,
    p_duration_ms
  );

  return v_message_id;
end;
$$;

revoke execute on function public.create_voice_message(uuid, text, text, bigint, integer)
  from public, anon;
grant execute on function public.create_voice_message(uuid, text, text, bigint, integer)
  to authenticated;
