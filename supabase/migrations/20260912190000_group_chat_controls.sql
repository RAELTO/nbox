-- The legacy direct-chat tables predate the repository's voice migrations.
alter table public.conversations
  alter column user_a drop not null,
  alter column user_b drop not null,
  add column name text,
  add column created_by uuid references public.profiles(id) on delete set null,
  add column status text not null default 'active' check (status in ('active','closed')),
  add column voice_notes_allowed boolean not null default true,
  add column voice_policy_version integer not null default 1 check (voice_policy_version >= 1),
  add column next_group_sequence bigint not null default 1 check (next_group_sequence >= 1),
  add column last_message_id uuid,
  add column last_message_sender_id uuid references public.profiles(id) on delete set null,
  add column updated_at timestamptz not null default now(),
  add column closed_at timestamptz,
  add column create_request_id uuid;

-- Discover legacy names since the original direct-chat DDL is absent here.
do $$
declare constraint_name name;
begin
  for constraint_name in
    select conname from pg_constraint
    where conrelid = 'public.conversations'::regclass
      and (contype = 'c' and pg_get_constraintdef(oid) ~ '\m(type|user_a|user_b)\M'
        or contype = 'u' and pg_get_constraintdef(oid) in ('UNIQUE (user_a, user_b)', 'UNIQUE (user_b, user_a)'))
  loop
    execute format('alter table public.conversations drop constraint %I', constraint_name);
  end loop;
end;
$$;

alter table public.conversations add constraint conversations_type_check check (type in ('direct','group')),
  add constraint conversations_shape_check check (
    (type = 'direct' and user_a is not null and user_b is not null and user_a < user_b
      and name is null and created_by is null and create_request_id is null and closed_at is null)
    or
    (type = 'group' and user_a is null and user_b is null and created_by is not null
      and name is not null and char_length(btrim(name)) between 1 and 80)
  );
create unique index conversations_direct_pair_uidx on public.conversations(user_a,user_b) where type = 'direct';
create unique index conversations_group_request_uidx on public.conversations(created_by,create_request_id)
  where type = 'group' and create_request_id is not null;
create index conversations_last_message_sender_idx on public.conversations(last_message_sender_id);
create index conversations_inbox_order_idx on public.conversations(updated_at desc,id desc);

alter table public.conversation_participants
  add column role text not null default 'member' check (role in ('member','admin')),
  add column joined_at timestamptz not null default now(),
  add column history_from_sequence bigint check (history_from_sequence >= 1);
update public.conversation_participants cp set joined_at = c.created_at
from public.conversations c where c.id = cp.conversation_id;
create index participants_active_user_idx on public.conversation_participants(user_id,conversation_id) where deleted_at is null;
create index participants_active_history_idx on public.conversation_participants(conversation_id,history_from_sequence,user_id) where deleted_at is null;
create index participants_active_admin_idx on public.conversation_participants(conversation_id,user_id) where deleted_at is null and role = 'admin';

alter table public.messages
  alter column sender_id drop not null,
  add column group_sequence bigint check (group_sequence >= 1),
  add column client_request_id uuid,
  add column system_event_type text check (system_event_type in (
    'group_created','member_added','member_removed','member_left','member_promoted','member_demoted',
    'group_renamed','group_voice_policy_changed','group_closed'
  )),
  add column system_event_payload jsonb,
  add constraint messages_event_shape_check check (
    (kind = 'system' and sender_id is null and system_event_type is not null and group_sequence is not null
      and jsonb_typeof(system_event_payload) is not distinct from 'object')
    or
    (kind <> 'system' and sender_id is not null and system_event_type is null and system_event_payload is null
      and (group_sequence is null or client_request_id is not null))
  );
create unique index messages_group_sequence_uidx on public.messages(conversation_id,group_sequence) where group_sequence is not null;
create unique index messages_client_request_uidx on public.messages(conversation_id,sender_id,client_request_id) where client_request_id is not null;
create index messages_visible_group_idx on public.messages(conversation_id,group_sequence desc,id desc) where deleted_at is null;
create index messages_visible_direct_idx on public.messages(conversation_id,created_at desc,id desc) where deleted_at is null;

update public.conversations set updated_at = coalesce(last_message_at,created_at);
update public.conversations c
set last_message_id = m.id, last_message_sender_id = m.sender_id,
    last_message_at = m.created_at, last_message_text = m.body, updated_at = m.created_at
from (
  select distinct on (conversation_id) conversation_id,id,sender_id,created_at,body
  from public.messages where deleted_at is null
  order by conversation_id,created_at desc,id desc
) m where m.conversation_id = c.id;

create function private.refresh_chat_summary()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  latest public.messages;
  chat_type text;
begin
  select type into chat_type from public.conversations where id = new.conversation_id for no key update;
  if chat_type = 'group' then
    select * into latest from public.messages
    where conversation_id = new.conversation_id and deleted_at is null and group_sequence is not null
    order by group_sequence desc,id desc limit 1;
  else
    select * into latest from public.messages
    where conversation_id = new.conversation_id and deleted_at is null
    order by created_at desc,id desc limit 1;
  end if;
  update public.conversations set
    last_message_id = latest.id, last_message_sender_id = latest.sender_id,
    last_message_at = latest.created_at, last_message_text = latest.body,
    updated_at = greatest(updated_at, coalesce(latest.created_at, created_at))
  where id = new.conversation_id;
  return null;
end;
$$;

-- Replace legacy INSERT preview triggers that write the same summary columns.
do $$
declare trigger_name name;
begin
  for trigger_name in
    select t.tgname from pg_trigger t join pg_proc p on p.oid = t.tgfoid
    where t.tgrelid = 'public.messages'::regclass and not t.tgisinternal
      and t.tgtype & 4 = 4 and p.prosrc ~ '\mlast_message_(at|text)\M'
  loop
    execute format('drop trigger %I on public.messages', trigger_name);
  end loop;
