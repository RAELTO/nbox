begin;

create temp table theme_checks(description text primary key);
grant insert on theme_checks to authenticated;

create function pg_temp.check_true(p_value boolean, p_description text)
returns void language plpgsql as $$
begin
  if p_value is distinct from true then raise exception 'Failed: %', p_description; end if;
  insert into theme_checks values (p_description);
end;
$$;

create function pg_temp.expect_error(p_sql text, p_state text, p_description text, p_message text default null)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    perform pg_temp.check_true(
      sqlstate = p_state and (p_message is null or sqlerrm = p_message),
      format('%s (received %s %s)', p_description, sqlstate, sqlerrm)
    );
    return;
  end;
  raise exception 'Expected an error: %', p_description;
end;
$$;

create temp table theme_fixtures(n integer primary key, id uuid not null);
insert into theme_fixtures select n, gen_random_uuid() from generate_series(1, 4) n;
grant select on theme_fixtures to authenticated;

insert into auth.users(id, email, raw_user_meta_data)
select id, 'theme-' || id || '@example.invalid',
  jsonb_build_object('username', 'test_' || left(replace(id::text, '-', ''), 20), 'display_name', 'Theme fixture')
from theme_fixtures;
update public.profiles set is_banned = true where id = (select id from theme_fixtures where n = 3);
update public.profiles set role = 'admin' where id = (select id from theme_fixtures where n = 4);

select pg_temp.check_true(
  not has_function_privilege('anon', 'public.update_my_theme_config(jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'private.update_my_theme_config_internal(jsonb)', 'EXECUTE'),
  'anonymous role cannot execute the RPC or internal function'
);
select pg_temp.check_true(
  not has_function_privilege('service_role', 'public.update_my_theme_config(jsonb)', 'EXECUTE')
  and not has_function_privilege('service_role', 'private.update_my_theme_config_internal(jsonb)', 'EXECUTE'),
  'service role cannot execute the RPC or internal function'
);

set local role authenticated;

do $$
declare
  user_a uuid := (select id from theme_fixtures where n = 1);
  user_b uuid := (select id from theme_fixtures where n = 2);
  banned_id uuid := (select id from theme_fixtures where n = 3);
  admin_id uuid := (select id from theme_fixtures where n = 4);
  base_config jsonb := '{"version":1,"palette":"custom","mode":"dark","shadow":"high"}';
  valid_config jsonb := base_config || '{"overrides":{"custom":{"bg":"#121316","accent_1":"#56c4e8"}}}'::jsonb;
  invalid record;
  rows_changed integer;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform pg_temp.expect_error('select public.update_my_theme_config(null)', 'P0001',
    'RPC requires an authenticated actor', 'authentication_required');

  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  perform pg_temp.expect_error('select public.update_my_theme_config(null)', 'P0001',
    'RPC requires an existing profile', 'profile_not_found');

  perform set_config('request.jwt.claim.sub', user_a::text, true);
  perform pg_temp.check_true(public.update_my_theme_config(valid_config) =
    jsonb_build_object('ok', true, 'theme_config', valid_config), 'RPC returns the saved theme');
  perform pg_temp.check_true((select theme_config = valid_config from public.profiles where id = user_a),
    'saved custom dark theme is readable');
  perform pg_temp.check_true(public.update_my_theme_config(null) = '{"ok":true,"theme_config":null}'::jsonb,
    'RPC returns a successful reset');
  perform pg_temp.check_true((select theme_config is null from public.profiles where id = user_a),
    'reset clears the stored theme');

  for invalid in
    select label, base_config || jsonb_build_object('overrides',
      jsonb_build_object('custom', jsonb_build_object('accent_1', color))) as config
    from (values
      ('CSS declaration', '#111111; background: url(https://evil.test)'),
      ('JavaScript URL', 'url(javascript:alert(1))'),
      ('style markup', '<style>body{}</style>'),
      ('short uppercase hex', '#FFF'),
      ('short lowercase hex', '#fff'),
      ('uppercase hex', '#ABCDEF'),
      ('alpha hex', '#11223344'),
      ('RGB function', 'rgb(1,2,3)'),
      ('trailing newline', E'#111111\n'),
      ('oversized UTF-8 JSON', repeat('é', 2100))
    ) as colors(label, color)
    union all
    select label, config from (values
      ('unknown top-level key', base_config || '{"role":"admin"}'::jsonb),
      ('unknown palette override key', base_config || '{"overrides":{"neon":{}}}'::jsonb),
      ('unknown color slot', base_config || '{"overrides":{"custom":{"--evil":"#111111"}}}'::jsonb),
      ('prototype key', base_config || '{"overrides":{"custom":{"__proto__":"#111111"}}}'::jsonb),
      ('missing required key', base_config - 'mode'),
      ('string version', base_config || '{"version":"1"}'::jsonb),
      ('invalid palette', base_config || '{"palette":"neon"}'::jsonb),
      ('invalid mode', base_config || '{"mode":"auto"}'::jsonb),
      ('invalid shadow', base_config || '{"shadow":1}'::jsonb),
      ('null overrides', base_config || '{"overrides":null}'::jsonb),
      ('non-object palette override', base_config || '{"overrides":{"custom":[]}}'::jsonb),
      ('non-string color', base_config || '{"overrides":{"custom":{"bg":111111}}}'::jsonb),
      ('non-object theme', '[]'::jsonb),
      ('JSON null theme', 'null'::jsonb)
    ) as configs(label, config)
  loop
    perform pg_temp.expect_error(format('select public.update_my_theme_config(%L)', invalid.config),
      'P0001', 'RPC rejects ' || invalid.label, 'invalid_theme_config');
    perform pg_temp.expect_error(format('update public.profiles set theme_config = %L where id = %L',
      invalid.config, user_a), '23514', 'profile constraint rejects ' || invalid.label);
  end loop;

  update public.profiles set theme_config = valid_config where id = user_a;
  perform pg_temp.check_true((select theme_config = valid_config from public.profiles where id = user_a),
    'the owner can directly update a valid theme');

  update public.profiles set theme_config = valid_config where id = user_b;
  get diagnostics rows_changed = row_count;
  perform pg_temp.check_true(rows_changed = 0, 'RLS prevents cross-user theme updates');

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform pg_temp.expect_error(format('update public.profiles set theme_config = %L where id = %L',
    valid_config, user_b), '42501', 'moderation permissions cannot change another user theme', 'profile_theme_owner_required');
  perform pg_temp.check_true((select theme_config is null from public.profiles where id = user_b),
    'the other user theme is unchanged');

  perform set_config('request.jwt.claim.sub', banned_id::text, true);
  perform pg_temp.expect_error(format('select public.update_my_theme_config(%L)', valid_config), '42501',
    'RPC rejects banned users', 'user_banned');
  perform pg_temp.expect_error(format('update public.profiles set theme_config = %L where id = %L',
    valid_config, banned_id), '42501', 'direct update rejects banned users', 'user_banned');
  perform pg_temp.check_true((select theme_config is null from public.profiles where id = banned_id),
    'the banned user theme is unchanged');
end;
$$;

reset role;
select count(*) as passed_assertions from theme_checks;

rollback;
