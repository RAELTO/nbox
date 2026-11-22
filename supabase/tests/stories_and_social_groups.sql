begin;

create function pg_temp.check_true(p_value boolean,p_description text)
returns void language plpgsql as $$
begin
  if p_value is distinct from true then raise exception 'Failed: %',p_description; end if;
end;
$$;

create function pg_temp.expect_error(p_sql text,p_message text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm = p_message or (p_message = '42501' and sqlstate = '42501') then return; end if;
    raise exception 'Expected %, received % for %',p_message,sqlerrm,p_sql;
  end;
  raise exception 'Expected % for %',p_message,p_sql;
end;
$$;

create temp table social_fixtures(n integer primary key, id uuid not null);
insert into social_fixtures select n, gen_random_uuid() from generate_series(1, 5) n;
grant select on social_fixtures to authenticated;

insert into auth.users(id, email, raw_user_meta_data)
select id, 'social-' || id || '@example.invalid',
  jsonb_build_object('username', 'test_' || left(replace(id::text, '-', ''), 20), 'display_name', 'Social fixture')
from social_fixtures;
insert into public.contacts(user_a, user_b)
select least(a.id, b.id), greatest(a.id, b.id)
from social_fixtures a cross join social_fixtures b where a.n = 1 and b.n in (2, 3);
update public.profiles set is_banned = true where id = (select id from social_fixtures where n = 5);

set local role authenticated;

do $$
declare
  admin_id uuid := (select id from social_fixtures where n = 1);
  moderator_id uuid := (select id from social_fixtures where n = 2);
  member_id uuid := (select id from social_fixtures where n = 3);
  outsider_id uuid := (select id from social_fixtures where n = 4);
  banned_id uuid := (select id from social_fixtures where n = 5);
  chat_id uuid;
  close_request uuid := gen_random_uuid();
  close_result jsonb;
  live_story_id uuid;
  expired_id uuid;
  private_group uuid;
  open_group uuid;
  request_id uuid;
  private_box uuid;
  moderated_box uuid;
  open_box uuid;
  global_box uuid;
begin
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  chat_id := public.create_group_conversation('Force close fixture', array[moderator_id, member_id], gen_random_uuid());
  perform set_config('test.deleted_chat_id', chat_id::text, true);
  perform pg_temp.expect_error(format('select public.close_group_conversation(%L, gen_random_uuid())', chat_id),
    'group_other_members_exist');

  perform set_config('request.jwt.claim.sub', moderator_id::text, true);
  perform pg_temp.expect_error(format('select public.delete_group_conversation(%L, gen_random_uuid())', chat_id),
    'group_admin_required');
  perform pg_temp.check_true(exists (select 1 from public.conversations where id = chat_id), 'chat remains visible');
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  close_result := public.delete_group_conversation(chat_id, close_request);
  perform pg_temp.check_true(close_result = jsonb_build_object('ok', true, 'conversation_id', chat_id, 'status', 'closed'),
    'force close result');
  perform pg_temp.check_true(close_result = public.delete_group_conversation(chat_id, close_request), 'force close retry');
  perform pg_temp.check_true(not exists (select 1 from public.conversations where id = chat_id), 'chat hidden from admin');
  perform set_config('request.jwt.claim.sub', moderator_id::text, true);
  perform pg_temp.check_true(not exists (select 1 from public.conversations where id = chat_id), 'chat hidden from member');
  perform set_config('request.jwt.claim.sub', member_id::text, true);
  perform pg_temp.check_true(not exists (select 1 from public.conversations where id = chat_id), 'chat hidden from second member');

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  insert into public.stories(author_id, caption) values (admin_id, 'Live story') returning id into live_story_id;
  insert into public.stories(author_id, caption, created_at, expires_at)
    values (admin_id, 'Expired story', now() - interval '25 hours', now() - interval '1 hour')
    returning id into expired_id;
  perform pg_temp.check_true((select expires_at - created_at = interval '24 hours' from public.stories where id = live_story_id),
    'story defaults to 24 hours');

  perform set_config('request.jwt.claim.sub', member_id::text, true);
  perform pg_temp.check_true(exists (select 1 from public.stories where id = live_story_id), 'live story is visible');
  perform pg_temp.check_true(not exists (select 1 from public.stories where id = expired_id), 'expired story is hidden');
  insert into public.story_views(story_id, viewer_id) values (live_story_id, member_id);
  perform pg_temp.expect_error(format('insert into public.story_views(story_id, viewer_id) values (%L, %L)', expired_id, member_id),
    '42501');

  perform set_config('request.jwt.claim.sub', banned_id::text, true);
  perform pg_temp.expect_error(format('insert into public.stories(author_id, caption) values (%L, %L)', banned_id, 'Banned'),
    '42501');
  perform pg_temp.expect_error(format('insert into public.story_views(story_id, viewer_id) values (%L, %L)', live_story_id, banned_id),
    '42501');
  perform pg_temp.expect_error('select public.create_social_group(''Banned'', '''', ''public'', ''open'', ''members'', ''accent-3'')',
    'user_banned');

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform pg_temp.check_true(exists (select 1 from public.story_views v where v.story_id = live_story_id
    and v.viewer_id = member_id), 'author can see view');
  private_group := (public.create_social_group('  Private community  ', '  About  ', 'private', 'approval', 'admins_only',
    'accent-3')->>'id')::uuid;
  open_group := (public.create_social_group('Open community', '', 'public', 'open', 'members', 'accent-1')->>'id')::uuid;
  perform set_config('test.deleted_social_group', private_group::text, true);

  insert into public.boxes(author_id, type, content, payload, status, group_id)
    values (admin_id, 'quick', 'SocialSearchFixture private', '{}', 'published', private_group) returning id into private_box;
  insert into public.boxes(author_id, type, content, payload, status, group_id)
    values (admin_id, 'quick', 'SocialSearchFixture public', '{}', 'published', open_group) returning id into open_box;
  insert into public.boxes(author_id, type, content, payload, status)
    values (admin_id, 'quick', 'SocialSearchFixture global', '{}', 'published') returning id into global_box;
  perform pg_temp.check_true((select count(*) = 1 and bool_and(b.id = global_box)
    from public.search_boxes('SocialSearchFixture') b where b.id in (private_box, open_box, global_box)), 'global search excludes both group boxes');
  perform pg_temp.expect_error(format('select public.pin_social_group_box(%L, %L)', private_group, open_box),
    'invalid_group_pinned_box');
  perform public.pin_social_group_box(private_group, private_box);
  perform pg_temp.check_true((select pinned_box_id = private_box from public.groups where id = private_group), 'same-group box pinned');

  perform set_config('request.jwt.claim.sub', moderator_id::text, true);
  perform pg_temp.check_true(public.join_or_request_social_group(open_group)->>'status' = 'joined', 'open join');
  perform pg_temp.check_true(public.join_or_request_social_group(open_group)->>'status' = 'already_member', 'open join retry');
  perform pg_temp.check_true(public.join_or_request_social_group(private_group, 'Please approve')->>'status' = 'requested',
    'approval join requests access');
  select id into strict request_id from public.group_join_requests where group_id = private_group and user_id = moderator_id;

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform pg_temp.check_true(public.respond_group_join_request(request_id, true)->>'status' = 'approved', 'admin approves');
  perform public.moderate_social_group_member(private_group, moderator_id, 'promote_moderator');
  perform pg_temp.expect_error(format('select public.leave_social_group(%L)', private_group), 'last_social_group_admin');

  perform set_config('request.jwt.claim.sub', member_id::text, true);
  perform pg_temp.check_true(exists (select 1 from public.groups where id = private_group), 'private group discoverable');
  perform pg_temp.check_true(not exists (select 1 from public.group_members where group_id = private_group), 'private roster hidden');
  perform pg_temp.check_true(not exists (select 1 from public.boxes where id = private_box), 'private box hidden');
  perform pg_temp.expect_error(format(
    'insert into public.boxes(author_id, type, content, status, group_id) values (%L, %L, %L, %L, %L)',
    member_id, 'quick', 'Unauthorized', 'published', private_group), '42501');
  perform public.join_or_request_social_group(private_group);
  perform public.cancel_group_join_request(private_group);
  perform pg_temp.check_true(exists (select 1 from public.group_join_requests
    where group_id = private_group and user_id = member_id and status = 'canceled'), 'request canceled');
  perform public.join_or_request_social_group(private_group, 'Retry');
  perform public.join_or_request_social_group(private_group, 'Updated');
  select id into strict request_id from public.group_join_requests
    where group_id = private_group and user_id = member_id and status = 'pending' and message = 'Updated';

  perform set_config('request.jwt.claim.sub', moderator_id::text, true);
  perform pg_temp.check_true(public.respond_group_join_request(request_id, true)->>'status' = 'approved', 'moderator approves');
  perform pg_temp.expect_error(format('select public.moderate_social_group_member(%L, %L, %L)',
    private_group, admin_id, 'demote_member'), 'group_admin_required');

  perform set_config('request.jwt.claim.sub', member_id::text, true);
  perform pg_temp.check_true(exists (select 1 from public.boxes where id = private_box), 'approved member sees private box');
  perform pg_temp.expect_error(format(
    'insert into public.boxes(author_id, type, content, status, group_id) values (%L, %L, %L, %L, %L)',
    member_id, 'quick', 'Members cannot post', 'published', private_group), '42501');
  insert into public.boxes(author_id, type, content, status)
    values (member_id, 'quick', 'Own ungrouped post', 'published') returning id into global_box;
  perform pg_temp.expect_error(format('update public.boxes set group_id = %L where id = %L', private_group, global_box), '42501');

  perform set_config('request.jwt.claim.sub', moderator_id::text, true);
  perform public.moderate_social_group_member(private_group, member_id, 'remove');
  perform pg_temp.check_true(not exists (select 1 from public.group_members where group_id = private_group and user_id = member_id),
    'moderator removes member');
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform public.invite_contact_to_social_group(private_group, member_id);
  perform public.moderate_social_group_member(private_group, member_id, 'ban');

  perform set_config('request.jwt.claim.sub', member_id::text, true);
  perform pg_temp.expect_error(format('select public.join_or_request_social_group(%L)', private_group), 'group_member_banned');

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform public.update_social_group_settings(private_group, 'Updated community', '', 'private', 'approval', 'members',
    'accent-2');
  perform pg_temp.check_true((select name = 'Updated community' and post_policy = 'members'
    from public.groups where id = private_group), 'admin updates settings');
  perform public.moderate_social_group_member(private_group, member_id, 'unban');
  perform set_config('request.jwt.claim.sub', member_id::text, true);
  insert into public.boxes(author_id, type, content, status, group_id)
    values (member_id, 'quick', 'Post to moderate', 'published', private_group) returning id into moderated_box;
  perform set_config('request.jwt.claim.sub', moderator_id::text, true);
  delete from public.boxes where id = moderated_box;
  perform pg_temp.check_true(found, 'moderator deletes a member box');

  perform set_config('request.jwt.claim.sub', outsider_id::text, true);
  perform public.join_or_request_social_group(private_group);
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform public.delete_social_group(private_group);
end;
$$;

reset role;

select pg_temp.check_true(exists (select 1 from public.conversations
  where id = current_setting('test.deleted_chat_id')::uuid and status = 'closed' and closed_at is not null),
  'chat stored as closed');
select pg_temp.check_true(not exists (select 1 from public.conversation_participants
  where conversation_id = current_setting('test.deleted_chat_id')::uuid and deleted_at is null),
  'all participants soft-deleted');
select pg_temp.check_true((select count(*) = 1 and bool_and(system_event_payload->>'deleted_by_admin' = 'true'
  and system_event_payload->>'actor_id' = (select id::text from social_fixtures where n = 1))
  from public.messages where conversation_id = current_setting('test.deleted_chat_id')::uuid
    and kind = 'system' and system_event_type = 'group_closed'), 'one authentic close event');
select pg_temp.check_true(not exists (select 1 from public.groups where id = current_setting('test.deleted_social_group')::uuid)
  and not exists (select 1 from public.group_members where group_id = current_setting('test.deleted_social_group')::uuid)
  and not exists (select 1 from public.group_join_requests where group_id = current_setting('test.deleted_social_group')::uuid)
  and not exists (select 1 from public.boxes where group_id = current_setting('test.deleted_social_group')::uuid),
  'group deletion cascades');

rollback;
