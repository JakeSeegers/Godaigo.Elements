-- Lock room deletion to the room's host (or the hermit).
-- Applied 2026-09-24. Before this, delete_game_room and clear_room_players
-- ran for anyone, signed in or not, on any room id.
--
-- "Host" matches the client rule (js/lobby.js determineHostRow): the oldest
-- non-bot seat in the room. Bot seats use the '🤖' username prefix
-- (js/bot-driver.js) and have no user_id.
--
-- Client side, leaveRoom() deletes the room before removing the host's own
-- seat, and the page-unload cleanup sends the user's access token, so the
-- host still passes this check on Leave and on reload/close.

create or replace function public.is_room_host(p_room_id integer)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((
    select p.user_id = auth.uid()
    from public.players p
    where p.game_id = p_room_id
      and p.username not like '🤖%'
    order by p.created_at asc
    limit 1
  ), false);
$$;

create or replace function public.delete_game_room(p_room_id integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not (public.is_room_host(p_room_id) or public.is_hermit()) then
    raise exception 'not authorized';
  end if;
  delete from public.players where game_id = p_room_id;
  delete from public.game_room where id = p_room_id;
end;
$$;

create or replace function public.clear_room_players(p_room_id integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not (public.is_room_host(p_room_id) or public.is_hermit()) then
    raise exception 'not authorized';
  end if;
  delete from public.players where game_id = p_room_id;
end;
$$;
