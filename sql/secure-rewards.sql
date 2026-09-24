-- Server-controlled rewards. Applied 2026-09-24 in two migrations:
--   secure_rewards_functions  (part 1: new functions, additive)
--   secure_rewards_lock       (part 2: lock the old paths, after the client
--                              switched to part 1)
--
-- Before this, any caller (even signed out) could run award_gold /
-- update_user_xp / award_badge for any account, players could UPDATE their
-- own gold/XP/level/badges directly, and fake user_activities rows earned
-- badges. The game's rules run in the browser, so the server cannot fully
-- prove a win; these functions refuse the obvious fakes and cap the rest.

-- ============================== PART 1 ===================================

-- One XP claim per (room, player).
create table if not exists public.game_rewards (
  room_id    integer not null,
  user_id    uuid    not null,
  xp         integer not null,
  claimed_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
alter table public.game_rewards enable row level security;
create index if not exists game_rewards_user_idx on public.game_rewards (user_id, claimed_at);

-- Daily login: 20 gold, once per UTC day.
create or replace function public.claim_daily_login()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if exists (select 1 from user_activities
             where user_id = v_uid and activity_type = 'daily_login'
               and created_at >= date_trunc('day', now())) then
    return jsonb_build_object('awarded', false);
  end if;
  perform award_gold(v_uid, 20, 'Daily login reward');
  insert into user_activities (user_id, activity_type, gold_awarded, description)
  values (v_uid, 'daily_login', 20, 'Daily login');
  return jsonb_build_object('awarded', true, 'gold', 20);
end;
$$;

-- Game win XP. Only for a finished online game where the caller's own seat
-- is the recorded winner; once per game; amount decided here; at most 4
-- claims per hour.
create or replace function public.claim_game_win(p_room_id integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid  uuid := auth.uid();
  v_room record;
  v_seat record;
  v_n    integer;
  v_xp   integer;
  v_res  jsonb;
begin
  if v_uid is null then raise exception 'not signed in'; end if;

  select * into v_room from game_room where id = p_room_id;
  if not found or v_room.status <> 'finished' then
    return jsonb_build_object('success', false, 'reason', 'not_finished');
  end if;
  if v_room.created_at > now() - interval '3 minutes' then
    return jsonb_build_object('success', false, 'reason', 'too_short');
  end if;

  select * into v_seat from players
  where game_id = p_room_id and user_id = v_uid
  limit 1;
  if not found or v_seat.player_index is distinct from v_room.current_turn_index then
    return jsonb_build_object('success', false, 'reason', 'not_winner');
  end if;

  if exists (select 1 from game_rewards where room_id = p_room_id and user_id = v_uid) then
    return jsonb_build_object('success', false, 'reason', 'already_claimed');
  end if;
  if (select count(*) from game_rewards
      where user_id = v_uid and claimed_at > now() - interval '1 hour') >= 4 then
    return jsonb_build_object('success', false, 'reason', 'rate_limited');
  end if;

  select count(*) into v_n from players where game_id = p_room_id;
  v_n  := greatest(2, least(5, v_n));
  v_xp := 75 + (v_n - 1) * 25;

  insert into game_rewards (room_id, user_id, xp) values (p_room_id, v_uid, v_xp);
  v_res := update_user_xp(v_uid, v_xp, 'Game win (' || v_n || ' players)');

  -- These drive the First Steps / Veteran / First Victory / Champion /
  -- Master badges (trigger check_badges_trigger).
  insert into user_activities (user_id, activity_type, xp_awarded, description, metadata)
  values (v_uid, 'game_complete', v_xp, 'Completed game with ' || v_n || ' players',
          jsonb_build_object('num_players', v_n, 'won', true, 'room_id', p_room_id));
  insert into user_activities (user_id, activity_type, description, metadata)
  values (v_uid, 'game_win', 'Won game with ' || v_n || ' players',
          jsonb_build_object('num_players', v_n, 'room_id', p_room_id));

  return v_res || jsonb_build_object('xp', v_xp, 'num_players', v_n);
end;
$$;

-- Bot training gold. The training runs in the browser, so this is capped:
-- at most 60 per claim and 300 per player per day. Returns the gold granted.
create or replace function public.claim_training_reward(p_amount integer, p_description text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid   uuid := auth.uid();
  v_today integer;
  v_grant integer;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 60 then raise exception 'bad amount'; end if;
  select coalesce(sum(gold_awarded), 0) into v_today
  from user_activities
  where user_id = v_uid and activity_type = 'training_reward'
    and created_at > now() - interval '1 day';
  v_grant := least(p_amount, greatest(0, 300 - v_today));
  if v_grant = 0 then return 0; end if;
  update user_profiles set gold = gold + v_grant, updated_at = now() where user_id = v_uid;
  insert into user_activities (user_id, activity_type, gold_awarded, description)
  values (v_uid, 'training_reward', v_grant, left(coalesce(p_description, 'Bot training'), 200));
  return v_grant;
end;
$$;

-- Spend your own gold. Fails if you don't have enough. Returns new balance.
create or replace function public.spend_gold(p_amount integer, p_description text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid  uuid := auth.uid();
  v_gold integer;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000 then raise exception 'bad amount'; end if;
  update user_profiles set gold = gold - p_amount, updated_at = now()
  where user_id = v_uid and gold >= p_amount
  returning gold into v_gold;
  if not found then raise exception 'not enough gold'; end if;
  insert into user_activities (user_id, activity_type, gold_spent, description)
  values (v_uid, 'gold_spent', p_amount, left(coalesce(p_description, 'Purchase'), 200));
  return v_gold;
end;
$$;

revoke all on function public.claim_daily_login() from public, anon;
revoke all on function public.claim_game_win(integer) from public, anon;
revoke all on function public.claim_training_reward(integer, text) from public, anon;
revoke all on function public.spend_gold(integer, text) from public, anon;
grant execute on function public.claim_daily_login() to authenticated;
grant execute on function public.claim_game_win(integer) to authenticated;
grant execute on function public.claim_training_reward(integer, text) to authenticated;
grant execute on function public.spend_gold(integer, text) to authenticated;

-- ============================== PART 2 ===================================

-- Old reward functions: no longer callable by players. They still run
-- inside the functions above (which run as the owner).
revoke execute on function public.award_gold(uuid, integer, text) from public, anon, authenticated;
revoke execute on function public.update_user_xp(uuid, integer, text) from public, anon, authenticated;
revoke execute on function public.award_badge(uuid, character varying) from public, anon, authenticated;
revoke execute on function public.check_badge_criteria(uuid, character varying, jsonb) from public, anon, authenticated;
revoke execute on function public.trigger_check_badges() from public, anon, authenticated;

-- Profiles: players may only change harmless columns directly.
revoke update on public.user_profiles from anon, authenticated;
grant update (stats, updated_at, skip_intro) on public.user_profiles to authenticated;

-- New profiles must start empty.
drop policy if exists "Users can insert own profile" on public.user_profiles;
create policy "Users can insert own profile" on public.user_profiles
  for insert with check (
    (select auth.uid()) = user_id
    and coalesce(gold, 0) = 0
    and coalesce(total_xp, 0) = 0
    and coalesce(current_level, 1) = 1
    and coalesce(badges_earned, '[]'::jsonb) = '[]'::jsonb
  );

-- Activities: players may only log the two badge-count types, with no
-- rewards attached. Everything else is written by the functions above.
drop policy if exists "Users can insert own activities" on public.user_activities;
create policy "Users can insert own activities" on public.user_activities
  for insert with check (
    (select auth.uid()) = user_id
    and activity_type in ('scroll_cast', 'element_activated')
    and coalesce(xp_awarded, 0) = 0
    and coalesce(gold_awarded, 0) = 0
    and coalesce(gold_spent, 0) = 0
  );
