-- Phase 2 follow-up, after the second real 2-player test (match 5, room 825).
-- Applied 2026-09-24 (migration match_witness_v2).
--
-- Two problems that test showed:
--
-- 1. A witness report was thrown away. The winner pressed "Return to Lobby"
--    about 1 second after the win, which removes EVERY player row of the room.
--    The other player's report came 2.5 seconds later, found no player row,
--    and was silently ignored, so the win stayed 'pending'. Now a reporter
--    who is no longer in `players` is matched by the recorded match instead
--    (matches.players snapshot, same room, started in the last 6 hours).
--
-- 2. False "out of sync" alarms. One browser still ran the old
--    match-witness.js (16-character fingerprint, one hash) while the other
--    ran the new one (32 characters, 4 parts), so every turn "differed".
--    Fingerprints of a different length are a different format and are no
--    longer compared.

-- Which seat is the caller in this room? Live player row first, then the
-- recorded match (for a report that lands after the room was cleaned up).
create or replace function public._witness_seat(p_room_id integer)
returns table (seat integer, match_id bigint)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid  uuid := auth.uid();
  v_seat integer;
  v_m    matches;
begin
  if v_uid is null then return; end if;
  select player_index into v_seat from players where game_id = p_room_id and user_id = v_uid limit 1;
  if found then
    return query select v_seat, (select g.match_id from game_room g where g.id = p_room_id);
    return;
  end if;
  select * into v_m from matches m
  where m.room_id = p_room_id
    and m.started_at > now() - interval '6 hours'
    and m.players @> jsonb_build_array(jsonb_build_object('user_id', v_uid::text))
  order by m.started_at desc
  limit 1;
  if not found then return; end if;
  return query
    select (p->>'index')::integer, v_m.id
    from jsonb_array_elements(v_m.players) p
    where p->>'user_id' = v_uid::text
    limit 1;
end;
$$;
revoke all on function public._witness_seat(integer) from public, anon, authenticated;

create or replace function public.report_game_result(
  p_room_id integer, p_winner_index integer, p_confirms boolean,
  p_activated jsonb, p_at_shrine boolean, p_fingerprint text
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid     uuid := auth.uid();
  v_seat    record;
  v_pending record;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into v_seat from public._witness_seat(p_room_id);
  if not found then return; end if; -- only players of this game can witness

  insert into match_reports (room_id, reporter, seat, winner_index, confirms, activated, at_shrine, fingerprint)
  values (p_room_id, v_uid, v_seat.seat, p_winner_index, coalesce(p_confirms, false),
          p_activated, p_at_shrine, left(p_fingerprint, 64))
  on conflict (room_id, reporter) do update
    set winner_index = excluded.winner_index, confirms = excluded.confirms,
        activated = excluded.activated, at_shrine = excluded.at_shrine,
        fingerprint = excluded.fingerprint, created_at = now();

  -- A witness (not the winner) disagreeing: flag the match for review.
  if not coalesce(p_confirms, false) and v_seat.seat is distinct from p_winner_index then
    update matches set disputed = true where id = v_seat.match_id;
  end if;

  -- A confirmation from someone other than the winner pays a waiting claim.
  if coalesce(p_confirms, false) and v_seat.seat is distinct from p_winner_index then
    for v_pending in
      select g.* from game_rewards g
      where g.room_id = p_room_id and g.status = 'pending' and g.user_id <> v_uid
    loop
      perform public._pay_game_win(p_room_id, v_pending.user_id, v_pending.xp,
                                   coalesce(v_pending.num_players, 2));
    end loop;
  end if;
end;
$$;

create or replace function public.report_fingerprint(p_room_id integer, p_turn integer, p_fingerprint text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid  uuid := auth.uid();
  v_seat record;
  v_fp   text := left(p_fingerprint, 64);
  v_new  integer;
begin
  if v_uid is null or p_turn is null or p_fingerprint is null then return; end if;
  select * into v_seat from players where game_id = p_room_id and user_id = v_uid limit 1;
  if not found then return; end if;

  insert into match_fingerprints (room_id, turn, reporter, seat, fingerprint)
  values (p_room_id, p_turn, v_uid, v_seat.player_index, v_fp)
  on conflict do nothing;
  get diagnostics v_new = row_count;

  -- Only compare fingerprints of the same format (same length).
  if v_new > 0 and exists (select 1 from match_fingerprints f
                       where f.room_id = p_room_id and f.turn = p_turn
                         and f.reporter <> v_uid
                         and length(f.fingerprint) = length(v_fp)
                         and f.fingerprint <> v_fp) then
    update matches set desync_count = desync_count + 1
    where id = (select match_id from game_room where id = p_room_id);
  end if;

  -- Housekeeping: fingerprints are only useful for recent games.
  if random() < 0.01 then
    delete from match_fingerprints where created_at < now() - interval '30 days';
    delete from match_reports where created_at < now() - interval '30 days';
  end if;
end;
$$;

revoke all on function public.report_game_result(integer, integer, boolean, jsonb, boolean, text) from public, anon;
revoke all on function public.report_fingerprint(integer, integer, text) from public, anon;
grant execute on function public.report_game_result(integer, integer, boolean, jsonb, boolean, text) to authenticated;
grant execute on function public.report_fingerprint(integer, integer, text) to authenticated;

-- (Match 5's desync_count was reset to 0 by hand: it was flagged only
-- because of the format mix-up above.)
