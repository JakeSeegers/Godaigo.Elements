-- Room name is set in the waiting room now (2026-09-25, migration rename_room).
-- Only the room's host may rename it; 1-30 characters, trimmed.
create or replace function public.rename_room(p_room_id integer, p_name text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_name text := left(btrim(coalesce(p_name, '')), 30);
begin
  if not (public.is_room_host(p_room_id) or public.is_hermit()) then raise exception 'not authorized'; end if;
  if v_name = '' then raise exception 'empty name'; end if;
  update game_room set host_name = v_name, updated_at = now()
  where id = p_room_id and status = 'waiting';
  return v_name;
end;
$$;
revoke all on function public.rename_room(integer, text) from public, anon;
grant execute on function public.rename_room(integer, text) to authenticated;
