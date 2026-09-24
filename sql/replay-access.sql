-- Phase 3, step 1: who may see which recorded match.
-- Applied 2026-09-24 (migration replay_access).
--
-- Owner's rule: players can watch their OWN games, and any player of a game
-- can post it publicly; public games can be watched by anyone signed in.
-- Replays are only available once the game is over, so hands and deck order
-- are no longer secret. Public matches are kept (not removed by the 30-day
-- cleanup in start_match) until unposted.
--
-- matches / match_moves stay RLS-locked; these RPCs are the only way in.

alter table public.matches add column if not exists is_public boolean not null default false;
alter table public.matches add column if not exists posted_at timestamptz;
alter table public.matches add column if not exists posted_by uuid;
create index if not exists matches_public_idx on public.matches (is_public, posted_at desc);
create index if not exists matches_players_gin on public.matches using gin (players jsonb_path_ops);

-- Was the caller one of the (human) players of this match?
create or replace function public.is_match_player(p_match_id bigint)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from matches m
    where m.id = p_match_id
      and auth.uid() is not null
      and m.players @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))
  );
$$;

-- Shared row shape for the two lists.
create or replace function public._match_summary(m public.matches)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  select jsonb_build_object(
    'id', m.id,
    'started_at', m.started_at,
    'ended_at', m.ended_at,
    'duration_s', extract(epoch from (coalesce(m.ended_at, m.last_move_at) - m.started_at))::integer,
    'status', m.status,
    'player_count', m.player_count,
    'players', (select jsonb_agg(jsonb_build_object(
                  'index', p->'index', 'color', p->'color', 'username', p->'username', 'is_bot', p->'is_bot'))
                from jsonb_array_elements(m.players) p),
    'winner_index', m.winner_index,
    'win_type', m.win_type,
    'move_count', m.move_count,
    'is_public', m.is_public,
    'posted_at', m.posted_at
  );
$$;

-- My finished games, newest first.
create or replace function public.list_my_matches(p_limit integer default 20, p_before timestamptz default null)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(public._match_summary(m) order by m.started_at desc), '[]'::jsonb)
  from (
    select * from matches
    where status in ('finished', 'abandoned')
      and auth.uid() is not null
      and players @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))
      and (p_before is null or started_at < p_before)
    order by started_at desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
  ) m;
$$;

-- Public games, most recently posted first.
create or replace function public.list_public_matches(p_limit integer default 20, p_before timestamptz default null)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(public._match_summary(m) order by m.posted_at desc), '[]'::jsonb)
  from (
    select * from matches
    where is_public and auth.uid() is not null
      and (p_before is null or posted_at < p_before)
    order by posted_at desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
  ) m;
$$;

-- Everything needed to play a match back: settings, seed, seats, and every
-- recorded message in order. Only for a finished match the caller played in,
-- a public one, or the hermit.
create or replace function public.get_match_replay(p_match_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_m matches;
begin
  select * into v_m from matches where id = p_match_id;
  if not found then raise exception 'no such match'; end if;
  if v_m.status = 'playing' then raise exception 'match still in progress'; end if;
  if not (v_m.is_public or public.is_match_player(p_match_id) or public.is_hermit()) then
    raise exception 'not authorized';
  end if;
  return public._match_summary(v_m) || jsonb_build_object(
    'deck_seed', v_m.deck_seed,
    'settings', v_m.settings,
    'seats', v_m.players,   -- full seat list incl. user_id, needed to rebuild the game
    'moves', (select coalesce(jsonb_agg(jsonb_build_object(
                'seq', mm.seq, 'event', mm.event, 'sender', mm.sender,
                'payload', mm.payload, 't', extract(epoch from mm.at) * 1000) order by mm.seq), '[]'::jsonb)
              from match_moves mm where mm.match_id = p_match_id)
  );
end;
$$;

-- Post (or unpost) one of my finished games to the public list.
create or replace function public.set_match_public(p_match_id bigint, p_public boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not (public.is_match_player(p_match_id) or public.is_hermit()) then
    raise exception 'not authorized';
  end if;
  update matches
  set is_public = coalesce(p_public, false),
      keep      = coalesce(p_public, false) or keep,
      posted_at = case when coalesce(p_public, false) then coalesce(posted_at, now()) else null end,
      posted_by = case when coalesce(p_public, false) then coalesce(posted_by, auth.uid()) else null end
  where id = p_match_id and status in ('finished', 'abandoned');
end;
$$;

revoke all on function public.is_match_player(bigint) from public, anon;
revoke all on function public._match_summary(public.matches) from public, anon, authenticated;
revoke all on function public.list_my_matches(integer, timestamptz) from public, anon;
revoke all on function public.list_public_matches(integer, timestamptz) from public, anon;
revoke all on function public.get_match_replay(bigint) from public, anon;
revoke all on function public.set_match_public(bigint, boolean) from public, anon;
grant execute on function public.is_match_player(bigint) to authenticated;
grant execute on function public.list_my_matches(integer, timestamptz) to authenticated;
grant execute on function public.list_public_matches(integer, timestamptz) to authenticated;
grant execute on function public.get_match_replay(bigint) to authenticated;
grant execute on function public.set_match_public(bigint, boolean) to authenticated;
