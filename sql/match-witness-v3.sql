-- Phase 2 follow-up after the 2026-09-25 tests (matches 7 and 8).
-- Applied 2026-09-25 (migration match_witness_v3).
--
-- A "last player standing" win (match 7) stayed 'pending' forever: the
-- other human had just left, so claim_game_win still saw them as present
-- (heartbeat under 90 s) and waited for a witness report, but nobody can
-- witness a win after leaving. Now a pending win is paid when it is looked
-- at again (retry_pending_wins) and:
--   * it is at least 60 s old,
--   * no other human is still in the room (heartbeat under 90 s), and
--   * no other player reported a different result (a dispute keeps it
--     pending for the hermit to look at).
-- The client calls retry_pending_wins() in the background after a game and
-- once at sign-in (js/gamification.js).

create or replace function public.retry_pending_wins()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid  uuid := auth.uid();
  v_row  record;
  v_paid integer := 0;
  v_xp   integer := 0;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  for v_row in
    select * from game_rewards
    where user_id = v_uid and status = 'pending' and claimed_at < now() - interval '60 seconds'
  loop
    -- Another human still in the room can still confirm (or dispute): wait.
    continue when exists (select 1 from players
                          where game_id = v_row.room_id and user_id is not null and user_id <> v_uid
                            and last_seen > now() - interval '90 seconds');
    continue when exists (select 1 from match_reports r
                          where r.room_id = v_row.room_id and r.reporter <> v_uid and not r.confirms);
    perform public._pay_game_win(v_row.room_id, v_uid, v_row.xp, coalesce(v_row.num_players, 2));
    v_paid := v_paid + 1;
    v_xp := v_xp + v_row.xp;
  end loop;
  return jsonb_build_object('paid', v_paid, 'xp', v_xp);
end;
$$;

revoke all on function public.retry_pending_wins() from public, anon;
grant execute on function public.retry_pending_wins() to authenticated;

-- Fingerprints for turn 1 are taken in the middle of the opening placement,
-- so browsers often differ there for a moment (seen in matches 5, 7 and 8).
-- They are still stored, but no longer counted as a desync.
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

  if v_new > 0 and p_turn > 1 and exists (select 1 from match_fingerprints f
                       where f.room_id = p_room_id and f.turn = p_turn
                         and f.reporter <> v_uid
                         and length(f.fingerprint) = length(v_fp)
                         and f.fingerprint <> v_fp) then
    update matches set desync_count = desync_count + 1
    where id = (select match_id from game_room where id = p_room_id);
  end if;

  if random() < 0.01 then
    delete from match_fingerprints where created_at < now() - interval '30 days';
    delete from match_reports where created_at < now() - interval '30 days';
  end if;
end;
$$;
revoke all on function public.report_fingerprint(integer, integer, text) from public, anon;
grant execute on function public.report_fingerprint(integer, integer, text) to authenticated;