end;
$$;
create trigger messages_refresh_chat_summary after insert or update of body,deleted_at on public.messages
for each row execute function private.refresh_chat_summary();

create function private.seed_direct_participants()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.conversation_participants(conversation_id,user_id,joined_at)
  values (new.id,new.user_a,new.created_at),(new.id,new.user_b,new.created_at)
  on conflict (conversation_id,user_id) do nothing;
  return null;
end;
$$;
create trigger conversations_seed_direct_participants after insert on public.conversations
for each row when (new.type = 'direct') execute function private.seed_direct_participants();

insert into public.conversation_participants(conversation_id,user_id,joined_at)
select c.id, participant.id,c.created_at from public.conversations c
cross join lateral (values (c.user_a),(c.user_b)) participant(id)
where c.type = 'direct' on conflict (conversation_id,user_id) do nothing;

-- Invoker trigger distinguishes client DML from writes by the definer RPCs.
create function private.guard_participant_write()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if current_user in ('authenticated','anon') then
    if tg_op = 'INSERT' then
      raise exception 'participant_fields_read_only' using errcode = '42501';
    end if;
    if old.user_id is distinct from (select auth.uid())
      or (to_jsonb(new) - array['last_read_at','archived_at','voice_notes_mode'])
         is distinct from (to_jsonb(old) - array['last_read_at','archived_at','voice_notes_mode']) then
      raise exception 'participant_fields_read_only' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger participants_guard_write before insert or update on public.conversation_participants
for each row execute function private.guard_participant_write();

create function private.can_read_conversation_message(p_conversation_id uuid,p_group_sequence bigint,p_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_participants cp
    join public.conversations c on c.id = cp.conversation_id
    where cp.conversation_id = p_conversation_id and cp.user_id = p_user_id and cp.deleted_at is null
      and (c.type = 'direct' or (c.status = 'active' and p_group_sequence >= cp.history_from_sequence))
  );
$$;

create function private.is_group_admin(p_conversation_id uuid,p_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_participants cp join public.conversations c on c.id = cp.conversation_id
    where c.id = p_conversation_id and c.type = 'group' and cp.user_id = p_user_id
      and cp.deleted_at is null and cp.role = 'admin'
  );
$$;

create function private.can_receive_voice_attachment(p_message_id uuid,p_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.messages m
    join public.conversations c on c.id = m.conversation_id
    join public.conversation_participants cp on cp.conversation_id = c.id and cp.user_id = p_user_id
    join public.profiles p on p.id = cp.user_id
    where m.id = p_message_id and m.deleted_at is null
      and private.can_read_conversation_message(c.id,m.group_sequence,p_user_id)
      and (c.type = 'direct' or m.kind <> 'voice' or cp.voice_notes_mode = 'allow'
        or (cp.voice_notes_mode = 'inherit' and p.voice_notes_enabled))
  );
$$;

