-- Anti-cheat "simplest protections" 1 and 2 (2026-09-25, migration ladder_secure).
--
-- 1. The ladder can no longer be faked. ladder_game_result() used to take
--    the winner and the losers from the browser, so one console command
--    ("I beat the #1 player") moved anyone to the top without a game. Now
--    the SERVER moves the ladder, from the recorded game (matches.players):
--      * a human win moves the ladder at the moment its XP is paid
--        (_pay_game_win), i.e. only after the same witness rules as XP;
--      * a bot win moves it when a human of that game confirms it
--        (report_game_result), not only the host that drove the bot;
--      * at most once per recorded game (ladder_applied).
--    ladder_game_result() stays as a no-op so old cached clients do not error.
--
-- 2. Quit wins need a real game. A win paid without another player there to
--    confirm it (they quit, or only bots) needs at least 6 turns in the
--    recorded game (_match_turns), or 10 minutes if the game was not recorded.

create table if not exists public.ladder_applied (
  match_id   bigint primary key,
  applied_at timestamptz not null default now()
);
alter table public.ladder_applied enable row level security;

alter table public.game_rewards add column if not exists match_id bigint;

-- Highest turn number recorded for a match (turn-change / turn-sync messages).
create or replace function public._match_turns(p_match_id bigint)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select max((payload->>'turnNumber')::integer)
  from match_moves
  where match_id = p_match_id and event in ('turn-change', 'turn-sync')
    and (payload->>'turnNumber') ~ '^[0-9]+$';
$$;
revoke all on function public._match_turns(bigint) from public, anon, authenticated;

-- The recorded match of a room's game: the room's current one, or (for a
-- claim made earlier) the latest one that started before the claim.
create or replace function public._room_match(p_room_id integer, p_before timestamptz)
returns bigint
language sql
stable
security definer
set search_path to 'public'
as $$
  select id from matches
  where room_id = p_room_id and started_at <= coalesce(p_before, now())
  order by started_at desc limit 1;
$$;
revoke all on function public._room_match(integer, timestamptz) from public, anon, authenticated;

-- Ladder move (the old ladder_game_result body, without trusting a caller).
create or replace function public._ladder_move(p_winner_user uuid, p_winner_bot bigint,
                                               p_loser_users uuid[], p_loser_bots bigint[])
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  winner_rank int; best_rank int; r int; u uuid; b bigint;
begin
  if (p_winner_user is null) = (p_winner_bot is null) then return null; end if;
  if p_winner_user is not null then
    perform ladder_ensure_player(p_winner_user);
    select rank into winner_rank from ladder where user_id = p_winner_user;
  else
    perform ladder_ensure_bot(p_winner_bot);
    select rank into winner_rank from ladder where bot_id = p_winner_bot;
  end if;
  if winner_rank is null then return null; end if;

  best_rank := null;
  foreach u in array coalesce(p_loser_users, '{}') loop
    perform ladder_ensure_player(u);
    select rank into r from ladder where user_id = u;
    if r is not null and (best_rank is null or r < best_rank) then best_rank := r; end if;
  end loop;
  foreach b in array coalesce(p_loser_bots, '{}') loop
    perform ladder_ensure_bot(b);
    select rank into r from ladder where bot_id = b;
    if r is not null and (best_rank is null or r < best_rank) then best_rank := r; end if;
  end loop;

  if best_rank is null or best_rank >= winner_rank then return winner_rank; end if;
  update ladder set rank = rank + 1, updated_at = now()
    where rank >= best_rank and rank < winner_rank;
  if p_winner_user is not null then
    update ladder set rank = best_rank, updated_at = now() where user_id = p_winner_user;
  else
    update ladder set rank = best_rank, updated_at = now() where bot_id = p_winner_bot;
  end if;
  return best_rank;
end;
$$;
revoke all on function public._ladder_move(uuid, bigint, uuid[], bigint[]) from public, anon, authenticated;

-- Apply one recorded game to the ladder: winner and losers come from the
-- match's seat snapshot. Bots are matched to the elemental bots by name.
create or replace function public._ladder_apply_match(p_match_id bigint, p_winner_index integer)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_m     matches;
  v_seat  jsonb;
  v_wuser uuid; v_wbot bigint;
  v_lusers uuid[] := '{}'; v_lbots bigint[] := '{}';
  v_bot   bigint;
  v_is_bot boolean;
