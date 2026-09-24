-- Match recording (Phase 1 of replays / cheat checks / stats).
-- Applied 2026-09-24 (migration match_recording).
--
-- One `matches` row per online game, and every game message ("broadcast")
-- in order in `match_moves`. The room HOST's browser records (it hears
-- everyone's moves and sends its own + its bots'); if the host changes
-- mid-game, the new host picks up via game_room.match_id. Client:
-- js/match-recorder.js. Replays (Phase 3) will feed these messages back
-- into the game's normal receive handlers.
--
-- Clients never read or write these tables directly (RLS on, no policies):
-- start_match / append_match_moves / finish_match below are the only way in,
-- and only the room's host (is_room_host) or the hermit may call them.
--
-- Retention: finished/abandoned matches older than 30 days are deleted
-- unless keep = true (done inside start_match, so no cron is needed).

create table if not exists public.matches (
  id            bigserial primary key,
  room_id       integer not null,
  status        text not null default 'playing' check (status in ('playing', 'finished', 'abandoned')),
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  last_move_at  timestamptz not null default now(),
  winner_index  integer,
  win_type      text,
  player_count  integer not null,
  deck_seed     bigint,
  players       jsonb not null,           -- [{index, color, username, user_id, is_bot}]
  settings      jsonb not null default '{}'::jsonb,
  move_count    integer not null default 0,
  keep          boolean not null default false,
  created_by    uuid default auth.uid()
);
alter table public.matches enable row level security;
create index if not exists matches_status_idx  on public.matches (status, last_move_at);
create index if not exists matches_started_idx on public.matches (started_at);
create index if not exists matches_room_idx    on public.matches (room_id);

create table if not exists public.match_moves (
  match_id  bigint  not null references public.matches(id) on delete cascade,
  seq       integer not null,             -- 1, 2, 3... assigned by the server
  event     text    not null,             -- broadcast event name, e.g. 'stone-place'
  sender    integer,                      -- seat index that sent it, when known
  payload   jsonb   not null,
  at        timestamptz not null,         -- when the recorder saw it
  primary key (match_id, seq)
);
alter table public.match_moves enable row level security;

alter table public.game_room add column if not exists match_id bigint;

-- Host, at game start. Returns the match id. Safe to call twice.
create or replace function public.start_match(
  p_room_id integer, p_deck_seed bigint, p_players jsonb, p_settings jsonb
) returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_room record;
  v_id   bigint;
begin
  if not (public.is_room_host(p_room_id) or public.is_hermit()) then
    raise exception 'not authorized';
  end if;
  select * into v_room from game_room where id = p_room_id;
  if not found or v_room.status <> 'playing' then raise exception 'room not playing'; end if;
  if jsonb_typeof(p_players) <> 'array' or jsonb_array_length(p_players) > 5 then
    raise exception 'bad players';
  end if;

  -- Already started for this room (handleGameStart can run twice)
  if v_room.match_id is not null then
    select id into v_id from matches
    where id = v_room.match_id and room_id = p_room_id and status = 'playing';
    if found then return v_id; end if;
  end if;

  -- Housekeeping: close matches with no moves for 30 minutes, and drop
  -- old ones nobody asked to keep.
  update matches set status = 'abandoned', ended_at = last_move_at
  where status = 'playing' and last_move_at < now() - interval '30 minutes';
  delete from matches
  where status <> 'playing' and not keep and started_at < now() - interval '30 days';

  insert into matches (room_id, player_count, deck_seed, players, settings)
  values (p_room_id, jsonb_array_length(p_players), p_deck_seed, p_players,
          coalesce(p_settings, '{}'::jsonb))
  returning id into v_id;
  update game_room set match_id = v_id where id = p_room_id;
  return v_id;
end;
$$;

-- Host, every few seconds: add a batch of moves in order.
-- p_moves = [{event, sender, payload, at_ms}, ...], at most 200 per call,
-- each payload at most 32 KB. Returns the number of moves stored.
create or replace function public.append_match_moves(p_match_id bigint, p_moves jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_match record;
  v_base  integer;
  v_count integer;
begin
  select * into v_match from matches where id = p_match_id for update;
  if not found then raise exception 'no such match'; end if;
  if not (public.is_room_host(v_match.room_id) or public.is_hermit()) then
    raise exception 'not authorized';
  end if;
  -- Allow a short tail after the game ends (last batch can land after finish)
  if v_match.status <> 'playing'
     and not (v_match.status = 'finished' and v_match.ended_at > now() - interval '5 minutes') then
    raise exception 'match closed';
  end if;
  if jsonb_typeof(p_moves) <> 'array' or jsonb_array_length(p_moves) = 0 then return 0; end if;
  if jsonb_array_length(p_moves) > 200 then raise exception 'batch too large'; end if;

  select coalesce(max(seq), 0) into v_base from match_moves where match_id = p_match_id;

  insert into match_moves (match_id, seq, event, sender, payload, at)
  select p_match_id,
         v_base + m.ord::integer,
         left(coalesce(m.value->>'event', '?'), 64),
         case when jsonb_typeof(m.value->'sender') = 'number' then (m.value->>'sender')::integer end,
         coalesce(m.value->'payload', '{}'::jsonb),
         case when jsonb_typeof(m.value->'at_ms') = 'number'
              then to_timestamp((m.value->>'at_ms')::double precision / 1000)
              else now() end
  from jsonb_array_elements(p_moves) with ordinality as m(value, ord)
  where pg_column_size(m.value->'payload') <= 32768;
  get diagnostics v_count = row_count;

  update matches set move_count = move_count + v_count, last_move_at = now()
  where id = p_match_id;
  return v_count;
end;
$$;

-- Host, at game over.
create or replace function public.finish_match(p_match_id bigint, p_winner_index integer, p_win_type text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_match record;
begin
  select * into v_match from matches where id = p_match_id;
  if not found then return; end if;
  if not (public.is_room_host(v_match.room_id) or public.is_hermit()) then
    raise exception 'not authorized';
  end if;
  update matches
  set status = 'finished', ended_at = now(), winner_index = p_winner_index,
      win_type = left(p_win_type, 32)
  where id = p_match_id and status = 'playing';
end;
$$;

revoke all on function public.start_match(integer, bigint, jsonb, jsonb) from public, anon;
revoke all on function public.append_match_moves(bigint, jsonb) from public, anon;
revoke all on function public.finish_match(bigint, integer, text) from public, anon;
grant execute on function public.start_match(integer, bigint, jsonb, jsonb) to authenticated;
grant execute on function public.append_match_moves(bigint, jsonb) to authenticated;
grant execute on function public.finish_match(bigint, integer, text) to authenticated;
