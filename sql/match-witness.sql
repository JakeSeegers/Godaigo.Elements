-- Phase 2: board fingerprints + win witnesses.
-- Applied 2026-09-24 (migration match_witness).
--
-- Each human player's browser (js/match-witness.js):
--   * reports a board fingerprint (hash of PUBLIC state: tiles, stones, pawns,
--     activated elements) the moment each turn passes -> match_fingerprints.
--     Browsers that disagree bump matches.desync_count (for review, never
--     blocks anything).
--   * at game over, checks the winner against its OWN board (5 elements
--     activated + on own shrine) and reports -> match_reports.
--
-- claim_game_win now needs a witness: if other humans are still in the room
-- (heartbeat < 90 s), the win pays only once one of them confirms it. If the
-- confirmation has not arrived yet, the claim is stored as 'pending' and
-- report_game_result pays it when the confirmation lands (so the winner can
-- leave the page). Bot-only games and games where every other human left keep
-- the Phase 0 rules (once per game, 4 per hour, server-set XP).

create table if not exists public.match_reports (
  room_id      integer not null,
  reporter     uuid    not null,
  seat         integer,
  winner_index integer,
  confirms     boolean not null,
  activated    jsonb,
  at_shrine    boolean,
  fingerprint  text,
  created_at   timestamptz not null default now(),
  primary key (room_id, reporter)
);
alter table public.match_reports enable row level security;

create table if not exists public.match_fingerprints (
  room_id     integer not null,
  turn        integer not null,
  reporter    uuid    not null,
  seat        integer,
  fingerprint text    not null,
  created_at  timestamptz not null default now(),
  primary key (room_id, turn, reporter)
);
alter table public.match_fingerprints enable row level security;
create index if not exists match_fingerprints_created_idx on public.match_fingerprints (created_at);

alter table public.matches add column if not exists desync_count integer not null default 0;
alter table public.matches add column if not exists disputed boolean not null default false;

alter table public.game_rewards add column if not exists status text not null default 'paid';
alter table public.game_rewards add column if not exists num_players integer;