begin
  if p_match_id is null or p_winner_index is null then return null; end if;
  select * into v_m from matches where id = p_match_id;
  if not found then return null; end if;
  insert into ladder_applied (match_id) values (p_match_id) on conflict do nothing;
  if not found then return null; end if; -- this game already moved the ladder

  for v_seat in select * from jsonb_array_elements(v_m.players) loop
    v_is_bot := coalesce((v_seat->>'is_bot')::boolean, false) or v_seat->>'user_id' is null;
    v_bot := null;
    if v_is_bot then
      select id into v_bot from deployed_bots
      where owner is null and nickname = trim(regexp_replace(coalesce(v_seat->>'username', ''), '^🤖', ''))
      limit 1;
    end if;
    if (v_seat->>'index')::integer = p_winner_index then
      if v_is_bot then v_wbot := v_bot; else v_wuser := (v_seat->>'user_id')::uuid; end if;
    elsif v_is_bot then
      if v_bot is not null then v_lbots := v_lbots || v_bot; end if;
    else
      v_lusers := v_lusers || (v_seat->>'user_id')::uuid;
    end if;
  end loop;
  return public._ladder_move(v_wuser, v_wbot, v_lusers, v_lbots);
end;
$$;
revoke all on function public._ladder_apply_match(bigint, integer) from public, anon, authenticated;

-- Old client entry point: no longer moves anything.
create or replace function public.ladder_game_result(p_winner_user uuid, p_winner_bot bigint,
                                                     p_loser_users uuid[], p_loser_bots bigint[])
returns integer
language sql
security definer
set search_path to 'public'
as $$ select null::integer; $$;