create function private.direct_insert_returning(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select not exists (select 1 from public.conversations where id = p_conversation_id);
$$;

-- Rebuild the complete chat policy set so legacy permissive rules cannot bypass it.
do $$
declare policy record;
begin
  for policy in select schemaname,tablename,policyname from pg_policies
    where (schemaname = 'public' and tablename in ('conversations','conversation_participants','messages','message_attachments'))
       or (schemaname = 'storage' and tablename = 'objects' and policyname like 'chat_media_%')
  loop
    execute format('drop policy %I on %I.%I',policy.policyname,policy.schemaname,policy.tablename);
  end loop;
end;
$$;

create policy conversations_select_member on public.conversations for select to authenticated using (
  private.is_active_conversation_participant(id,(select auth.uid()))
  -- The STABLE helper sees the pre-command snapshot during INSERT RETURNING.
  -- A normal SELECT always sees the conversation and requires membership.
  or (type = 'direct' and (select auth.uid()) in (user_a,user_b)
    and private.direct_insert_returning(id))
);
create policy conversations_insert_direct on public.conversations for insert to authenticated with check (
  type = 'direct' and (select auth.uid()) in (user_a,user_b) and not (select public.is_banned())
  and status = 'active' and voice_notes_allowed and voice_policy_version = 1 and next_group_sequence = 1
  and last_message_id is null and last_message_sender_id is null and last_message_at is null and last_message_text is null
  and exists (select 1 from public.contacts ct where ct.user_a = conversations.user_a and ct.user_b = conversations.user_b)
);
revoke insert on public.conversations from public,anon,authenticated;
grant insert (user_a,user_b,type) on public.conversations to authenticated;
create policy participants_select_own on public.conversation_participants for select to authenticated
  using (user_id = (select auth.uid()));
create policy participants_update_own on public.conversation_participants for update to authenticated
  using (user_id = (select auth.uid()) and deleted_at is null and not (select public.is_banned()))
  with check (user_id = (select auth.uid()) and deleted_at is null and not (select public.is_banned()));
create policy messages_select_visible on public.messages for select to authenticated
  using (private.can_read_conversation_message(conversation_id,group_sequence,(select auth.uid())));
create policy messages_insert_direct_text on public.messages for insert to authenticated with check (
  kind = 'text' and sender_id = (select auth.uid()) and not (select public.is_banned())
  and group_sequence is null and client_request_id is null and system_event_type is null
  and private.is_active_conversation_participant(conversation_id,(select auth.uid()))
  and exists (select 1 from public.conversations c where c.id = conversation_id and c.type = 'direct')
);
create policy messages_update_direct_own on public.messages for update to authenticated
  using (kind not in ('system','voice') and sender_id = (select auth.uid()) and not (select public.is_banned())
    and private.is_active_conversation_participant(conversation_id,(select auth.uid()))
    and exists (select 1 from public.conversations c where c.id = conversation_id and c.type = 'direct'))
  with check (kind not in ('system','voice') and sender_id = (select auth.uid()) and not (select public.is_banned())
    and private.is_active_conversation_participant(conversation_id,(select auth.uid()))
    and exists (select 1 from public.conversations c where c.id = conversation_id and c.type = 'direct'));
revoke insert,update on public.messages from public,anon,authenticated;
grant insert (conversation_id,sender_id,body,kind) on public.messages to authenticated;
grant update (body,edited_at,deleted_at) on public.messages to authenticated;

create policy attachments_select_visible on public.message_attachments for select to authenticated
  using (private.can_receive_voice_attachment(message_id,(select auth.uid())));
revoke insert,update,delete on public.message_attachments from public,anon,authenticated;

-- Permissive access is scoped to chat-media. Restrictive guards ensure that an
-- unrelated permissive Storage policy cannot widen access to this bucket.
create policy chat_media_select_visible on storage.objects for select to authenticated
  using (bucket_id = 'chat-media');
create policy chat_media_insert_sender on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-media');
create policy chat_media_delete_unreferenced_sender on storage.objects for delete to authenticated
  using (bucket_id = 'chat-media');

create policy chat_media_bucket_select_guard on storage.objects as restrictive for select to authenticated
using (bucket_id <> 'chat-media' or (name not like '%..%' and (
  (owner_id = (select auth.uid())::text and private.chat_media_is_unreferenced(name))
  or exists (select 1 from public.message_attachments a where a.storage_path = storage.objects.name)
)));

create policy chat_media_bucket_insert_guard on storage.objects as restrictive for insert to authenticated
with check (bucket_id <> 'chat-media' or (
  owner_id = (select auth.uid())::text and not (select public.is_banned())
  and name not like '%..%'
  and split_part(name,'/',2) = (select auth.uid())::text
  and exists (
    select 1 from public.conversations c
    where c.id = case when storage.objects.name ~
      '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/){3}[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webm|m4a|mp4|ogg)$'
      then split_part(storage.objects.name,'/',1)::uuid end
      and c.status = 'active' and private.is_active_conversation_participant(c.id,(select auth.uid()))
      and (private.get_voice_note_permission_internal(c.id)->>'allowed')::boolean
  )
));

create policy chat_media_bucket_delete_guard on storage.objects as restrictive for delete to authenticated
using (bucket_id <> 'chat-media' or (
  owner_id = (select auth.uid())::text and name not like '%..%' and private.chat_media_is_unreferenced(name)
));

create policy chat_media_bucket_update_guard on storage.objects as restrictive for update to authenticated
using (bucket_id <> 'chat-media') with check (bucket_id <> 'chat-media');

create policy chat_media_bucket_anon_guard on storage.objects as restrictive for all to anon
using (bucket_id <> 'chat-media') with check (bucket_id <> 'chat-media');

-- Recheck after DELETE acquires the object's row lock, because publication can
-- attach the object after a concurrent DELETE evaluated its RLS predicate.
create function private.guard_chat_media_delete()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if current_user = 'authenticated' and not private.chat_media_is_unreferenced(old.name) then
    raise exception 'voice_attachment_forbidden' using errcode = '42501';
  end if;
  return old;
end;
$$;
revoke all on function private.guard_chat_media_delete() from public,anon,authenticated;
create trigger guard_chat_media_delete before delete on storage.objects
for each row when (old.bucket_id = 'chat-media') execute function private.guard_chat_media_delete();

do $$
declare relation text;
begin
  foreach relation in array array['conversations','conversation_participants','messages','notifications'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = relation
    ) then
      execute format('alter publication supabase_realtime add table public.%I',relation);
    end if;
  end loop;
end;
$$;

revoke all on function private.refresh_chat_summary(), private.seed_direct_participants(),
  private.guard_participant_write(), private.is_group_admin(uuid,uuid) from public,anon,authenticated;
revoke all on function private.can_read_conversation_message(uuid,bigint,uuid),
  private.can_receive_voice_attachment(uuid,uuid), private.direct_insert_returning(uuid) from public,anon;
grant execute on function private.can_read_conversation_message(uuid,bigint,uuid),
  private.can_receive_voice_attachment(uuid,uuid), private.direct_insert_returning(uuid) to authenticated;
-- Request records persist after a member leaves so retries cannot repeat a mutation.
create table private.group_mutation_requests (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  actor_id uuid not null,
  request_id uuid not null,
  operation text not null,
  arguments jsonb not null,
  result jsonb not null,
  primary key (conversation_id,actor_id,request_id)
);
revoke all on private.group_mutation_requests from public,anon,authenticated;

create function private.lock_group(p_conversation_id uuid)
returns public.conversations language plpgsql set search_path = ''
as $$
declare group_row public.conversations;
begin
  select * into group_row from public.conversations
  where id = p_conversation_id and type = 'group' for update;
  return group_row;
end;
$$;

create function private.require_group_access(p_group public.conversations,p_actor uuid,p_admin boolean)
returns void language plpgsql set search_path = ''
as $$
begin
  if p_actor is null or p_group.id is null then
    raise exception 'not_group_member';
  end if;
  if p_group.status = 'closed' and exists (
    select 1 from private.group_mutation_requests
    where conversation_id = p_group.id and actor_id = p_actor and operation = 'close'
  ) then raise exception 'group_closed'; end if;
  if not private.is_active_conversation_participant(p_group.id,p_actor) then raise exception 'not_group_member'; end if;
  if p_group.status = 'closed' then raise exception 'group_closed'; end if;
  if p_admin and not private.is_group_admin(p_group.id,p_actor) then
    raise exception 'group_admin_required';
  end if;
end;
$$;

create function private.accepted_group_contact(p_actor uuid,p_target uuid)
returns boolean language sql stable set search_path = ''
as $$
  select exists (select 1 from public.contacts
    where user_a = least(p_actor,p_target) and user_b = greatest(p_actor,p_target));
$$;

create function private.allocate_group_sequence(p_conversation_id uuid)
returns bigint language sql set search_path = ''
as $$
  update public.conversations set next_group_sequence = next_group_sequence + 1
  where id = p_conversation_id returning next_group_sequence - 1;
$$;

create function private.write_group_event(p_conversation_id uuid,p_sequence bigint,p_event text,p_details jsonb)
returns void language sql set search_path = ''
as $$
  insert into public.messages(conversation_id,group_sequence,kind,body,system_event_type,system_event_payload,created_at)
  select p_conversation_id,p_sequence,'system',p_event,p_event,
    p_details || jsonb_build_object('actor_id',p.id,'actor_name',coalesce(p.display_name,p.username)),clock_timestamp()
  from public.profiles p where p.id = (select auth.uid());
$$;

create function private.create_group_conversation_internal(p_name text,p_member_ids uuid[],p_client_request_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  group_id uuid;
  name_value text := regexp_replace(p_name,'^[[:space:]]+|[[:space:]]+$','','g');
  invitees uuid[];
begin
  if actor is null then raise exception 'not_group_member'; end if;
  if public.is_banned() then raise exception 'user_banned'; end if;
  if p_client_request_id is null then raise exception 'invalid_group_message'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,861221));
  select id into group_id from public.conversations
  where type = 'group' and created_by = actor and create_request_id = p_client_request_id;
  if found then return group_id; end if;

  if name_value is null or char_length(name_value) not between 1 and 80 then
    raise exception 'invalid_group_name';
  end if;
  select array(select distinct invitee from unnest(p_member_ids) invitee where invitee <> actor order by invitee) into invitees;
  if cardinality(invitees) not between 2 and 49 then raise exception 'group_member_limit'; end if;
  if exists (select 1 from unnest(invitees) invitee where not private.accepted_group_contact(actor,invitee)) then
    raise exception 'accepted_contact_required';
  end if;

  insert into public.conversations(type,name,created_by,create_request_id,next_group_sequence)
  values ('group',name_value,actor,p_client_request_id,2) returning id into group_id;
  insert into public.conversation_participants(conversation_id,user_id,role,history_from_sequence)
  select group_id,member,case when member = actor then 'admin' else 'member' end,1
  from unnest(array_append(invitees,actor)) member order by member;
  perform private.write_group_event(group_id,1,'group_created',jsonb_build_object('name',name_value));
  return group_id;
