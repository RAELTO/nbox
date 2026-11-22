create function private.valid_profile_links(p_links jsonb)
returns boolean language plpgsql immutable set search_path = ''
as $$
begin
  if jsonb_typeof(p_links) is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_links) > 5 then return false; end if;
  return not exists (
    select 1 from jsonb_array_elements(p_links) as link(value)
    where jsonb_typeof(value) is distinct from 'object'
       or jsonb_typeof(value->'label') is distinct from 'string'
       or char_length(value->>'label') not between 1 and 40
       or value->>'label' !~ '[^[:space:]]'
       or jsonb_typeof(value->'url') is distinct from 'string'
       or value->>'url' !~* '^https?://[^/?#[:space:]]'
       or split_part(value->>'url', '/', 3) like '%@%'
       or value->>'url' ~ '[[:cntrl:]]'
       or strpos(value->>'url', chr(92)) > 0
       or char_length(value->>'url') > 300
  );
end;
$$;

revoke all on function private.valid_profile_links(jsonb) from public, anon;
grant execute on function private.valid_profile_links(jsonb) to authenticated, service_role;

alter table public.profiles
  add column pinned_box_id uuid references public.boxes(id) on delete set null,
  add column links jsonb not null default '[]'::jsonb
    check (private.valid_profile_links(links));
create index profiles_pinned_box_id_idx on public.profiles(pinned_box_id);

create function private.guard_profile_update()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if current_user = 'authenticated' and new.id = (select auth.uid())
       and (new.role, new.is_banned) is distinct from (old.role, old.is_banned) then
      raise exception 'profile_privileged_fields' using errcode = '42501';
    end if;
    if new.pinned_box_id is not distinct from old.pinned_box_id then return new; end if;
  elsif current_user = 'authenticated' and (new.role is distinct from 'user' or new.is_banned is distinct from false) then
    raise exception 'profile_privileged_fields' using errcode = '42501';
  end if;
  if new.pinned_box_id is not null and not exists (
    select 1 from public.boxes b
    where b.id = new.pinned_box_id and b.author_id = new.id and b.status = 'published'
  ) then
    raise exception 'pinned_box_forbidden' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_profile_update() from public, anon, authenticated;
create trigger guard_profile_update
before insert or update on public.profiles
for each row execute function private.guard_profile_update();

alter policy profiles_update_own on public.profiles to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and role = (select p.role from public.profiles p where p.id = (select auth.uid()))
    and is_banned = (select p.is_banned from public.profiles p where p.id = (select auth.uid()))
  );

update storage.buckets
set file_size_limit = 1048576,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif']
where id = 'post-images';

-- Restrictive policies also cover any existing permissive policies for this bucket.
create policy post_images_insert_guard on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'post-images' or (
    owner_id = (select auth.uid())::text and name not like '%..%' and not (select public.is_banned())
  ));
create policy post_images_update_guard on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'post-images' or (
    owner_id = (select auth.uid())::text and name not like '%..%' and not (select public.is_banned())
  ))
  with check (bucket_id <> 'post-images' or (
    owner_id = (select auth.uid())::text and name not like '%..%' and not (select public.is_banned())
  ));
create policy post_images_delete_guard on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'post-images' or (
    owner_id = (select auth.uid())::text and name not like '%..%' and not (select public.is_banned())
  ));
create policy post_images_insert_anon_guard on storage.objects as restrictive for insert to anon
  with check (bucket_id <> 'post-images');
create policy post_images_update_anon_guard on storage.objects as restrictive for update to anon
  using (bucket_id <> 'post-images') with check (bucket_id <> 'post-images');
create policy post_images_delete_anon_guard on storage.objects as restrictive for delete to anon
  using (bucket_id <> 'post-images');

revoke insert on public.notifications from public, anon, authenticated;
create function private.guard_notification_update()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (to_jsonb(new) - 'read_at') is distinct from (to_jsonb(old) - 'read_at') then
    raise exception 'notification_fields_read_only' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_notification_update() from public, anon, authenticated;
create trigger guard_notification_update before update on public.notifications
for each row execute function private.guard_notification_update();

alter function public.trg_fn_box_reaction_notif() set search_path = '';
alter function public.trg_fn_box_vote_notif() set search_path = '';
alter function public.trg_fn_box_comment_notif() set search_path = '';
alter function public.trg_fn_follow_notif() set search_path = '';
alter function public.trg_fn_contact_request_notif() set search_path = '';
alter function public.trg_fn_box_share_notif() set search_path = '';

do $$
declare
  relation text;
begin
  foreach relation in array array['box_votes', 'box_shares', 'comment_votes', 'comment_reactions', 'box_poll_votes']
  loop
    execute format('create policy ban_guard_insert on public.%I as restrictive for insert to authenticated with check (not (select public.is_banned()))', relation);
    execute format('create policy ban_guard_update on public.%I as restrictive for update to authenticated using (not (select public.is_banned())) with check (not (select public.is_banned()))', relation);
    execute format('create policy ban_guard_delete on public.%I as restrictive for delete to authenticated using (not (select public.is_banned()))', relation);
  end loop;
end;
$$;

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
    ranked.updated_at
  from ranked, input
  order by ranked.search_rank desc, ranked.published_at desc nulls last
  limit (select max_rows from input);
$$;

revoke execute on function public.search_boxes(text, integer) from public, anon;
grant execute on function public.search_boxes(text, integer) to authenticated;
