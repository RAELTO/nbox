-- Keep the privileged implementation outside exposed API schemas. The public
-- RPC remains SECURITY INVOKER, while the private implementation performs the
-- fully validated atomic write as its owner.

alter function public.create_voice_message(
  uuid, uuid, uuid, text, text, bigint, integer
) set schema private;

alter function private.create_voice_message(
  uuid, uuid, uuid, text, text, bigint, integer
) rename to create_voice_message_internal;

revoke all on function private.create_voice_message_internal(
  uuid, uuid, uuid, text, text, bigint, integer
) from public, anon;
grant execute on function private.create_voice_message_internal(
  uuid, uuid, uuid, text, text, bigint, integer
) to authenticated;

create function public.create_voice_message(
  p_message_id uuid,
  p_attachment_id uuid,
  p_conversation_id uuid,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_duration_ms integer
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.create_voice_message_internal(
    p_message_id,
    p_attachment_id,
    p_conversation_id,
    p_storage_path,
    p_mime_type,
    p_size_bytes,
    p_duration_ms
  );
$$;

revoke execute on function public.create_voice_message(
  uuid, uuid, uuid, text, text, bigint, integer
) from public, anon;
grant execute on function public.create_voice_message(
  uuid, uuid, uuid, text, text, bigint, integer
) to authenticated;