end;
$$;

create function private.publish_group_text_message_internal(p_conversation_id uuid,p_body text,p_client_request_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  group_row public.conversations := private.lock_group(p_conversation_id);
  existing public.messages;
  body_value text := regexp_replace(p_body,'^[[:space:]]+|[[:space:]]+$','','g');
begin
  if public.is_banned() then raise exception 'user_banned'; end if;
  perform private.require_group_access(group_row,actor,false);
  if body_value is null or char_length(body_value) not between 1 and 4000 or p_client_request_id is null then
    raise exception 'invalid_group_message';
  end if;
  select * into existing from public.messages
  where conversation_id = p_conversation_id and sender_id = actor and client_request_id = p_client_request_id;
  if found then
    if existing.kind <> 'text' or existing.body <> body_value then raise exception 'invalid_group_message'; end if;
    return existing.id;
  end if;
  insert into public.messages(conversation_id,sender_id,body,kind,group_sequence,client_request_id,created_at)
  values (p_conversation_id,actor,body_value,'text',private.allocate_group_sequence(p_conversation_id),p_client_request_id,clock_timestamp())
  returning id into existing.id;
  return existing.id;
end;
$$;

create function private.publish_group_voice_message_internal(
  p_message_id uuid,p_attachment_id uuid,p_conversation_id uuid,p_storage_path text,p_mime_type text,
  p_size_bytes bigint,p_duration_ms integer,p_client_request_id uuid,p_expected_policy_version integer
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  group_row public.conversations := private.lock_group(p_conversation_id);
  existing public.messages;
  mime text := lower(split_part(btrim(p_mime_type),';',1));
  path_prefix text := p_conversation_id::text || '/' || actor::text || '/' || p_message_id::text || '/' || p_attachment_id::text;
begin
  if public.is_banned() then raise exception 'user_banned'; end if;
  perform private.require_group_access(group_row,actor,false);
  if p_client_request_id is null then raise exception 'invalid_group_message'; end if;
  select * into existing from public.messages
  where conversation_id = p_conversation_id and sender_id = actor and client_request_id = p_client_request_id;
  if found then
    if existing.kind <> 'voice' or not exists (
      select 1 from public.message_attachments a where a.message_id = existing.id
        and a.storage_path = p_storage_path and a.mime_type = mime
        and a.size_bytes = p_size_bytes and a.duration_ms = p_duration_ms
    ) then raise exception 'invalid_group_message'; end if;
    return existing.id;
  end if;
  if not group_row.voice_notes_allowed then raise exception 'group_voice_disabled'; end if;
  if group_row.voice_policy_version is distinct from p_expected_policy_version then raise exception 'stale_group_policy'; end if;
  if mime is null or mime not in ('audio/webm','audio/mp4','audio/ogg')
     or p_size_bytes is null or p_size_bytes not between 1 and 10485760
     or p_duration_ms is null or p_duration_ms not between 1 and 300000
     or path_prefix is null or p_storage_path is null
     or not (case mime
       when 'audio/webm' then p_storage_path = path_prefix || '.webm'
       when 'audio/ogg' then p_storage_path = path_prefix || '.ogg'
       else p_storage_path in (path_prefix || '.mp4',path_prefix || '.m4a')
     end) then raise exception 'voice_attachment_forbidden'; end if;

  perform 1 from storage.objects o
  where o.bucket_id = 'chat-media' and o.name = p_storage_path and o.owner_id = actor::text
    and o.metadata->>'size' = p_size_bytes::text
    and lower(split_part(o.metadata->>'mimetype',';',1)) = mime
  for update;
  if not found then raise exception 'voice_attachment_forbidden'; end if;

  insert into public.messages(id,conversation_id,sender_id,kind,body,group_sequence,client_request_id,created_at)
  values (p_message_id,p_conversation_id,actor,'voice','Voice note',private.allocate_group_sequence(p_conversation_id),p_client_request_id,clock_timestamp());
  insert into public.message_attachments(id,message_id,kind,storage_path,mime_type,size_bytes,duration_ms)
  values (p_attachment_id,p_message_id,'voice',p_storage_path,mime,p_size_bytes,p_duration_ms);
  return p_message_id;
end;
$$;

create function private.apply_group_mutation(
  p_conversation_id uuid,p_client_request_id uuid,p_operation text,p_args jsonb
)
returns jsonb language plpgsql set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  group_row public.conversations := private.lock_group(p_conversation_id);
  target_id uuid := (p_args->>'user_id')::uuid;
  target public.conversation_participants;
  prior private.group_mutation_requests;
  sequence_value bigint;
  member_count integer;
  admin_count integer;
  event_type text;
  details jsonb := '{}'::jsonb;
  result_value jsonb := jsonb_build_object('ok',true,'conversation_id',p_conversation_id);
  name_value text := regexp_replace(p_args->>'name','^[[:space:]]+|[[:space:]]+$','','g');
  role_value text := p_args->>'role';
  enabled boolean := (p_args->>'enabled')::boolean;
begin
  if public.is_banned() then raise exception 'user_banned'; end if;
  if p_client_request_id is null then raise exception 'invalid_group_message'; end if;
  select * into prior from private.group_mutation_requests
  where conversation_id = p_conversation_id and actor_id = actor and request_id = p_client_request_id;
  if found then
    if (prior.operation,prior.arguments) is distinct from (p_operation,p_args) then raise exception 'invalid_group_message'; end if;
    return prior.result;
  end if;
  perform private.require_group_access(group_row,actor,p_operation <> 'leave');
  perform 1 from public.conversation_participants
  where conversation_id = p_conversation_id order by user_id for update;
  select count(*),count(*) filter (where role = 'admin') into member_count,admin_count
  from public.conversation_participants where conversation_id = p_conversation_id and deleted_at is null;
  if p_operation = 'leave' then target_id := actor; end if;
  select * into target from public.conversation_participants
  where conversation_id = p_conversation_id and user_id = target_id and deleted_at is null;

  case p_operation
    when 'voice_policy' then
      if enabled is null then raise exception 'invalid_group_message'; end if;
      if group_row.voice_notes_allowed <> enabled then
        update public.conversations set voice_notes_allowed = enabled,voice_policy_version = voice_policy_version + 1
        where id = p_conversation_id returning * into group_row;
        event_type := 'group_voice_policy_changed';
        details := jsonb_build_object('enabled',enabled,'policy_version',group_row.voice_policy_version);
      end if;
      result_value := result_value || jsonb_build_object('voice_notes_allowed',enabled,'voice_policy_version',group_row.voice_policy_version);
    when 'add' then
      if target_id is null then raise exception 'accepted_contact_required'; end if;
      if target.user_id is null then
        if not private.accepted_group_contact(actor,target_id) then raise exception 'accepted_contact_required'; end if;
        if member_count >= 50 then raise exception 'group_member_limit'; end if;
        sequence_value := private.allocate_group_sequence(p_conversation_id);
        insert into public.conversation_participants(conversation_id,user_id,role,joined_at,history_from_sequence)
        values (p_conversation_id,target_id,'member',clock_timestamp(),sequence_value)
        on conflict (conversation_id,user_id) do update set
          role = 'member',joined_at = excluded.joined_at,history_from_sequence = excluded.history_from_sequence,
          deleted_at = null,archived_at = null,last_read_at = null,voice_notes_mode = 'inherit';
        event_type := 'member_added';
      end if;
    when 'remove', 'leave' then
      if target.user_id is null then raise exception 'not_group_member'; end if;
      if target.role = 'admin' and admin_count <= 1 then raise exception 'last_group_admin'; end if;
      update public.conversation_participants set deleted_at = clock_timestamp()
      where conversation_id = p_conversation_id and user_id = target_id;
      event_type := case when p_operation = 'leave' then 'member_left' else 'member_removed' end;
    when 'role' then
      if role_value is null or role_value not in ('member','admin') then raise exception 'invalid_group_message'; end if;
      if target.user_id is null then raise exception 'not_group_member'; end if;
      if target.role <> role_value then
        if target.role = 'admin' and admin_count <= 1 then raise exception 'last_group_admin'; end if;
        update public.conversation_participants set role = role_value
        where conversation_id = p_conversation_id and user_id = target_id;
        event_type := case when role_value = 'admin' then 'member_promoted' else 'member_demoted' end;
      end if;
    when 'rename' then
      if name_value is null or char_length(name_value) not between 1 and 80 then raise exception 'invalid_group_name'; end if;
      if group_row.name <> name_value then
        update public.conversations set name = name_value where id = p_conversation_id;
        details := jsonb_build_object('old_name',group_row.name,'new_name',name_value);
        event_type := 'group_renamed';
      end if;
    when 'close' then
      if member_count <> 1 then raise exception 'group_other_members_exist'; end if;
      update public.conversations set status = 'closed',closed_at = clock_timestamp() where id = p_conversation_id;
      update public.conversation_participants set deleted_at = clock_timestamp()
      where conversation_id = p_conversation_id and user_id = actor;
      event_type := 'group_closed';
    else
      raise exception 'invalid_group_message';
  end case;

  if event_type is not null then
    if target_id is not null then
      details := details || (select jsonb_build_object('target_user_id',p.id,'target_name',coalesce(p.display_name,p.username))
        from public.profiles p where p.id = target_id);
    end if;
    perform private.write_group_event(p_conversation_id,
      coalesce(sequence_value,private.allocate_group_sequence(p_conversation_id)),event_type,details);
  end if;
  insert into private.group_mutation_requests values (p_conversation_id,actor,p_client_request_id,p_operation,p_args,result_value);
  return result_value;
end;
$$;

create function private.set_group_voice_reception_internal(p_conversation_id uuid,p_mode text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  chat_status text;
begin
  if public.is_banned() then raise exception 'user_banned'; end if;
  if p_mode is null or p_mode not in ('inherit','allow','block') then raise exception 'invalid_group_message'; end if;
  -- Group mutations take FOR UPDATE. Direct voice summary updates take the
  -- compatible FOR NO KEY UPDATE lock while holding a recipient preference lock.
  select status into chat_status from public.conversations where id = p_conversation_id for key share;
  if chat_status is distinct from 'active' then raise exception 'not_group_member'; end if;
  update public.conversation_participants set voice_notes_mode = p_mode
  where conversation_id = p_conversation_id and user_id = actor and deleted_at is null;
  if not found then raise exception 'not_group_member'; end if;
  return jsonb_build_object('ok',true,'conversation_id',p_conversation_id,'personal_mode',p_mode);
end;
$$;

revoke all on function private.lock_group(uuid), private.require_group_access(public.conversations,uuid,boolean),
  private.accepted_group_contact(uuid,uuid), private.allocate_group_sequence(uuid),
  private.write_group_event(uuid,bigint,text,jsonb), private.apply_group_mutation(uuid,uuid,text,jsonb)
  from public,anon,authenticated;
create function private.get_group_members_internal(p_conversation_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare actor uuid := (select auth.uid());
begin
  if not exists (select 1 from public.conversations where id = p_conversation_id and type = 'group' and status = 'active')
    or not private.is_active_conversation_participant(p_conversation_id,actor) then
    raise exception 'not_group_member';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'user_id',p.id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url,
      'role',cp.role,'joined_at',cp.joined_at
    ) order by cp.joined_at,p.id),'[]'::jsonb)
    from public.conversation_participants cp join public.profiles p on p.id = cp.user_id
    where cp.conversation_id = p_conversation_id and cp.deleted_at is null
  );
