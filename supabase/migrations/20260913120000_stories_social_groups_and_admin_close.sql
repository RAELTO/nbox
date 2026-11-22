create function private.delete_group_conversation_internal(p_conversation_id uuid, p_client_request_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  group_row public.conversations := private.lock_group(p_conversation_id);
  prior private.group_mutation_requests;
  result jsonb := jsonb_build_object('ok', true, 'conversation_id', p_conversation_id, 'status', 'closed');
begin
  if public.is_banned() then raise exception 'user_banned'; end if;
  if p_client_request_id is null then raise exception 'invalid_group_message'; end if;
  select * into prior from private.group_mutation_requests
  where conversation_id = p_conversation_id and actor_id = actor and request_id = p_client_request_id;
  if found then
    if prior.operation <> 'delete_group' then raise exception 'idempotency_conflict'; end if;
    return prior.result;
  end if;
  perform private.require_group_access(group_row, actor, true);

  update public.conversations set status = 'closed', closed_at = clock_timestamp()
  where id = p_conversation_id;
  update public.conversation_participants set deleted_at = clock_timestamp()
  where conversation_id = p_conversation_id and deleted_at is null;
  perform private.write_group_event(p_conversation_id, private.allocate_group_sequence(p_conversation_id),
    'group_closed', jsonb_build_object('deleted_by_admin', true));

  insert into private.group_mutation_requests(conversation_id, actor_id, request_id, operation, arguments, result)
  values (p_conversation_id, actor, p_client_request_id, 'delete_group', '{}'::jsonb, result);
  return result;
end;
$$;

create function public.delete_group_conversation(p_conversation_id uuid, p_client_request_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.delete_group_conversation_internal(p_conversation_id, p_client_request_id); $$;

revoke all on function private.delete_group_conversation_internal(uuid, uuid),
  public.delete_group_conversation(uuid, uuid) from public, anon, service_role;
grant execute on function private.delete_group_conversation_internal(uuid, uuid),
  public.delete_group_conversation(uuid, uuid) to authenticated;

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  media_url text check (media_url is null or (
    media_url ~* '^https?://[^/?#[:space:]]' and split_part(media_url, '/', 3) not like '%@%'
    and media_url !~ '[[:cntrl:]]' and strpos(media_url, chr(92)) = 0 and char_length(media_url) <= 500
  )),
  caption text check (caption is null or char_length(caption) <= 280),
  bg_color text not null default 'accent-1'
    check (bg_color in ('accent-1','accent-2','accent-3','accent-4','accent-5','ink')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  check (media_url is not null or (caption is not null and char_length(btrim(caption)) > 0))
);
create index stories_expiry_idx on public.stories(expires_at desc, created_at desc);
create index stories_author_idx on public.stories(author_id, created_at desc);

create table public.story_views (
  story_id uuid not null references public.stories(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);
create index story_views_viewer_idx on public.story_views(viewer_id);

alter table public.stories enable row level security;
alter table public.story_views enable row level security;
revoke all on public.stories, public.story_views from public, anon, authenticated;
grant select, insert, delete on public.stories to authenticated;
grant select, insert on public.story_views to authenticated;

create policy stories_select on public.stories for select to authenticated
using (expires_at > now() or author_id = (select auth.uid()));
create policy stories_insert on public.stories for insert to authenticated
with check (author_id = (select auth.uid()) and not (select public.is_banned())
  and expires_at <= now() + interval '25 hours');
create policy stories_delete on public.stories for delete to authenticated
using (author_id = (select auth.uid()) or exists (
  select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'
));
create policy story_views_select on public.story_views for select to authenticated
using (viewer_id = (select auth.uid()) or exists (
  select 1 from public.stories s where s.id = story_views.story_id and s.author_id = (select auth.uid())
));
create policy story_views_insert on public.story_views for insert to authenticated
with check (viewer_id = (select auth.uid()) and not (select public.is_banned()) and exists (
  select 1 from public.stories s where s.id = story_views.story_id and s.expires_at > now()
));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stories') then
    alter publication supabase_realtime add table public.stories;
  end if;
end;
$$;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  description text not null default '' check (char_length(description) <= 500),
  accent_color text not null default 'accent-3'
    check (accent_color in ('accent-1','accent-2','accent-3','accent-4','accent-5')),
  visibility text not null default 'public' check (visibility in ('public','private')),
  join_policy text not null default 'open' check (join_policy in ('open','approval')),
  post_policy text not null default 'members' check (post_policy in ('members','admins_only')),
  created_by uuid references public.profiles(id) on delete set null,
  pinned_box_id uuid references public.boxes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index groups_creator_idx on public.groups(created_by);
create index groups_pinned_box_idx on public.groups(pinned_box_id);
create index groups_visibility_idx on public.groups(visibility, created_at desc);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('member','moderator','admin')),
  status text not null default 'active' check (status in ('active','banned')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_active_user_idx on public.group_members(user_id, group_id) where status = 'active';
create index group_members_active_role_idx on public.group_members(group_id, role) where status = 'active';
create index group_members_user_idx on public.group_members(user_id);

create table public.group_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text check (message is null or char_length(message) <= 240),
  status text not null default 'pending' check (status in ('pending','approved','declined','canceled')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create unique index group_join_requests_pending_idx
  on public.group_join_requests(group_id, user_id) where status = 'pending';
create index group_join_requests_group_idx on public.group_join_requests(group_id, status, created_at desc);
create index group_join_requests_user_idx on public.group_join_requests(user_id);
create index group_join_requests_reviewer_idx on public.group_join_requests(reviewed_by);

alter table public.boxes add column group_id uuid references public.groups(id) on delete cascade;
create index boxes_group_published_idx on public.boxes(group_id, published_at desc)
  where group_id is not null and status = 'published';
create index boxes_group_fk_idx on public.boxes(group_id);

create function private.is_social_group_member(p_group_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.group_members m
    where m.group_id = p_group_id and m.user_id = p_user_id and m.status = 'active');
$$;

create function private.is_social_group_moderator(p_group_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.group_members m
    where m.group_id = p_group_id and m.user_id = p_user_id
      and m.status = 'active' and m.role in ('moderator','admin'));
$$;

create function private.is_social_group_admin(p_group_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.group_members m
    where m.group_id = p_group_id and m.user_id = p_user_id and m.status = 'active' and m.role = 'admin');
$$;

create function private.can_post_in_social_group(p_group_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.group_members m join public.groups g on g.id = m.group_id
    where m.group_id = p_group_id and m.user_id = p_user_id and m.status = 'active'
      and (g.post_policy = 'members' or m.role in ('moderator','admin')));
$$;

revoke all on function private.is_social_group_member(uuid, uuid),
  private.is_social_group_moderator(uuid, uuid), private.is_social_group_admin(uuid, uuid),
  private.can_post_in_social_group(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function private.is_social_group_member(uuid, uuid),
  private.is_social_group_moderator(uuid, uuid), private.can_post_in_social_group(uuid, uuid) to authenticated;

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_join_requests enable row level security;
revoke all on public.groups, public.group_members, public.group_join_requests from public, anon, authenticated;
grant select on public.groups, public.group_members, public.group_join_requests to authenticated;

create policy groups_select on public.groups for select to authenticated using (true);
create policy group_members_select on public.group_members for select to authenticated
using (user_id = (select auth.uid()) or exists (
  select 1 from public.groups g where g.id = group_members.group_id and g.visibility = 'public'
) or private.is_social_group_member(group_id, (select auth.uid())));
create policy group_join_requests_select on public.group_join_requests for select to authenticated
using (user_id = (select auth.uid()) or private.is_social_group_moderator(group_id, (select auth.uid())));

alter policy boxes_select_public on public.boxes to authenticated
using ((status = 'published' or author_id = (select auth.uid())) and (
  group_id is null or exists (select 1 from public.groups g where g.id = boxes.group_id and g.visibility = 'public')
  or private.is_social_group_member(group_id, (select auth.uid()))
  or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
));
create policy boxes_select_anon on public.boxes for select to anon
using (status = 'published' and group_id is null);

alter policy boxes_insert_own on public.boxes to authenticated
with check (author_id = (select auth.uid()) and not (select public.is_banned())
  and (group_id is null or private.can_post_in_social_group(group_id, (select auth.uid()))));
alter policy boxes_delete_own on public.boxes to authenticated
using (author_id = (select auth.uid()) or (
  group_id is not null and private.is_social_group_moderator(group_id, (select auth.uid()))
));
alter policy admin_delete_any_box on public.boxes to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'));

-- Apply the posting policy to updates as well, including when an author changes a box's group.
alter policy boxes_update_own on public.boxes to authenticated
using (author_id = (select auth.uid()) and not (select public.is_banned()))
with check (author_id = (select auth.uid()) and not (select public.is_banned())
  and (group_id is null or private.can_post_in_social_group(group_id, (select auth.uid()))));
create or replace function public.search_boxes(q text, lim integer default 20)
returns setof public.boxes
language sql
stable
security invoker
set search_path = ''
as $$
  with input as (
    select
      trim(coalesce(q, '')) as term,
      regexp_replace(trim(coalesce(q, '')), '^#', '') as tag_term,
      least(greatest(coalesce(lim, 20), 1), 50) as max_rows
  ), escaped as (
    select input.*,
      replace(replace(replace(term, chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_') as pattern,
      replace(replace(replace(tag_term, chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_') as tag_pattern
    from input
  ),
  ranked as (
    select distinct on (b.id)
      b.*,
      case
        when lower(pr.username) = lower(i.term) then 100
        when lower(pr.display_name) = lower(i.term) then 90
        when lower(t.slug) = lower(i.tag_term) then 85
        when b.content ilike i.pattern || '%' then 70
        when pr.username ilike i.pattern || '%' then 60
        when pr.display_name ilike i.pattern || '%' then 55
        when t.name ilike i.tag_pattern || '%' or t.slug ilike i.tag_pattern || '%' then 50
        else 10
      end as search_rank
    from public.boxes b
    cross join escaped i
    left join public.profiles pr on pr.id = b.author_id
    left join public.box_tags bt on bt.box_id = b.id
    left join public.tags t on t.id = bt.tag_id
    where length(i.term) >= 2
      and b.status = 'published'
      and b.group_id is null
      and (
        b.content ilike '%' || i.pattern || '%'
        or pr.username ilike '%' || i.pattern || '%'
        or pr.display_name ilike '%' || i.pattern || '%'
        or t.name ilike '%' || i.tag_pattern || '%'
        or t.slug ilike '%' || i.tag_pattern || '%'
      )
    order by b.id, search_rank desc, b.published_at desc nulls last
  )
  select
    ranked.id,
    ranked.author_id,
    ranked.type,
    ranked.content,
    ranked.payload,
    ranked.status,
    ranked.published_at,
    ranked.created_at,
    ranked.updated_at,
    ranked.group_id
  from ranked, input
  order by ranked.search_rank desc, ranked.published_at desc nulls last
  limit (select max_rows from input);
$$;

revoke execute on function public.search_boxes(text, integer) from public, anon;
grant execute on function public.search_boxes(text, integer) to authenticated;
-- Serialize community mutations on the group row before reading membership or request state.
create function private.lock_social_group(p_group_id uuid)
returns public.groups language plpgsql set search_path = ''
as $$
declare
  group_row public.groups;
begin
  select * into group_row from public.groups where id = p_group_id for update;
  if not found then raise exception 'social_group_not_found'; end if;
  return group_row;
end;
$$;

create function private.social_group_actor()
returns uuid language plpgsql stable set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null then raise exception 'authentication_required'; end if;
  if public.is_banned() then raise exception 'user_banned'; end if;
  return actor;
end;
$$;

-- Call while holding the community lock.
create function private.admit_social_group_member(p_group_id uuid, p_user_id uuid, p_reviewer uuid)
returns void language plpgsql set search_path = ''
as $$
begin
  if exists (select 1 from public.group_members
    where group_id = p_group_id and user_id = p_user_id and status = 'banned') then
    raise exception 'group_member_banned';
  end if;
  insert into public.group_members(group_id, user_id) values (p_group_id, p_user_id)
  on conflict (group_id, user_id) do nothing;
  update public.group_join_requests set status = 'approved', reviewed_by = p_reviewer, responded_at = now()
  where group_id = p_group_id and user_id = p_user_id and status = 'pending';
end;
$$;

revoke all on function private.lock_social_group(uuid), private.social_group_actor(),
  private.admit_social_group_member(uuid, uuid, uuid) from public, anon, authenticated, service_role;

create function private.create_social_group_internal(p_name text, p_description text, p_visibility text, p_join_policy text, p_post_policy text, p_accent_color text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := private.social_group_actor();
  name_value text := btrim(p_name);
  slug_base text := btrim(regexp_replace(lower(name_value), '[^a-z0-9]+', '-', 'g'), '-');
  slug_value text;
  new_group public.groups;
begin
  if name_value is null or char_length(name_value) not between 2 and 80 then
    raise exception 'invalid_group_name';
  end if;
  slug_value := rtrim(left(slug_base, 64), '-');
  if char_length(slug_value) < 3 then
    slug_value := coalesce(nullif(slug_value, ''), 'group') || '-' || left(gen_random_uuid()::text, 4);
  end if;
  loop
    insert into public.groups(name, slug, description, visibility, join_policy, post_policy, accent_color, created_by)
    values (name_value, slug_value, btrim(coalesce(p_description, '')), p_visibility, p_join_policy,
      p_post_policy, p_accent_color, actor)
    on conflict (slug) do nothing
    returning * into new_group;
    exit when found;
    slug_value := coalesce(nullif(rtrim(left(slug_base, 59), '-'), ''), 'group')
      || '-' || left(gen_random_uuid()::text, 4);
  end loop;
  insert into public.group_members(group_id, user_id, role) values (new_group.id, actor, 'admin');
  return jsonb_build_object('id', new_group.id, 'slug', new_group.slug);
end;
$$;

create function public.create_social_group(p_name text, p_description text, p_visibility text, p_join_policy text, p_post_policy text, p_accent_color text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.create_social_group_internal(p_name, p_description, p_visibility, p_join_policy, p_post_policy, p_accent_color); $$;

revoke all on function private.create_social_group_internal(text, text, text, text, text, text),
  public.create_social_group(text, text, text, text, text, text) from public, anon, service_role;
grant execute on function private.create_social_group_internal(text, text, text, text, text, text),
  public.create_social_group(text, text, text, text, text, text) to authenticated;

create function private.update_social_group_settings_internal(p_group_id uuid, p_name text, p_description text, p_visibility text, p_join_policy text, p_post_policy text, p_accent_color text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := private.social_group_actor();
begin
  perform private.lock_social_group(p_group_id);
  if not private.is_social_group_admin(p_group_id, actor) then raise exception 'group_admin_required'; end if;
  update public.groups set name = btrim(p_name), description = btrim(coalesce(p_description, '')),
    visibility = p_visibility, join_policy = p_join_policy, post_policy = p_post_policy,
    accent_color = p_accent_color, updated_at = now()
  where id = p_group_id;
  return jsonb_build_object('ok', true);
end;
$$;

create function public.update_social_group_settings(p_group_id uuid, p_name text, p_description text, p_visibility text, p_join_policy text, p_post_policy text, p_accent_color text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.update_social_group_settings_internal(p_group_id, p_name, p_description, p_visibility, p_join_policy, p_post_policy, p_accent_color); $$;

revoke all on function private.update_social_group_settings_internal(uuid, text, text, text, text, text, text),
  public.update_social_group_settings(uuid, text, text, text, text, text, text) from public, anon, service_role;
grant execute on function private.update_social_group_settings_internal(uuid, text, text, text, text, text, text),
  public.update_social_group_settings(uuid, text, text, text, text, text, text) to authenticated;

create function private.join_or_request_social_group_internal(p_group_id uuid, p_message text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := private.social_group_actor();
  group_row public.groups := private.lock_social_group(p_group_id);
  member_status text;
begin
  select status into member_status from public.group_members where group_id = p_group_id and user_id = actor;
  if member_status = 'banned' then raise exception 'group_member_banned'; end if;
  if member_status = 'active' then return jsonb_build_object('status', 'already_member'); end if;

  if group_row.join_policy = 'open' then
    perform private.admit_social_group_member(p_group_id, actor, null);
    return jsonb_build_object('status', 'joined');
  end if;

  insert into public.group_join_requests(group_id, user_id, message)
  values (p_group_id, actor, p_message)
  on conflict (group_id, user_id) where status = 'pending'
  do update set message = excluded.message;
  return jsonb_build_object('status', 'requested');
end;
$$;

create function public.join_or_request_social_group(p_group_id uuid, p_message text default null)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.join_or_request_social_group_internal(p_group_id, p_message); $$;

revoke all on function private.join_or_request_social_group_internal(uuid, text),
  public.join_or_request_social_group(uuid, text) from public, anon, service_role;
grant execute on function private.join_or_request_social_group_internal(uuid, text),
  public.join_or_request_social_group(uuid, text) to authenticated;

create function private.cancel_group_join_request_internal(p_group_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := private.social_group_actor();
begin
  perform private.lock_social_group(p_group_id);
  update public.group_join_requests set status = 'canceled', responded_at = now()
  where group_id = p_group_id and user_id = actor and status = 'pending';
  return jsonb_build_object('ok', true);
end;
$$;

create function public.cancel_group_join_request(p_group_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.cancel_group_join_request_internal(p_group_id); $$;

revoke all on function private.cancel_group_join_request_internal(uuid),
  public.cancel_group_join_request(uuid) from public, anon, service_role;
grant execute on function private.cancel_group_join_request_internal(uuid),
  public.cancel_group_join_request(uuid) to authenticated;

create function private.respond_group_join_request_internal(p_request_id uuid, p_approve boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := private.social_group_actor();
  request_row public.group_join_requests;
begin
  if p_approve is null then raise exception 'invalid_group_join_response'; end if;
  select * into request_row from public.group_join_requests where id = p_request_id;
  if not found then raise exception 'group_join_request_not_pending'; end if;
  perform private.lock_social_group(request_row.group_id);
  if not private.is_social_group_moderator(request_row.group_id, actor) then
    raise exception 'group_moderator_required';
  end if;

  select * into request_row from public.group_join_requests where id = p_request_id and status = 'pending';
  if not found then raise exception 'group_join_request_not_pending'; end if;
  if p_approve then
    perform private.admit_social_group_member(request_row.group_id, request_row.user_id, actor);
    return jsonb_build_object('status', 'approved');
  end if;

  update public.group_join_requests set status = 'declined', reviewed_by = actor, responded_at = now()
  where id = p_request_id;
  return jsonb_build_object('status', 'declined');
end;
$$;

create function public.respond_group_join_request(p_request_id uuid, p_approve boolean)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.respond_group_join_request_internal(p_request_id, p_approve); $$;

revoke all on function private.respond_group_join_request_internal(uuid, boolean),
  public.respond_group_join_request(uuid, boolean) from public, anon, service_role;
grant execute on function private.respond_group_join_request_internal(uuid, boolean),
  public.respond_group_join_request(uuid, boolean) to authenticated;

create function private.invite_contact_to_social_group_internal(p_group_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := private.social_group_actor();
begin
  perform private.lock_social_group(p_group_id);
  if not private.is_social_group_moderator(p_group_id, actor) then raise exception 'group_moderator_required'; end if;
  if not private.accepted_group_contact(actor, p_user_id) then raise exception 'accepted_contact_required'; end if;
  perform private.admit_social_group_member(p_group_id, p_user_id, actor);
  return jsonb_build_object('status', 'joined');
end;
$$;

create function public.invite_contact_to_social_group(p_group_id uuid, p_user_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.invite_contact_to_social_group_internal(p_group_id, p_user_id); $$;

revoke all on function private.invite_contact_to_social_group_internal(uuid, uuid),
  public.invite_contact_to_social_group(uuid, uuid) from public, anon, service_role;
grant execute on function private.invite_contact_to_social_group_internal(uuid, uuid),
  public.invite_contact_to_social_group(uuid, uuid) to authenticated;

create function private.moderate_social_group_member_internal(p_group_id uuid, p_user_id uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := private.social_group_actor();
  target public.group_members;
begin
  perform private.lock_social_group(p_group_id);
  if not private.is_social_group_moderator(p_group_id, actor) then raise exception 'group_moderator_required'; end if;
  if p_action is null or p_action not in ('promote_admin','promote_moderator','demote_member','remove','ban','unban') then
    raise exception 'invalid_group_member_action';
  end if;
  select * into target from public.group_members where group_id = p_group_id and user_id = p_user_id;
  if not found then raise exception 'not_group_member'; end if;

  if not private.is_social_group_admin(p_group_id, actor)
    and (target.role <> 'member' or p_action not in ('remove','ban','unban')) then
    raise exception 'group_admin_required';
  end if;
  if target.role = 'admin' and target.status = 'active'
    and p_action in ('promote_moderator','demote_member','remove','ban')
    and not exists (select 1 from public.group_members
      where group_id = p_group_id and user_id <> p_user_id and role = 'admin' and status = 'active') then
    raise exception 'last_social_group_admin';
  end if;
  if target.status = 'banned' and p_action in ('promote_admin','promote_moderator','demote_member') then
    raise exception 'group_member_banned';
  end if;

  if p_action = 'remove' then
    delete from public.group_members where group_id = p_group_id and user_id = p_user_id;
  elsif p_action in ('ban','unban') then
    update public.group_members set status = case when p_action = 'ban' then 'banned' else 'active' end
    where group_id = p_group_id and user_id = p_user_id;
  else
    update public.group_members set role = case p_action
      when 'promote_admin' then 'admin' when 'promote_moderator' then 'moderator' else 'member' end
    where group_id = p_group_id and user_id = p_user_id;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create function public.moderate_social_group_member(p_group_id uuid, p_user_id uuid, p_action text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.moderate_social_group_member_internal(p_group_id, p_user_id, p_action); $$;

revoke all on function private.moderate_social_group_member_internal(uuid, uuid, text),
  public.moderate_social_group_member(uuid, uuid, text) from public, anon, service_role;
grant execute on function private.moderate_social_group_member_internal(uuid, uuid, text),
  public.moderate_social_group_member(uuid, uuid, text) to authenticated;

create function private.leave_social_group_internal(p_group_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := private.social_group_actor();
begin
  perform private.lock_social_group(p_group_id);
  if private.is_social_group_admin(p_group_id, actor)
    and exists (select 1 from public.group_members
      where group_id = p_group_id and user_id <> actor and status = 'active')
    and not exists (select 1 from public.group_members
      where group_id = p_group_id and user_id <> actor and status = 'active' and role = 'admin') then
    raise exception 'last_social_group_admin';
  end if;
  delete from public.group_members where group_id = p_group_id and user_id = actor and status = 'active';
  return jsonb_build_object('ok', true);
end;
$$;

create function public.leave_social_group(p_group_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.leave_social_group_internal(p_group_id); $$;

revoke all on function private.leave_social_group_internal(uuid),
  public.leave_social_group(uuid) from public, anon, service_role;
grant execute on function private.leave_social_group_internal(uuid),
  public.leave_social_group(uuid) to authenticated;

create function private.pin_social_group_box_internal(p_group_id uuid, p_box_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := private.social_group_actor();
begin
  perform private.lock_social_group(p_group_id);
  if not private.is_social_group_moderator(p_group_id, actor) then raise exception 'group_moderator_required'; end if;
  if p_box_id is not null then
    perform 1 from public.boxes where id = p_box_id and group_id = p_group_id and status = 'published' for share;
    if not found then raise exception 'invalid_group_pinned_box'; end if;
  end if;
  update public.groups set pinned_box_id = p_box_id, updated_at = now() where id = p_group_id;
  return jsonb_build_object('ok', true);
end;
$$;

create function public.pin_social_group_box(p_group_id uuid, p_box_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.pin_social_group_box_internal(p_group_id, p_box_id); $$;

revoke all on function private.pin_social_group_box_internal(uuid, uuid),
  public.pin_social_group_box(uuid, uuid) from public, anon, service_role;
grant execute on function private.pin_social_group_box_internal(uuid, uuid),
  public.pin_social_group_box(uuid, uuid) to authenticated;

create function private.delete_social_group_internal(p_group_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := private.social_group_actor();
begin
  perform private.lock_social_group(p_group_id);
  if not private.is_social_group_admin(p_group_id, actor) then raise exception 'group_admin_required'; end if;
  delete from public.groups where id = p_group_id;
  return jsonb_build_object('ok', true);
end;
$$;

create function public.delete_social_group(p_group_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.delete_social_group_internal(p_group_id); $$;

revoke all on function private.delete_social_group_internal(uuid),
  public.delete_social_group(uuid) from public, anon, service_role;
grant execute on function private.delete_social_group_internal(uuid),
  public.delete_social_group(uuid) to authenticated;
