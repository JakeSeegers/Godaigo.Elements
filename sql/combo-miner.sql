-- Combo miner (bot combo plan, Phase 3). Applied 2026-09-26 (migration combo_miner).
--
-- The hermit's browser replays finished games at full speed in a hidden frame
-- (js/replay-viewer.js, index.html?replaymine=ID), scores every player after
-- every turn with the bot's own evaluator, and finds big jumps. The casts
-- (with their choices) a player made in the turns before a jump are saved
-- here as a combo candidate. A candidate only counts in the summary once the
-- same sequence shows up again and pays on average.
--
-- Trust: how much a candidate counts depends on the player, set here on the
-- server (the client only sends seat + sequence):
--   rank factor  = ladder rank at match start (matches.players[].rank, saved
--                  by start_match below; older matches fall back to the
--                  current rank): 1 - (rank - 1) / ladder size, at least 0.2;
--                  no rank = 0.3
--   experience   = finished recorded games with this player: 0.2 + games/10,
--                  at most 1
--   bots         = 0 (never learn from the bots' own play)

alter table matches add column if not exists mined_at timestamptz;

create table if not exists combo_candidates (
  id          bigserial primary key,
  match_id    bigint not null references matches(id) on delete cascade,
  seat        integer not null,
  user_id     uuid,
  is_bot      boolean not null default false,
  rank        integer,
  games       integer,
  trust       real not null default 0,
  gain        real not null,
  turns       integer not null,
  start_turn  integer,
  end_turn    integer,
  signature   text not null,
  steps       jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists combo_candidates_signature on combo_candidates (signature);
create index if not exists combo_candidates_match on combo_candidates (match_id);
alter table combo_candidates enable row level security;  -- no client policies: RPCs only

-- start_match: also save each human's ladder rank at match start.
create or replace function public.start_match(p_room_id integer, p_deck_seed bigint, p_players jsonb, p_settings jsonb)
 returns bigint
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_room record;
  v_id   bigint;
  v_players jsonb;
begin
  if not (public.is_room_host(p_room_id) or public.is_hermit()) then
    raise exception 'not authorized';
  end if;
  select * into v_room from game_room where id = p_room_id;
  if not found or v_room.status <> 'playing' then raise exception 'room not playing'; end if;
  if jsonb_typeof(p_players) <> 'array' or jsonb_array_length(p_players) > 5 then
    raise exception 'bad players';
  end if;

  if v_room.match_id is not null then
    select id into v_id from matches
    where id = v_room.match_id and room_id = p_room_id and status = 'playing';
    if found then return v_id; end if;
  end if;

  update matches set status = 'abandoned', ended_at = last_move_at
  where status = 'playing' and last_move_at < now() - interval '30 minutes';
  delete from matches
  where status <> 'playing' and not keep and started_at < now() - interval '30 days';

  select coalesce(jsonb_agg(
           case when nullif(p->>'user_id', '') is not null then
             p || jsonb_build_object('rank',
               (select l.rank from ladder l where l.user_id = (p->>'user_id')::uuid
                  and l.entity_type = 'player' limit 1))
           else p end), '[]'::jsonb)
    into v_players
    from jsonb_array_elements(p_players) p;

  insert into matches (room_id, player_count, deck_seed, players, settings)
  values (p_room_id, jsonb_array_length(p_players), p_deck_seed, v_players,
          coalesce(p_settings, '{}'::jsonb))
  returning id into v_id;
  update game_room set match_id = v_id where id = p_room_id;
  return v_id;
end;
$function$;

-- Finished matches not mined yet (oldest first).
create or replace function public.list_matches_for_mining(p_limit integer default 20)
returns table (id bigint, room_id integer, ended_at timestamptz, move_count integer, player_count integer)
language plpgsql stable security definer set search_path to 'public'
as $$
begin
  if not public.is_hermit() then raise exception 'not authorized'; end if;
  return query
    select m.id, m.room_id, m.ended_at, m.move_count, m.player_count
    from matches m
    where m.status = 'finished' and m.mined_at is null
    order by m.id
    limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$$;

-- Store one match's candidates (replaces earlier ones for that match).
-- p_rows: [{seat, gain, turns, start_turn, end_turn, signature, steps}]
create or replace function public.save_combo_candidates(p_match_id bigint, p_rows jsonb)
returns integer
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_m       matches;
  v_row     jsonb;
  v_seat    integer;
  v_player  jsonb;
  v_uid     uuid;
  v_bot     boolean;
  v_rank    integer;
  v_games   integer;
  v_size    integer;
  v_trust   real;
  v_n       integer := 0;
begin
  if not public.is_hermit() then raise exception 'not authorized'; end if;
  select * into v_m from matches where id = p_match_id;
  if not found then raise exception 'no such match'; end if;
  delete from combo_candidates where match_id = p_match_id;
  select greatest(count(*), 1) into v_size from ladder;

  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) limit 60 loop
    v_seat := (v_row->>'seat')::integer;
    select p into v_player from jsonb_array_elements(v_m.players) p
      where (p->>'index')::integer = v_seat limit 1;
    v_uid := nullif(v_player->>'user_id', '')::uuid;
    v_bot := coalesce((v_player->>'is_bot')::boolean, v_uid is null);
    v_rank := coalesce((v_player->>'rank')::integer,
                       (select l.rank from ladder l where l.user_id = v_uid and l.entity_type = 'player' limit 1));
    v_games := case when v_uid is null then 0 else
      (select count(*) from matches mm where mm.status = 'finished'
         and mm.players @> jsonb_build_array(jsonb_build_object('user_id', v_uid::text))) end;
    v_trust := case when v_bot or v_uid is null then 0 else
      (case when v_rank is null then 0.3 else greatest(0.2, 1.0 - (v_rank - 1)::real / v_size) end)
      * least(1.0, 0.2 + v_games / 10.0) end;
    insert into combo_candidates (match_id, seat, user_id, is_bot, rank, games, trust, gain, turns,
                                  start_turn, end_turn, signature, steps)
    values (p_match_id, v_seat, v_uid, v_bot, v_rank, v_games, v_trust,
            (v_row->>'gain')::real, greatest(1, (v_row->>'turns')::integer),
            (v_row->>'start_turn')::integer, (v_row->>'end_turn')::integer,
            left(v_row->>'signature', 300),
            case when length((v_row->'steps')::text) <= 8000 then v_row->'steps' else '[]'::jsonb end);
    v_n := v_n + 1;
  end loop;
  update matches set mined_at = now() where id = p_match_id;
  return v_n;
end;
$$;

-- Combos found so far, strongest evidence first. Bots never count.
create or replace function public.hermit_combo_summary(p_min_count integer default 1)
returns table (signature text, times integer, matches integer, players integer, avg_gain real,
               avg_trust real, score real, best_match bigint, best_steps jsonb, last_seen timestamptz)
language plpgsql stable security definer set search_path to 'public'
as $$
begin
  if not public.is_hermit() then raise exception 'not authorized'; end if;
  return query
    select c.signature,
           count(*)::integer,
           count(distinct c.match_id)::integer,
           count(distinct c.user_id)::integer,
           avg(c.gain)::real,
           avg(c.trust)::real,
           sum(c.gain * c.trust)::real,
           (array_agg(c.match_id order by c.gain * c.trust desc))[1],
           (array_agg(c.steps order by c.gain * c.trust desc))[1],
           max(c.created_at)
    from combo_candidates c
    where not c.is_bot
    group by c.signature
    having count(*) >= greatest(1, coalesce(p_min_count, 1))
    order by sum(c.gain * c.trust) desc
    limit 100;
end;
$$;

-- Mine everything again (after the miner's rules change).
create or replace function public.hermit_reset_mining()
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not public.is_hermit() then raise exception 'not authorized'; end if;
  delete from combo_candidates where true;
  update matches set mined_at = null where mined_at is not null;
end;
$$;

revoke all on function public.list_matches_for_mining(integer) from public, anon;
revoke all on function public.save_combo_candidates(bigint, jsonb) from public, anon;
revoke all on function public.hermit_combo_summary(integer) from public, anon;
revoke all on function public.hermit_reset_mining() from public, anon;
grant execute on function public.list_matches_for_mining(integer) to authenticated;
grant execute on function public.save_combo_candidates(bigint, jsonb) to authenticated;
grant execute on function public.hermit_combo_summary(integer) to authenticated;
grant execute on function public.hermit_reset_mining() to authenticated;