end;
$$;

create function private.get_group_voice_state_internal(p_conversation_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  result_value jsonb;
begin
  select jsonb_build_object(
    'conversation_id',c.id,'status',c.status,'voice_notes_allowed',c.voice_notes_allowed,
    'voice_policy_version',c.voice_policy_version,'my_role',cp.role,
    'personal_mode',cp.voice_notes_mode,'global_enabled',p.voice_notes_enabled,
    'effective_can_receive',cp.voice_notes_mode = 'allow' or (cp.voice_notes_mode = 'inherit' and p.voice_notes_enabled),
    'effective_can_publish',c.status = 'active' and c.voice_notes_allowed and not (select public.is_banned())
  ) into result_value
  from public.conversations c
  join public.conversation_participants cp on cp.conversation_id = c.id
  join public.profiles p on p.id = cp.user_id
  where c.id = p_conversation_id and c.type = 'group' and cp.user_id = actor and cp.deleted_at is null;
  if not found then raise exception 'not_group_member'; end if;
  return result_value;
end;
$$;

create function private.get_inbox_conversations_internal(p_limit integer,p_cursor_at timestamptz,p_cursor_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  with page as (
    select c.*,cp.role,cp.history_from_sequence,cp.last_read_at,cp.voice_notes_mode
    from public.conversation_participants cp join public.conversations c on c.id = cp.conversation_id
    where cp.user_id = (select auth.uid()) and cp.deleted_at is null and cp.archived_at is null
      and c.status = 'active'
      and (p_cursor_at is null or (c.updated_at,c.id) < (p_cursor_at,p_cursor_id))
    order by c.updated_at desc,c.id desc
    limit least(greatest(coalesce(p_limit,50),1),50) + 1
  ), items as (
    select c.updated_at,c.id,
      jsonb_build_object(
        'id',c.id,'type',c.type,'created_at',c.created_at,'updated_at',c.updated_at,
        'last_message_id',m.id,'last_message_sender_id',m.sender_id,
        'last_message_at',m.created_at,'last_message_text',m.body,'last_message_kind',m.kind,
        'last_system_event_type',m.system_event_type,'my_last_read_at',c.last_read_at,
        'my_voice_notes_mode',c.voice_notes_mode,
        'has_unread',m.id is not null and m.sender_id is distinct from (select auth.uid())
          and (c.last_read_at is null or m.created_at > c.last_read_at)
      ) || case when c.type = 'direct' then jsonb_build_object(
        'user_a',c.user_a,'user_b',c.user_b,
        'other',jsonb_build_object('id',p.id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url)
      ) else jsonb_build_object(
        'name',c.name,'status',c.status,'my_role',c.role,'history_from_sequence',c.history_from_sequence,
        'voice_notes_allowed',c.voice_notes_allowed,'voice_policy_version',c.voice_policy_version,
        'member_count',(select count(*) from public.conversation_participants cp
          where cp.conversation_id = c.id and cp.deleted_at is null)
      ) end as item
    from page c
    left join public.profiles p on p.id = case when c.user_a = (select auth.uid()) then c.user_b else c.user_a end
    left join lateral (
      (select id,sender_id,created_at,body,kind,system_event_type from public.messages
       where c.type = 'group' and conversation_id = c.id and deleted_at is null and group_sequence >= c.history_from_sequence
       order by group_sequence desc,id desc limit 1)
      union all
      (select id,sender_id,created_at,body,kind,system_event_type from public.messages
       where c.type = 'direct' and conversation_id = c.id and deleted_at is null
       order by created_at desc,id desc limit 1)
    ) m on true
    order by c.updated_at desc,c.id desc
    limit least(greatest(coalesce(p_limit,50),1),50)
  )
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg(item order by updated_at desc,id desc) from items),'[]'::jsonb),
    'has_more',(select count(*) from page) > least(greatest(coalesce(p_limit,50),1),50)
  );
