-- Voice-note reception preferences for direct conversations.
-- Group-wide administration remains separate until group chats exist.

alter table public.profiles
  add column voice_notes_enabled boolean not null default true;

alter table public.conversation_participants
  add column voice_notes_mode text not null default 'inherit'
  check (voice_notes_mode in ('inherit', 'allow', 'block'));

comment on column public.profiles.voice_notes_enabled is
  'Default permission for receiving voice notes.';
comment on column public.conversation_participants.voice_notes_mode is
  'Per-conversation receive override: inherit, allow, or block.';

create or replace function private.get_voice_note_permission_internal(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sender_id uuid := (select auth.uid());
  v_conversation_type text;
  v_recipient_mode text;
  v_recipient_global_enabled boolean;
  v_allowed boolean;
begin
  if v_sender_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'conversation_unavailable');
  end if;

  select c.type
    into v_conversation_type
  from public.conversations c
  where c.id = p_conversation_id
    and (select private.is_active_conversation_participant(c.id, v_sender_id));

  if not found or v_conversation_type <> 'direct' then
    return jsonb_build_object('allowed', false, 'reason', 'conversation_unavailable');
  end if;

  select cp.voice_notes_mode, p.voice_notes_enabled
    into v_recipient_mode, v_recipient_global_enabled
  from public.conversation_participants cp
  join public.profiles p on p.id = cp.user_id
  where cp.conversation_id = p_conversation_id
    and cp.user_id <> v_sender_id
    and cp.deleted_at is null
  order by cp.user_id
  limit 1;

  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'conversation_unavailable');
  end if;

  v_allowed := case v_recipient_mode
    when 'allow' then true
    when 'block' then false
    else v_recipient_global_enabled
  end;

  return jsonb_build_object(
    'allowed', v_allowed,
    'reason', case when v_allowed then 'allowed' else 'recipient_disabled' end
  );
end;
$$;

revoke all on function private.get_voice_note_permission_internal(uuid)
  from public, anon;
grant execute on function private.get_voice_note_permission_internal(uuid)
  to authenticated;

create or replace function public.get_voice_note_permission(
  p_conversation_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_voice_note_permission_internal(p_conversation_id);
$$;

revoke execute on function public.get_voice_note_permission(uuid)
  from public, anon;
grant execute on function public.get_voice_note_permission(uuid)
  to authenticated;

-- Serialize a preference change with a concurrent voice publication for the
-- same recipient. Whichever transaction acquires the lock first wins.
create or replace function private.lock_voice_note_preference_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (to_jsonb(new)->>tg_argv[0])::uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 764821));
  return new;
end;
$$;

revoke all on function private.lock_voice_note_preference_update()
  from public, anon, authenticated;

create or replace function private.guard_conversation_voice_preference_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := (select auth.uid());
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 764821));
  if v_caller_id is not null
     and new.user_id <> v_caller_id
     and new.voice_notes_mode <> 'inherit' then
    raise exception 'Cannot set another participant voice-note preference'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_conversation_voice_preference_insert()
  from public, anon, authenticated;

create trigger participants_guard_voice_preference_insert
before insert on public.conversation_participants
for each row
execute function private.guard_conversation_voice_preference_insert();

create trigger profiles_lock_voice_note_preference
before update of voice_notes_enabled on public.profiles
for each row
when (old.voice_notes_enabled is distinct from new.voice_notes_enabled)
execute function private.lock_voice_note_preference_update('id');

create trigger participants_lock_voice_note_preference
before update of voice_notes_mode on public.conversation_participants
for each row
when (old.voice_notes_mode is distinct from new.voice_notes_mode)
execute function private.lock_voice_note_preference_update('user_id');

drop policy if exists "chat_media_insert_sender" on storage.objects;

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
        and (
          (select private.get_voice_note_permission_internal(cp.conversation_id))->>'allowed'
        )::boolean
    )
  );

create or replace function private.create_voice_message_internal(
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
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_recipient_id uuid;
  v_permission jsonb;
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

  select cp.user_id
    into v_recipient_id
  from public.conversation_participants cp
  join public.conversations c on c.id = cp.conversation_id
  where cp.conversation_id = p_conversation_id
    and c.type = 'direct'
    and cp.user_id <> v_user_id
    and cp.deleted_at is null
  order by cp.user_id
  limit 1;

  if v_recipient_id is null then
    raise exception 'VOICE_NOTES_BLOCKED_BY_RECIPIENT' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_recipient_id::text, 764821));
  v_permission := private.get_voice_note_permission_internal(p_conversation_id);
  if not coalesce((v_permission->>'allowed')::boolean, false) then
    raise exception 'VOICE_NOTES_BLOCKED_BY_RECIPIENT' using errcode = '42501';
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

revoke all on function private.create_voice_message_internal(
  uuid, uuid, uuid, text, text, bigint, integer
) from public, anon;
grant execute on function private.create_voice_message_internal(
  uuid, uuid, uuid, text, text, bigint, integer
) to authenticated;
