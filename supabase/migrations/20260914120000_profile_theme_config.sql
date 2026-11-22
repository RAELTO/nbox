create function private.valid_theme_config(p_config jsonb)
returns boolean language plpgsql immutable set search_path = ''
as $$
declare
  pal_key text;
  pal_val jsonb;
  slot_key text;
  slot_val jsonb;
begin
  if p_config is null or jsonb_typeof(p_config) is distinct from 'object'
    or octet_length(p_config::text) > 4096 then
    return false;
  end if;

  if exists (
    select 1 from jsonb_object_keys(p_config) as k(key)
    where k.key not in ('version', 'palette', 'mode', 'shadow', 'overrides')
  )
    or (p_config->'version') is distinct from '1'::jsonb
    or jsonb_typeof(p_config->'palette') is distinct from 'string'
    or p_config->>'palette' not in ('coral', 'electric', 'lime', 'dusk', 'dark', 'custom')
    or jsonb_typeof(p_config->'mode') is distinct from 'string'
    or p_config->>'mode' not in ('light', 'dark')
    or jsonb_typeof(p_config->'shadow') is distinct from 'string'
    or p_config->>'shadow' not in ('low', 'medium', 'high') then
    return false;
  end if;

  if p_config ? 'overrides' then
    if jsonb_typeof(p_config->'overrides') is distinct from 'object' then return false; end if;
    for pal_key, pal_val in select key, value from jsonb_each(p_config->'overrides') loop
      if pal_key not in ('coral', 'electric', 'lime', 'dusk', 'dark', 'custom')
        or jsonb_typeof(pal_val) is distinct from 'object' then
        return false;
      end if;

      for slot_key, slot_val in select key, value from jsonb_each(pal_val) loop
        if slot_key not in ('bg', 'bg_alt', 'bg_panel', 'ink', 'line', 'shadow_color',
          'accent_1', 'accent_2', 'accent_3', 'accent_4', 'accent_5')
          or jsonb_typeof(slot_val) is distinct from 'string'
          or (slot_val #>> '{}') !~ '^#[0-9a-f]{6}$' then
          return false;
        end if;
      end loop;
    end loop;
  end if;

  return true;
end;
$$;

revoke all on function private.valid_theme_config(jsonb) from public, anon;
grant execute on function private.valid_theme_config(jsonb) to authenticated, service_role;

alter table public.profiles
  add column theme_config jsonb default null
    constraint profiles_theme_config_check check (theme_config is null or private.valid_theme_config(theme_config));

create function private.guard_profile_theme_update()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and current_user = 'authenticated'
    and new.theme_config is distinct from old.theme_config then
    if public.is_banned() then
      raise exception 'user_banned' using errcode = '42501';
    end if;
    -- The existing admin policy also grants UPDATE for moderation.
    if old.id is distinct from (select auth.uid()) or new.id is distinct from old.id then
      raise exception 'profile_theme_owner_required' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_profile_theme_update() from public, anon, authenticated, service_role;
create trigger guard_profile_theme_update
before update on public.profiles
for each row execute function private.guard_profile_theme_update();

create function private.update_my_theme_config_internal(p_theme_config jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null then raise exception 'authentication_required'; end if;
  if public.is_banned() then raise exception 'user_banned' using errcode = '42501'; end if;
  if p_theme_config is not null and not private.valid_theme_config(p_theme_config) then
    raise exception 'invalid_theme_config';
  end if;

  update public.profiles set theme_config = p_theme_config where id = actor;
  if not found then raise exception 'profile_not_found'; end if;

  return jsonb_build_object('ok', true, 'theme_config', p_theme_config);
end;
$$;

create function public.update_my_theme_config(p_theme_config jsonb)
returns jsonb language sql security invoker set search_path = ''
as $$
  select private.update_my_theme_config_internal(p_theme_config);
$$;

revoke all on function private.update_my_theme_config_internal(jsonb) from public, anon, service_role;
revoke all on function public.update_my_theme_config(jsonb) from public, anon, service_role;
grant execute on function private.update_my_theme_config_internal(jsonb) to authenticated;
grant execute on function public.update_my_theme_config(jsonb) to authenticated;
