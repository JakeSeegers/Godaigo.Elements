-- Bots follow mined combos (bot combo plan, Phase 4). Applied 2026-09-26
-- (migration combo_teach).
--
-- A combo from combo_candidates (sql/combo-miner.sql) is taught to the bots
-- when it has shown up at least twice, in at least two games, from players
-- (never bots). The hermit can force a combo on (to try one seen once) or
-- off (to block a bad one) from the Replays > Combos tab.
-- get_bot_combos() is what bot.js loads at game start. It is public (bots
-- run in any host's browser) and holds no player data: just the sequence,
-- how often it was seen and its score.

create table if not exists combo_flags (
  signature  text primary key,
  state      text not null check (state in ('on', 'off')),
  updated_at timestamptz not null default now()
);
alter table combo_flags enable row level security;  -- no client policies: RPCs only

create or replace function public.hermit_set_combo_state(p_signature text, p_state text)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not public.is_hermit() then raise exception 'not authorized'; end if;
  if p_state is null or p_state = 'auto' then
    delete from combo_flags where signature = p_signature;
  elsif p_state in ('on', 'off') then
    insert into combo_flags (signature, state) values (p_signature, p_state)
    on conflict (signature) do update set state = excluded.state, updated_at = now();
  else
    raise exception 'bad state';
  end if;
end;
$$;

-- The summary now also says whether bots use each combo.
drop function if exists public.hermit_combo_summary(integer);
create or replace function public.hermit_combo_summary(p_min_count integer default 1)
returns table (signature text, times integer, matches integer, players integer, avg_gain real,
               avg_trust real, score real, best_match bigint, best_steps jsonb, last_seen timestamptz,
               state text, taught boolean)
language plpgsql stable security definer set search_path to 'public'
as $$
begin
  if not public.is_hermit() then raise exception 'not authorized'; end if;
  return query
    with s as (
      select c.signature,
             count(*)::integer as times,
             count(distinct c.match_id)::integer as matches,
             count(distinct c.user_id)::integer as players,
             avg(c.gain)::real as avg_gain,
             avg(c.trust)::real as avg_trust,
             sum(c.gain * c.trust)::real as score,
             (array_agg(c.match_id order by c.gain * c.trust desc))[1] as best_match,
             (array_agg(c.steps order by c.gain * c.trust desc))[1] as best_steps,
             max(c.created_at) as last_seen
      from combo_candidates c
      where not c.is_bot
      group by c.signature
    )
    select s.*, coalesce(f.state, 'auto'),
           case when f.state = 'on' then true when f.state = 'off' then false
                else s.times >= 2 and s.matches >= 2 end
    from s left join combo_flags f on f.signature = s.signature
    where s.times >= greatest(1, coalesce(p_min_count, 1))
    order by s.score desc
    limit 100;
end;
$$;

-- What the bots use: taught combos only, strongest first.
create or replace function public.get_bot_combos()
returns table (signature text, times integer, score real)
language sql stable security definer set search_path to 'public'
as $$
  with s as (
    select c.signature, count(*)::integer as times, count(distinct c.match_id)::integer as matches,
           sum(c.gain * c.trust)::real as score
    from combo_candidates c
    where not c.is_bot
    group by c.signature
  )
  select s.signature, s.times, s.score
  from s left join combo_flags f on f.signature = s.signature
  where f.state = 'on' or (f.state is null and s.times >= 2 and s.matches >= 2)
  union all
  -- forced on but not (or no longer) in the candidates
  select f.signature, 0, 0::real from combo_flags f
  where f.state = 'on' and not exists (select 1 from s where s.signature = f.signature)
  order by 3 desc
  limit 40;
$$;

revoke all on function public.hermit_set_combo_state(text, text) from public, anon;
revoke all on function public.hermit_combo_summary(integer) from public, anon;
grant execute on function public.hermit_set_combo_state(text, text) to authenticated;
grant execute on function public.hermit_combo_summary(integer) to authenticated;
grant execute on function public.get_bot_combos() to anon, authenticated;
