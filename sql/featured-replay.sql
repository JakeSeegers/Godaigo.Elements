-- Featured replay (2026-09-26). Applied as migration featured_replay.
-- The hermit picks one finished match (Replays browser, "Feature" button);
-- the lobby "Watch featured replay" button plays it at 4x for any signed-in
-- player. Featuring also sets keep, so the 30-day cleanup never removes it.

create table if not exists featured_replay (
  id        integer primary key default 1 check (id = 1),  -- one row only
  match_id  bigint references matches(id) on delete set null,
  set_at    timestamptz not null default now()
);
alter table featured_replay enable row level security;  -- no client policies: RPCs only

-- Hermit: feature a match (null = no featured replay).
create or replace function public.hermit_set_featured_match(p_match_id bigint)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not public.is_hermit() then raise exception 'not authorized'; end if;
  if p_match_id is not null then
    if not exists (select 1 from matches where id = p_match_id and status <> 'playing') then
      raise exception 'match not found or still in progress';
    end if;
    update matches set keep = true where id = p_match_id;
  end if;
  insert into featured_replay (id, match_id, set_at) values (1, p_match_id, now())
  on conflict (id) do update set match_id = excluded.match_id, set_at = now();
end;
$$;

-- Anyone signed in: the featured match id (null when none).
create or replace function public.get_featured_match()
returns bigint
language sql stable security definer set search_path to 'public'
as $$
  select f.match_id from featured_replay f
  join matches m on m.id = f.match_id and m.status <> 'playing'
  where f.id = 1;
$$;

-- get_match_replay: the featured match is watchable by everyone signed in.
create or replace function public.get_match_replay(p_match_id bigint)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_m matches;
begin
  select * into v_m from matches where id = p_match_id;
  if not found then raise exception 'no such match'; end if;
  if v_m.status = 'playing' then raise exception 'match still in progress'; end if;
  if not (v_m.is_public or public.is_match_player(p_match_id) or public.is_hermit()
          or p_match_id = public.get_featured_match()) then
    raise exception 'not authorized';
  end if;
  return public._match_summary(v_m) || jsonb_build_object(
    'deck_seed', v_m.deck_seed,
    'settings', v_m.settings,
    'seats', v_m.players,
    'moves', (select coalesce(jsonb_agg(jsonb_build_object(
                'seq', mm.seq, 'event', mm.event, 'sender', mm.sender,
                'payload', mm.payload, 't', extract(epoch from mm.at) * 1000) order by mm.seq), '[]'::jsonb)
              from match_moves mm where mm.match_id = p_match_id)
  );
end;
$function$;

revoke all on function public.hermit_set_featured_match(bigint) from public, anon;
revoke all on function public.get_featured_match() from public, anon;
grant execute on function public.hermit_set_featured_match(bigint) to authenticated;
grant execute on function public.get_featured_match() to authenticated;