-- Internal: pay a win (XP + badge activities). Not callable by players.
create or replace function public._pay_game_win(p_room_id integer, p_user uuid, p_xp integer, p_n integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_res jsonb;
begin
  insert into game_rewards (room_id, user_id, xp, num_players, status)
  values (p_room_id, p_user, p_xp, p_n, 'paid')
  on conflict (room_id, user_id) do update set status = 'paid', claimed_at = now();

  v_res := update_user_xp(p_user, p_xp, 'Game win (' || p_n || ' players)');
  insert into user_activities (user_id, activity_type, xp_awarded, description, metadata)
  values (p_user, 'game_complete', p_xp, 'Completed game with ' || p_n || ' players',
          jsonb_build_object('num_players', p_n, 'won', true, 'room_id', p_room_id));
  insert into user_activities (user_id, activity_type, description, metadata)
  values (p_user, 'game_win', 'Won game with ' || p_n || ' players',
          jsonb_build_object('num_players', p_n, 'room_id', p_room_id));
  return v_res || jsonb_build_object('success', true, 'xp', p_xp, 'num_players', p_n);
end;
$$;
revoke all on function public._pay_game_win(integer, uuid, integer, integer) from public, anon, authenticated;

create or replace function public.claim_game_win(p_room_id integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid       uuid := auth.uid();
  v_room      record;
  v_seat      record;
  v_prev      record;
  v_n         integer;
  v_xp        integer;
  v_witnesses integer;
begin
  if v_uid is null then raise exception 'not signed in'; end if;

  select * into v_room from game_room where id = p_room_id;
  if not found or v_room.status <> 'finished' then
    return jsonb_build_object('success', false, 'reason', 'not_finished');
  end if;
  if v_room.created_at > now() - interval '3 minutes' then
    return jsonb_build_object('success', false, 'reason', 'too_short');
  end if;

  select * into v_seat from players where game_id = p_room_id and user_id = v_uid limit 1;
  if not found or v_seat.player_index is distinct from v_room.current_turn_index then
    return jsonb_build_object('success', false, 'reason', 'not_winner');
  end if;

  select * into v_prev from game_rewards where room_id = p_room_id and user_id = v_uid;
  if found then
    return jsonb_build_object('success', false,
      'reason', case when v_prev.status = 'pending' then 'awaiting_witness' else 'already_claimed' end);
  end if;
  if (select count(*) from game_rewards
      where user_id = v_uid and claimed_at > now() - interval '1 hour') >= 4 then
    return jsonb_build_object('success', false, 'reason', 'rate_limited');
  end if;

  select count(*) into v_n from players where game_id = p_room_id;
  v_n  := greatest(2, least(5, v_n));
  v_xp := 75 + (v_n - 1) * 25;

  -- Other humans still here? Then one of them must confirm the win.
  select count(*) into v_witnesses from players
  where game_id = p_room_id and user_id is not null and user_id <> v_uid
    and last_seen > now() - interval '90 seconds';

  if v_witnesses = 0
     or exists (select 1 from match_reports r
                where r.room_id = p_room_id and r.reporter <> v_uid
                  and r.winner_index = v_seat.player_index and r.confirms) then
    return public._pay_game_win(p_room_id, v_uid, v_xp, v_n);
  end if;

  insert into game_rewards (room_id, user_id, xp, num_players, status)
  values (p_room_id, v_uid, v_xp, v_n, 'pending');
  return jsonb_build_object('success', false, 'reason', 'awaiting_witness', 'xp', v_xp);
end;
$$;

-- Every human browser, at game over.
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
  select * into v_seat from players where game_id = p_room_id and user_id = v_uid limit 1;
  if not found then return; end if; -- only players of this game can witness

  insert into match_reports (room_id, reporter, seat, winner_index, confirms, activated, at_shrine, fingerprint)
  values (p_room_id, v_uid, v_seat.player_index, p_winner_index, coalesce(p_confirms, false),
          p_activated, p_at_shrine, left(p_fingerprint, 64))
  on conflict (room_id, reporter) do update
    set winner_index = excluded.winner_index, confirms = excluded.confirms,
        activated = excluded.activated, at_shrine = excluded.at_shrine,
        fingerprint = excluded.fingerprint, created_at = now();

  -- A witness (not the winner) disagreeing: flag the match for review.
  if not coalesce(p_confirms, false) and v_seat.player_index is distinct from p_winner_index then
    update matches set disputed = true
    where id = (select match_id from game_room where id = p_room_id);
  end if;

  -- A confirmation from someone other than the winner pays a waiting claim.
  if coalesce(p_confirms, false) and v_seat.player_index is distinct from p_winner_index then
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

-- Every human browser, the moment each turn passes.
create or replace function public.report_fingerprint(p_room_id integer, p_turn integer, p_fingerprint text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid  uuid := auth.uid();
  v_seat record;
  v_new  integer;
begin
  if v_uid is null or p_turn is null or p_fingerprint is null then return; end if;
  select * into v_seat from players where game_id = p_room_id and user_id = v_uid limit 1;
  if not found then return; end if;

  insert into match_fingerprints (room_id, turn, reporter, seat, fingerprint)
  values (p_room_id, p_turn, v_uid, v_seat.player_index, left(p_fingerprint, 64))
  on conflict do nothing;
  get diagnostics v_new = row_count;

  if v_new > 0 and exists (select 1 from match_fingerprints f
                       where f.room_id = p_room_id and f.turn = p_turn
                         and f.reporter <> v_uid and f.fingerprint <> left(p_fingerprint, 64)) then
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

revoke all on function public.claim_game_win(integer) from public, anon;
revoke all on function public.report_game_result(integer, integer, boolean, jsonb, boolean, text) from public, anon;
revoke all on function public.report_fingerprint(integer, integer, text) from public, anon;
grant execute on function public.claim_game_win(integer) to authenticated;
grant execute on function public.report_game_result(integer, integer, boolean, jsonb, boolean, text) to authenticated;
grant execute on function public.report_fingerprint(integer, integer, text) to authenticated;