$$;

create function public.create_group_conversation(p_name text,p_member_ids uuid[],p_client_request_id uuid)
returns uuid language sql security invoker set search_path = ''
as $$
  select private.create_group_conversation_internal(p_name,p_member_ids,p_client_request_id);
$$;
revoke all on function private.create_group_conversation_internal(text,uuid[],uuid), public.create_group_conversation(text,uuid[],uuid) from public,anon,service_role;
grant execute on function private.create_group_conversation_internal(text,uuid[],uuid), public.create_group_conversation(text,uuid[],uuid) to authenticated;

create function public.publish_group_text_message(p_conversation_id uuid,p_body text,p_client_request_id uuid)
returns uuid language sql security invoker set search_path = ''
as $$
  select private.publish_group_text_message_internal(p_conversation_id,p_body,p_client_request_id);
$$;
revoke all on function private.publish_group_text_message_internal(uuid,text,uuid), public.publish_group_text_message(uuid,text,uuid) from public,anon,service_role;
grant execute on function private.publish_group_text_message_internal(uuid,text,uuid), public.publish_group_text_message(uuid,text,uuid) to authenticated;

create function public.publish_group_voice_message(p_message_id uuid,p_attachment_id uuid,p_conversation_id uuid,p_storage_path text,p_mime_type text,p_size_bytes bigint,p_duration_ms integer,p_client_request_id uuid,p_expected_policy_version integer)
returns uuid language sql security invoker set search_path = ''
as $$
  select private.publish_group_voice_message_internal(p_message_id,p_attachment_id,p_conversation_id,p_storage_path,p_mime_type,p_size_bytes,p_duration_ms,p_client_request_id,p_expected_policy_version);