-- Pay a win (XP + badge activities) and move the ladder for its game.
create or replace function public._pay_game_win(p_room_id integer, p_user uuid, p_xp integer, p_n integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_res   jsonb;
  v_match bigint;
  v_idx   integer;
begin
  select match_id into v_match from game_rewards where room_id = p_room_id and user_id = p_user;
  v_match := coalesce(v_match, (select match_id from game_room where id = p_room_id), public._room_match(p_room_id, now()));

  insert into game_rewards (room_id, user_id, xp, num_players, status, match_id)
  values (p_room_id, p_user, p_xp, p_n, 'paid', v_match)
  on conflict (room_id, user_id) do update
    set status = 'paid', claimed_at = now(), match_id = coalesce(game_rewards.match_id, excluded.match_id);

  v_res := update_user_xp(p_user, p_xp, 'Game win (' || p_n || ' players)');
  insert into user_activities (user_id, activity_type, xp_awarded, description, metadata)
  values (p_user, 'game_complete', p_xp, 'Completed game with ' || p_n || ' players',
          jsonb_build_object('num_players', p_n, 'won', true, 'room_id', p_room_id));
  insert into user_activities (user_id, activity_type, description, metadata)
  values (p_user, 'game_win', 'Won game with ' || p_n || ' players',
          jsonb_build_object('num_players', p_n, 'room_id', p_room_id));

  -- Ladder: the winner's seat in the recorded game.
  if v_match is not null then
    select (p->>'index')::integer into v_idx
    from matches m, jsonb_array_elements(m.players) p
    where m.id = v_match and p->>'user_id' = p_user::text limit 1;
    if v_idx is not null then perform public._ladder_apply_match(v_match, v_idx); end if;
  end if;
  return v_res || jsonb_build_object('success', true, 'xp', p_xp, 'num_players', p_n);
end;
$$;
revoke all on function public._pay_game_win(integer, uuid, integer, integer) from public, anon, authenticated;

-- A game long enough to pay without a witness (quit wins, bot-only games).
create or replace function public._long_enough(p_match_id bigint, p_room_created timestamptz)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select case when p_match_id is not null and exists (select 1 from matches where id = p_match_id)
              then coalesce(public._match_turns(p_match_id), 0) >= 6
              else p_room_created < now() - interval '10 minutes' end;
$$;
revoke all on function public._long_enough(bigint, timestamptz) from public, anon, authenticated;

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

  -- Confirmed by another player: pay now.
  if exists (select 1 from match_reports r
             where r.room_id = p_room_id and r.reporter <> v_uid
               and r.winner_index = v_seat.player_index and r.confirms) then
    insert into game_rewards (room_id, user_id, xp, num_players, status, match_id)
    values (p_room_id, v_uid, v_xp, v_n, 'pending', v_room.match_id);
    return public._pay_game_win(p_room_id, v_uid, v_xp, v_n);
  end if;

  select count(*) into v_witnesses from players
  where game_id = p_room_id and user_id is not null and user_id <> v_uid
    and last_seen > now() - interval '90 seconds';

  -- Nobody else here to confirm (they quit, or only bots): only a real game pays.
  if v_witnesses = 0 then
    if not public._long_enough(v_room.match_id, v_room.created_at) then
      return jsonb_build_object('success', false, 'reason', 'too_short');
    end if;
    insert into game_rewards (room_id, user_id, xp, num_players, status, match_id)
    values (p_room_id, v_uid, v_xp, v_n, 'pending', v_room.match_id);
    return public._pay_game_win(p_room_id, v_uid, v_xp, v_n);
  end if;

  insert into game_rewards (room_id, user_id, xp, num_players, status, match_id)
  values (p_room_id, v_uid, v_xp, v_n, 'pending', v_room.match_id);
  return jsonb_build_object('success', false, 'reason', 'awaiting_witness', 'xp', v_xp);
end;
$$;

create or replace function public.retry_pending_wins()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid  uuid := auth.uid();
  v_row  record;
  v_match bigint;
  v_paid integer := 0;
  v_xp   integer := 0;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  for v_row in
    select * from game_rewards
    where user_id = v_uid and status = 'pending' and claimed_at < now() - interval '60 seconds'
  loop
    continue when exists (select 1 from players
                          where game_id = v_row.room_id and user_id is not null and user_id <> v_uid
                            and last_seen > now() - interval '90 seconds');
    continue when exists (select 1 from match_reports r
                          where r.room_id = v_row.room_id and r.reporter <> v_uid and not r.confirms);
    v_match := coalesce(v_row.match_id, public._room_match(v_row.room_id, v_row.claimed_at));
    continue when v_match is not null and coalesce(public._match_turns(v_match), 0) < 6;
    update game_rewards set match_id = coalesce(match_id, v_match)
    where room_id = v_row.room_id and user_id = v_uid;
    perform public._pay_game_win(v_row.room_id, v_uid, v_row.xp, coalesce(v_row.num_players, 2));
    v_paid := v_paid + 1;
    v_xp := v_xp + v_row.xp;
  end loop;
  return jsonb_build_object('paid', v_paid, 'xp', v_xp);
end;
$$;

-- Witness report: also moves the ladder for a confirmed BOT win.
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
  v_m       matches;
  v_wseat   jsonb;
  v_humans  integer;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into v_seat from public._witness_seat(p_room_id);
  if not found then return; end if;

  insert into match_reports (room_id, reporter, seat, winner_index, confirms, activated, at_shrine, fingerprint)
  values (p_room_id, v_uid, v_seat.seat, p_winner_index, coalesce(p_confirms, false),
          p_activated, p_at_shrine, left(p_fingerprint, 64))
  on conflict (room_id, reporter) do update
    set winner_index = excluded.winner_index, confirms = excluded.confirms,
        activated = excluded.activated, at_shrine = excluded.at_shrine,
        fingerprint = excluded.fingerprint, created_at = now();

  if not coalesce(p_confirms, false) and v_seat.seat is distinct from p_winner_index then
    update matches set disputed = true where id = v_seat.match_id;
  end if;

  if coalesce(p_confirms, false) and v_seat.seat is distinct from p_winner_index then
    for v_pending in
      select g.* from game_rewards g
      where g.room_id = p_room_id and g.status = 'pending' and g.user_id <> v_uid
    loop
      perform public._pay_game_win(p_room_id, v_pending.user_id, v_pending.xp,
                                   coalesce(v_pending.num_players, 2));
    end loop;

    -- Bot winner: the ladder moves on a human's confirmation. If the game had
    -- other humans, the confirmation must not come only from the host who
    -- drove the bot (matches.created_by).
    select * into v_m from matches where id = v_seat.match_id;
    if found then
      select p into v_wseat from jsonb_array_elements(v_m.players) p
      where (p->>'index')::integer = p_winner_index limit 1;
      if v_wseat is not null and (coalesce((v_wseat->>'is_bot')::boolean, false) or v_wseat->>'user_id' is null) then
        select count(*) into v_humans from jsonb_array_elements(v_m.players) p
        where p->>'user_id' is not null and not coalesce((p->>'is_bot')::boolean, false);
        if v_uid is distinct from v_m.created_by or v_humans <= 1 then
          perform public._ladder_apply_match(v_m.id, p_winner_index);
        end if;
      end if;
    end if;
  end if;
end;
$$;

revoke all on function public.claim_game_win(integer) from public, anon;
revoke all on function public.retry_pending_wins() from public, anon;
revoke all on function public.report_game_result(integer, integer, boolean, jsonb, boolean, text) from public, anon;
grant execute on function public.claim_game_win(integer) to authenticated;
grant execute on function public.retry_pending_wins() to authenticated;
grant execute on function public.report_game_result(integer, integer, boolean, jsonb, boolean, text) to authenticated;
