-- Lock player removal (remove_player / remove_players).
-- Applied 2026-09-24. Before this, anyone, even signed out, could remove any
-- player from any room.
--
-- A seat may be removed when ONE of these is true:
--   1. It is the caller's own seat (Leave, reload, back to lobby).
--   2. The caller is the room's host (bot removal, disconnect sweep, turn
--      timer kick / forfeit). Host = oldest non-bot seat, see
--      sql/lock-room-deletes.sql is_room_host().
--   3. The caller is the hermit.
--   4. The room is WAITING and the seat is dead: no heartbeat for 90s (or no
--      heartbeat at all and older than 30s). Matches the client's own
--      "active" window in joinRoomAsPlayer; clients heartbeat every 15s.
--   5. The room is FINISHED and the caller had a seat in it ("Return to
--      Lobby" on the game-over screen clears every seat).

create or replace function public.can_remove_player(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.players p
    left join public.game_room r on r.id = p.game_id
    where p.id = p_player_id
      and (
        (auth.uid() is not null and p.user_id = auth.uid())
        or public.is_room_host(p.game_id)
        or public.is_hermit()
        or (r.status = 'waiting' and (
              (p.last_seen is not null and p.last_seen < now() - interval '90 seconds')
           or (p.last_seen is null and p.created_at < now() - interval '30 seconds')))
        or (r.status = 'finished' and auth.uid() is not null and exists (
              select 1 from public.players me
              where me.game_id = p.game_id and me.user_id = auth.uid()))
      )
  );
$$;

create or replace function public.remove_player(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (select 1 from public.players where id = p_player_id) then
    return; -- already gone: nothing to do
  end if;
  if not public.can_remove_player(p_player_id) then
    raise exception 'not authorized';
  end if;
  delete from public.players where id = p_player_id;
end;
$$;

-- Batch version: removes the seats the caller may remove, skips the rest.
create or replace function public.remove_players(p_player_ids uuid[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  delete from public.players
  where id = any(p_player_ids)
    and public.can_remove_player(id);
end;
$$;
