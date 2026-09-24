-- Replay verification (anti-cheat plan part 2): the hermit's browser replays
-- finished matches and compares the replay's board with the fingerprints the
-- players' browsers reported during the real game (match_fingerprints), and
-- checks the recorded winner on the replayed board. Results are stored on
-- the match. Client: "Check" tab in the Replays window (js/replay-viewer.js).
-- Applied 2026-09-24 (migration match_check). All functions hermit-only.

alter table public.matches add column if not exists check_status text
  check (check_status in ('ok', 'mismatch', 'no_data', 'error'));
alter table public.matches add column if not exists check_detail jsonb;
alter table public.matches add column if not exists checked_at timestamptz;

-- Recent finished matches with their check state, newest first.
create or replace function public.list_matches_for_check(p_limit integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_hermit() then raise exception 'not authorized'; end if;
  return coalesce((
    select jsonb_agg(public._match_summary(m) || jsonb_build_object(
             'room_id', m.room_id, 'desync_count', m.desync_count, 'disputed', m.disputed,
             'check_status', m.check_status, 'check_detail', m.check_detail, 'checked_at', m.checked_at)
           order by m.started_at desc)
    from (select * from matches where status in ('finished', 'abandoned')
          order by started_at desc
          limit least(greatest(coalesce(p_limit, 30), 1), 100)) m
  ), '[]'::jsonb);
end;
$$;

-- Every fingerprint reported during this match: [{seat, turn, fp}].
create or replace function public.get_match_fingerprints(p_match_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_m matches;
begin
  if not public.is_hermit() then raise exception 'not authorized'; end if;
  select * into v_m from matches where id = p_match_id;
  if not found then raise exception 'no such match'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('seat', f.seat, 'turn', f.turn, 'fp', f.fingerprint)
                     order by f.turn, f.seat)
    from match_fingerprints f
    where f.room_id = v_m.room_id
      and f.created_at between v_m.started_at - interval '1 minute'
                           and coalesce(v_m.ended_at, v_m.last_move_at) + interval '5 minutes'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.save_match_check(p_match_id bigint, p_status text, p_detail jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_hermit() then raise exception 'not authorized'; end if;
  update matches set check_status = p_status, check_detail = p_detail, checked_at = now()
  where id = p_match_id;
end;
$$;

revoke all on function public.list_matches_for_check(integer) from public, anon;
revoke all on function public.get_match_fingerprints(bigint) from public, anon;
revoke all on function public.save_match_check(bigint, text, jsonb) from public, anon;
grant execute on function public.list_matches_for_check(integer) to authenticated;
grant execute on function public.get_match_fingerprints(bigint) to authenticated;
grant execute on function public.save_match_check(bigint, text, jsonb) to authenticated;
