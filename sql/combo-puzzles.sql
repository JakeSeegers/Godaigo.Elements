-- Puzzle training (bot combo plan, Phase 4b). Applied 2026-09-26 (migration combo_puzzles).
--
-- A puzzle is a mined combo moment (combo_candidates, sql/combo-miner.sql):
-- the match, the seat, the turn the combo started, how many of that seat's
-- turns it took and how much the player gained. The hermit's browser
-- replays the match to that turn in a hidden frame, lets the bot play the
-- seat for the same number of turns and compares the bot's gain with the
-- player's (js/replay-viewer.js runPuzzle / solvePuzzles). Bots' own combos
-- are never puzzles.

create or replace function public.hermit_list_puzzles(p_limit integer default 40)
returns table (id bigint, match_id bigint, seat integer, start_turn integer, end_turn integer,
               turns integer, gain real, trust real, signature text)
language plpgsql stable security definer set search_path to 'public'
as $$
begin
  if not public.is_hermit() then raise exception 'not authorized'; end if;
  return query
    select c.id, c.match_id, c.seat, c.start_turn, c.end_turn, c.turns, c.gain, c.trust, c.signature
    from combo_candidates c
    join matches m on m.id = c.match_id
    where not c.is_bot and c.gain > 0 and c.start_turn is not null and m.status = 'finished'
    order by c.gain * greatest(c.trust, 0.05) desc
    limit greatest(1, least(coalesce(p_limit, 40), 200));
end;
$$;

revoke all on function public.hermit_list_puzzles(integer) from public, anon;
grant execute on function public.hermit_list_puzzles(integer) to authenticated;
