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

create temp table group_fixtures(n integer primary key,id uuid);
insert into group_fixtures select n,gen_random_uuid() from generate_series(1,53) n;
grant select on group_fixtures to authenticated;
insert into auth.users(id,email,raw_user_meta_data)
select id,'group-' || id || '@example.invalid',
  jsonb_build_object('username','test_' || left(replace(id::text,'-',''),20),'display_name','Group fixture')
from group_fixtures;

insert into public.contacts(user_a,user_b)
select least(a.id,b.id),greatest(a.id,b.id)
from group_fixtures a cross join group_fixtures b where a.n = 1 and b.n between 2 and 51;
update public.profiles set is_banned = true where id = (select id from group_fixtures where n = 53);
insert into public.boxes(id,author_id,type,content,payload,status)
select id,id,'quick','Group verification fixture','{}','published' from group_fixtures where n in (1,2);
insert into public.notifications(id,recipient_id,actor_id,kind,source_table)
select a.id,a.id,b.id,'follow','follows' from group_fixtures a cross join group_fixtures b where a.n = 1 and b.n = 2;

set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from group_fixtures where n = 1),true);

-- US1: creation, safe inbox/list, immutable history, and direct-chat compatibility.
do $$
declare
  actor uuid := (select id from group_fixtures where n = 1);
  member_a uuid := (select id from group_fixtures where n = 2);
  member_b uuid := (select id from group_fixtures where n = 3);
  outsider uuid := (select id from group_fixtures where n = 52);
  request_id uuid := gen_random_uuid();
  group_id uuid;
  direct_id uuid;
  text_id uuid;
  text_request uuid := gen_random_uuid();
begin
  perform pg_temp.expect_error(format('select public.create_group_conversation(%L,%L::uuid[],gen_random_uuid())',
    '   ',array[member_a,member_b]),'invalid_group_name');
  perform pg_temp.expect_error(format('select public.create_group_conversation(%L,%L::uuid[],gen_random_uuid())',
    'Private group',array[member_a,outsider]),'accepted_contact_required');
  group_id := public.create_group_conversation('  Private group ',array[actor,member_a,member_b,member_b],request_id);
  perform set_config('test.group_id',group_id::text,true);
  perform pg_temp.check_true(group_id = public.create_group_conversation('Private group',array[member_a,member_b],request_id),'create retry');
  perform pg_temp.check_true((public.get_inbox_conversations()->'items'->0->>'name') = 'Private group','group inbox');
  perform pg_temp.check_true(jsonb_array_length(public.get_group_members(group_id)) = 3,'deduplicated roster');
  perform pg_temp.check_true(not (public.get_group_members(group_id)->0 ?| array['voice_notes_mode','last_read_at','archived_at']),'private participant fields omitted');
  perform pg_temp.check_true((select count(*) = 1 from public.conversation_participants where conversation_id = group_id),'only own participant');
  perform pg_temp.expect_error(format('update public.conversation_participants set role = %L where conversation_id = %L','member',group_id),'42501');
  perform pg_temp.expect_error(format('insert into public.messages(conversation_id,sender_id,body) values (%L,%L,%L)',group_id,actor,'Bypass'),'42501');
  update public.messages set body = 'Forged' where conversation_id = group_id and kind = 'system';
  perform pg_temp.check_true(not found,'system event cannot be edited');
  delete from public.messages where conversation_id = group_id and kind = 'system';
  perform pg_temp.check_true(not found,'system event cannot be deleted');
  text_id := public.publish_group_text_message(group_id,'Before rejoin',text_request);
  perform pg_temp.check_true(text_id = public.publish_group_text_message(group_id,'Before rejoin',text_request),'text retry');
  perform set_config('test.prejoin_id',text_id::text,true);
  insert into public.conversations(user_a,user_b) values (least(actor,member_a),greatest(actor,member_a)) returning id into direct_id;
  perform pg_temp.check_true((select count(*) = 1 from public.conversation_participants where conversation_id = direct_id),'direct participant seeded');
  insert into public.messages(conversation_id,sender_id,body) values (direct_id,actor,'Direct text');
  perform pg_temp.check_true(public.get_voice_note_permission(direct_id) = '{"allowed":true,"reason":"allowed"}'::jsonb,'direct permission shape');