$$;
revoke all on function private.publish_group_voice_message_internal(uuid,uuid,uuid,text,text,bigint,integer,uuid,integer), public.publish_group_voice_message(uuid,uuid,uuid,text,text,bigint,integer,uuid,integer) from public,anon,service_role;
grant execute on function private.publish_group_voice_message_internal(uuid,uuid,uuid,text,text,bigint,integer,uuid,integer), public.publish_group_voice_message(uuid,uuid,uuid,text,text,bigint,integer,uuid,integer) to authenticated;

create function private.set_group_voice_publication_internal(p_conversation_id uuid,p_enabled boolean,p_client_request_id uuid)
returns jsonb language sql security definer set search_path = ''
as $$
  select private.apply_group_mutation(p_conversation_id,p_client_request_id,'voice_policy',jsonb_build_object('enabled',p_enabled));
$$;

create function public.set_group_voice_publication(p_conversation_id uuid,p_enabled boolean,p_client_request_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$
  select private.set_group_voice_publication_internal(p_conversation_id,p_enabled,p_client_request_id);
$$;
revoke all on function private.set_group_voice_publication_internal(uuid,boolean,uuid), public.set_group_voice_publication(uuid,boolean,uuid) from public,anon,service_role;
grant execute on function private.set_group_voice_publication_internal(uuid,boolean,uuid), public.set_group_voice_publication(uuid,boolean,uuid) to authenticated;

create function public.set_group_voice_reception(p_conversation_id uuid,p_mode text)
returns jsonb language sql security invoker set search_path = ''
as $$
  select private.set_group_voice_reception_internal(p_conversation_id,p_mode);
$$;
revoke all on function private.set_group_voice_reception_internal(uuid,text), public.set_group_voice_reception(uuid,text) from public,anon,service_role;
grant execute on function private.set_group_voice_reception_internal(uuid,text), public.set_group_voice_reception(uuid,text) to authenticated;

create function private.add_group_member_internal(p_conversation_id uuid,p_user_id uuid,p_client_request_id uuid)
returns jsonb language sql security definer set search_path = ''
as $$
  select private.apply_group_mutation(p_conversation_id,p_client_request_id,'add',jsonb_build_object('user_id',p_user_id));
$$;

create function public.add_group_member(p_conversation_id uuid,p_user_id uuid,p_client_request_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$
  select private.add_group_member_internal(p_conversation_id,p_user_id,p_client_request_id);
$$;
revoke all on function private.add_group_member_internal(uuid,uuid,uuid), public.add_group_member(uuid,uuid,uuid) from public,anon,service_role;
grant execute on function private.add_group_member_internal(uuid,uuid,uuid), public.add_group_member(uuid,uuid,uuid) to authenticated;

create function private.remove_group_member_internal(p_conversation_id uuid,p_user_id uuid,p_client_request_id uuid)
returns jsonb language sql security definer set search_path = ''
as $$
  select private.apply_group_mutation(p_conversation_id,p_client_request_id,'remove',jsonb_build_object('user_id',p_user_id));
$$;

create function public.remove_group_member(p_conversation_id uuid,p_user_id uuid,p_client_request_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$
  select private.remove_group_member_internal(p_conversation_id,p_user_id,p_client_request_id);
$$;
revoke all on function private.remove_group_member_internal(uuid,uuid,uuid), public.remove_group_member(uuid,uuid,uuid) from public,anon,service_role;
grant execute on function private.remove_group_member_internal(uuid,uuid,uuid), public.remove_group_member(uuid,uuid,uuid) to authenticated;

create function private.leave_group_internal(p_conversation_id uuid,p_client_request_id uuid)
returns jsonb language sql security definer set search_path = ''
as $$
  select private.apply_group_mutation(p_conversation_id,p_client_request_id,'leave','{}'::jsonb);
$$;

create function public.leave_group(p_conversation_id uuid,p_client_request_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$
  select private.leave_group_internal(p_conversation_id,p_client_request_id);
$$;
revoke all on function private.leave_group_internal(uuid,uuid), public.leave_group(uuid,uuid) from public,anon,service_role;
grant execute on function private.leave_group_internal(uuid,uuid), public.leave_group(uuid,uuid) to authenticated;

create function private.set_group_member_role_internal(p_conversation_id uuid,p_user_id uuid,p_role text,p_client_request_id uuid)
returns jsonb language sql security definer set search_path = ''
as $$
  select private.apply_group_mutation(p_conversation_id,p_client_request_id,'role',jsonb_build_object('user_id',p_user_id,'role',p_role));
$$;

create function public.set_group_member_role(p_conversation_id uuid,p_user_id uuid,p_role text,p_client_request_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$
  select private.set_group_member_role_internal(p_conversation_id,p_user_id,p_role,p_client_request_id);
$$;
revoke all on function private.set_group_member_role_internal(uuid,uuid,text,uuid), public.set_group_member_role(uuid,uuid,text,uuid) from public,anon,service_role;
grant execute on function private.set_group_member_role_internal(uuid,uuid,text,uuid), public.set_group_member_role(uuid,uuid,text,uuid) to authenticated;

create function private.rename_group_conversation_internal(p_conversation_id uuid,p_name text,p_client_request_id uuid)
returns jsonb language sql security definer set search_path = ''
as $$
  select private.apply_group_mutation(p_conversation_id,p_client_request_id,'rename',jsonb_build_object('name',p_name));
$$;

create function public.rename_group_conversation(p_conversation_id uuid,p_name text,p_client_request_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$
  select private.rename_group_conversation_internal(p_conversation_id,p_name,p_client_request_id);
$$;
revoke all on function private.rename_group_conversation_internal(uuid,text,uuid), public.rename_group_conversation(uuid,text,uuid) from public,anon,service_role;
grant execute on function private.rename_group_conversation_internal(uuid,text,uuid), public.rename_group_conversation(uuid,text,uuid) to authenticated;

create function private.close_group_conversation_internal(p_conversation_id uuid,p_client_request_id uuid)
returns jsonb language sql security definer set search_path = ''
as $$
  select private.apply_group_mutation(p_conversation_id,p_client_request_id,'close','{}'::jsonb);
$$;

create function public.close_group_conversation(p_conversation_id uuid,p_client_request_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$
  select private.close_group_conversation_internal(p_conversation_id,p_client_request_id);
$$;
revoke all on function private.close_group_conversation_internal(uuid,uuid), public.close_group_conversation(uuid,uuid) from public,anon,service_role;
grant execute on function private.close_group_conversation_internal(uuid,uuid), public.close_group_conversation(uuid,uuid) to authenticated;

create function public.get_inbox_conversations(p_limit integer default 50,p_cursor_at timestamptz default null,p_cursor_id uuid default null)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select private.get_inbox_conversations_internal(p_limit,p_cursor_at,p_cursor_id);
$$;
revoke all on function private.get_inbox_conversations_internal(integer,timestamptz,uuid), public.get_inbox_conversations(integer,timestamptz,uuid) from public,anon,service_role;
grant execute on function private.get_inbox_conversations_internal(integer,timestamptz,uuid), public.get_inbox_conversations(integer,timestamptz,uuid) to authenticated;

create function public.get_group_members(p_conversation_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select private.get_group_members_internal(p_conversation_id);
$$;
revoke all on function private.get_group_members_internal(uuid), public.get_group_members(uuid) from public,anon,service_role;
grant execute on function private.get_group_members_internal(uuid), public.get_group_members(uuid) to authenticated;

create function public.get_group_voice_state(p_conversation_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select private.get_group_voice_state_internal(p_conversation_id);
$$;
revoke all on function private.get_group_voice_state_internal(uuid), public.get_group_voice_state(uuid) from public,anon,service_role;
grant execute on function private.get_group_voice_state_internal(uuid), public.get_group_voice_state(uuid) to authenticated;
-- Keep the existing direct permission payload and extend it for groups.
create or replace function private.get_voice_note_permission_internal(p_conversation_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  chat public.conversations;
  allowed boolean;
begin
  select * into chat from public.conversations
  where id = p_conversation_id and private.is_active_conversation_participant(id,actor);
  if not found then return jsonb_build_object('allowed',false,'reason','conversation_unavailable'); end if;
  if chat.type = 'group' then
    allowed := chat.status = 'active' and chat.voice_notes_allowed;
    return jsonb_build_object('allowed',allowed,'policy_version',chat.voice_policy_version,
      'reason',case when chat.status = 'closed' then 'group_closed'
        when allowed then 'allowed' else 'group_voice_disabled' end);
  end if;

  select cp.voice_notes_mode = 'allow' or (cp.voice_notes_mode = 'inherit' and p.voice_notes_enabled)
  into allowed
  from public.conversation_participants cp join public.profiles p on p.id = cp.user_id
  where cp.conversation_id = p_conversation_id and cp.user_id <> actor and cp.deleted_at is null
  order by cp.user_id limit 1;
  return jsonb_build_object('allowed',coalesce(allowed,false),
    'reason',case when allowed is null then 'conversation_unavailable'
      when allowed then 'allowed' else 'recipient_disabled' end);
end;
$$;

revoke execute on function private.get_voice_note_permission_internal(uuid), public.get_voice_note_permission(uuid)
  from public,anon,service_role;
grant execute on function private.get_voice_note_permission_internal(uuid), public.get_voice_note_permission(uuid)
  to authenticated;

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

  if public.is_banned() then raise exception 'user_banned'; end if;

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

  if p_storage_path is null or p_storage_path like '%..%'
     or split_part(p_storage_path, '/', 1) <> p_conversation_id::text
     or split_part(p_storage_path, '/', 2) <> v_user_id::text
     or split_part(p_storage_path, '/', 3) <> p_message_id::text
     or split_part(split_part(p_storage_path, '/', 4), '.', 1) <> p_attachment_id::text
     or split_part(p_storage_path, '/', 5) <> '' then
    raise exception 'Invalid voice note path' using errcode = '22023';
  end if;

  perform 1 from storage.objects o
  where o.bucket_id = 'chat-media'
    and o.name = p_storage_path
    and o.owner_id = v_user_id::text
    and o.metadata->>'size' = p_size_bytes::text
    and lower(split_part(o.metadata->>'mimetype', ';', 1)) = v_mime_type
  for update;
  if not found then
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