end;
$$;

-- US2: real changes increment the policy exactly once and stale uploads fail.
do $$
declare
  group_id uuid := current_setting('test.group_id')::uuid;
  request_id uuid := gen_random_uuid();
  statement text := format(
    'select public.publish_group_voice_message(gen_random_uuid(),gen_random_uuid(),%L,%L,%L,1,1,gen_random_uuid(),1)',
    group_id,'invalid','audio/webm');
begin
  perform public.set_group_voice_publication(group_id,false,request_id);
  perform pg_temp.expect_error(statement,'group_voice_disabled');
  perform public.set_group_voice_publication(group_id,true,gen_random_uuid());
  perform public.set_group_voice_publication(group_id,false,request_id);
  perform pg_temp.check_true((public.get_group_voice_state(group_id)->>'voice_policy_version')::integer = 3,'idempotent policy change');
  perform pg_temp.expect_error(statement,'stale_group_policy');
  perform pg_temp.expect_error(replace(statement,'(),1)','(),3)'),'voice_attachment_forbidden');
end;
$$;

-- Exercise the upload policy with an owned Storage metadata row.
select set_config('test.voice_id',gen_random_uuid()::text,true),
       set_config('test.attachment_id',gen_random_uuid()::text,true);
select set_config('test.voice_path',concat_ws('/',current_setting('test.group_id'),(select id from group_fixtures where n = 1),
  current_setting('test.voice_id'),current_setting('test.attachment_id') || '.webm'),true);
insert into storage.objects(bucket_id,name,owner_id,metadata)
values ('chat-media',current_setting('test.voice_path'),(select id::text from group_fixtures where n = 1),'{"size":1,"mimetype":"audio/webm"}');
select public.publish_group_voice_message(current_setting('test.voice_id')::uuid,current_setting('test.attachment_id')::uuid,
  current_setting('test.group_id')::uuid,current_setting('test.voice_path'),'audio/webm',1,1,gen_random_uuid(),3);

-- US3: reception is private and leaves the voice shell visible.
select set_config('request.jwt.claim.sub',(select id::text from group_fixtures where n = 2),true);
do $$
declare
  group_id uuid := current_setting('test.group_id')::uuid;
  voice_id uuid := current_setting('test.voice_id')::uuid;
begin
  perform pg_temp.check_true(exists(select 1 from public.message_attachments where message_id = voice_id),'allowed attachment');
  perform pg_temp.check_true(exists(select 1 from storage.objects where name = current_setting('test.voice_path')),'allowed storage object');
  perform public.set_group_voice_reception(group_id,'block');
  perform pg_temp.check_true(exists(select 1 from public.messages where id = voice_id),'blocked member can see shell');
  perform pg_temp.check_true(not exists(select 1 from public.message_attachments where message_id = voice_id),'blocked attachment');
  perform pg_temp.check_true(not exists(select 1 from storage.objects where name = current_setting('test.voice_path')),'blocked storage object');
  perform pg_temp.check_true((public.get_group_voice_state(group_id)->>'effective_can_publish')::boolean,'independent publication');
  perform pg_temp.expect_error(format('select public.set_group_voice_publication(%L,false,gen_random_uuid())',group_id),'group_admin_required');
  perform public.leave_group(group_id,gen_random_uuid());
  perform pg_temp.check_true(not exists(select 1 from public.conversations where id = group_id),'former member cannot see group');
  perform pg_temp.check_true(not exists(select 1 from public.messages where conversation_id = group_id),'former member cannot see messages');
end;
$$;

-- US4: grant/revoke roles, a fresh history boundary, and a terminal close.
select set_config('request.jwt.claim.sub',(select id::text from group_fixtures where n = 1),true);
do $$
declare
  group_id uuid := current_setting('test.group_id')::uuid;
  member_a uuid := (select id from group_fixtures where n = 2);
begin
  perform pg_temp.expect_error(format('select public.leave_group(%L,gen_random_uuid())',group_id),'last_group_admin');
  perform pg_temp.expect_error(format('select public.close_group_conversation(%L,gen_random_uuid())',group_id),'group_other_members_exist');
  perform public.add_group_member(group_id,member_a,gen_random_uuid());
  perform public.set_group_member_role(group_id,member_a,'admin',gen_random_uuid());
  perform public.set_group_member_role(group_id,member_a,'member',gen_random_uuid());
  perform public.rename_group_conversation(group_id,'Renamed',gen_random_uuid());
end;
$$;

select set_config('request.jwt.claim.sub',(select id::text from group_fixtures where n = 2),true);
select pg_temp.check_true((public.get_group_voice_state(current_setting('test.group_id')::uuid)->>'personal_mode') = 'inherit','rejoin resets reception');
select pg_temp.check_true(not exists(select 1 from public.messages where id = current_setting('test.prejoin_id')::uuid),'rejoin hides old text');
select pg_temp.check_true(not exists(select 1 from storage.objects where name = current_setting('test.voice_path')),'rejoin hides old voice object');
select pg_temp.check_true(exists(select 1 from jsonb_array_elements(public.get_inbox_conversations()->'items') item
  where item->>'id' = current_setting('test.group_id') and item->>'last_system_event_type' = 'group_renamed'),'rejoin inbox uses visible event');

select set_config('request.jwt.claim.sub',(select id::text from group_fixtures where n = 52),true);
select pg_temp.check_true(not exists(select 1 from public.messages where conversation_id = current_setting('test.group_id')::uuid),'unrelated caller cannot see group');
select pg_temp.expect_error(format('select public.get_group_members(%L)',current_setting('test.group_id')),'not_group_member');

select set_config('request.jwt.claim.sub',(select id::text from group_fixtures where n = 1),true);
do $$
declare
  actor uuid := (select auth.uid());
  group_id uuid := current_setting('test.group_id')::uuid;
  member_a uuid := (select id from group_fixtures where n = 2);
  member_b uuid := (select id from group_fixtures where n = 3);
  extra_member uuid := (select id from group_fixtures where n = 51);
  full_group uuid;
  request_id uuid := gen_random_uuid();
begin
  full_group := public.create_group_conversation('At capacity',array(select id from group_fixtures where n between 2 and 50),gen_random_uuid());
  perform pg_temp.check_true(jsonb_array_length(public.get_group_members(full_group)) = 50,'50 members allowed');
  perform pg_temp.expect_error(format('select public.add_group_member(%L,%L,gen_random_uuid())',full_group,extra_member),'group_member_limit');
  perform public.remove_group_member(group_id,member_a,gen_random_uuid());
  perform public.remove_group_member(group_id,member_b,gen_random_uuid());
  perform pg_temp.expect_error(format('select public.leave_group(%L,gen_random_uuid())',group_id),'last_group_admin');
  perform public.close_group_conversation(group_id,request_id);
  perform public.close_group_conversation(group_id,request_id);
  perform pg_temp.check_true(not exists(select 1 from public.conversations where id = group_id),'closed group invisible');
  perform pg_temp.expect_error(format('select public.publish_group_text_message(%L,%L,gen_random_uuid())',group_id,'Closed'),'group_closed');
  perform pg_temp.expect_error(format('insert into public.notifications(recipient_id,actor_id,kind,source_table) values (%L,%L,%L,%L)',
    actor,member_a,'follow','follows'),'42501');
  perform pg_temp.expect_error(format('update public.notifications set metadata = %L where id = %L','{"spoofed":true}',actor),'42501');
  update public.notifications set read_at = now() where id = actor;
  perform pg_temp.check_true(found,'recipient can mark notification read');
  perform pg_temp.expect_error(format('update public.profiles set pinned_box_id = %L where id = %L',member_a,actor),'pinned_box_forbidden');
  perform pg_temp.expect_error(format('update public.profiles set role = %L where id = %L','admin',actor),'42501');
  update public.profiles set pinned_box_id = actor where id = actor;
  perform pg_temp.check_true(found,'owner can pin a published box');
end;
$$;

select set_config('request.jwt.claim.sub',(select id::text from group_fixtures where n = 53),true);
select pg_temp.expect_error('select public.create_group_conversation(''Banned'',array[]::uuid[],gen_random_uuid())','user_banned');

reset role;
rollback;
