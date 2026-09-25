-- Phase 4, part 1: the hermit's suspicious-player screen.
-- Applied 2026-09-25 (migration hermit_players). Hermit-only.
--
-- hermit_player_overview(days): one row per human player who played an
-- online game in the last `days` days, built only from server-side records
-- (matches, game_rewards), so players cannot fake it. `score` puts the
-- players worth a look at the top; `flags` says why in words.
--
-- hermit_player_matches(user): that player's recent games with their check
-- state, for the Watch / Check buttons.

create or replace function public.hermit_player_overview(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_hermit() then raise exception 'not authorized'; end if;
  return coalesce((
    with seats as (
      select m.id, m.status, m.winner_index, m.win_type, m.disputed, m.desync_count, m.check_status,
             m.check_detail, m.players,
             extract(epoch from (coalesce(m.ended_at, m.last_move_at) - m.started_at))::integer as secs,
             (p->>'user_id')::uuid as uid, (p->>'index')::integer as idx
      from matches m, jsonb_array_elements(m.players) p
      where m.started_at > now() - make_interval(days => greatest(coalesce(p_days, 30), 1))
        and m.status in ('finished', 'abandoned')
        and p->>'user_id' is not null
        and not coalesce((p->>'is_bot')::boolean, false)
    ),
    per as (
      select uid,
             count(*) as games,
             count(*) filter (where winner_index = idx) as wins,
             count(*) filter (where status = 'abandoned') as abandoned,
             count(*) filter (where winner_index = idx and coalesce(win_type, 'scrolls') = 'scrolls' and secs < 240) as fast_wins,
             count(*) filter (where winner_index = idx and win_type = 'last_standing') as last_standing_wins,
             count(*) filter (where winner_index = idx and disputed) as disputed_wins,
             count(*) filter (where winner_index = idx and check_status = 'mismatch'
                                and (check_detail->>'winnerOk') = 'false') as unconfirmed_wins,
             count(*) filter (where check_status = 'mismatch') as mismatch_games,
             count(*) filter (where desync_count > 0) as desync_games,
             count(*) filter (where check_status is not null) as checked_games,
             min(secs) filter (where winner_index = idx) as fastest_win_s
      from seats group by uid
    ),
    -- Wins against each human opponent: a large share against one person
    -- can mean a second account feeding wins.
    opp as (
      select s.uid, (o->>'user_id')::uuid as opp_uid, count(*) as n
      from seats s, jsonb_array_elements(s.players) o
      where s.winner_index = s.idx and o->>'user_id' is not null
        and (o->>'user_id')::uuid <> s.uid and not coalesce((o->>'is_bot')::boolean, false)
      group by 1, 2
    ),
    top_opp as (
      select distinct on (uid) uid, opp_uid, n from opp order by uid, n desc
    ),
    pend as (
      select user_id as uid, count(*) as pending from game_rewards where status = 'pending' group by 1
    ),
    scored as (
      select per.*, coalesce(pend.pending, 0) as pending,
             t.opp_uid, coalesce(t.n, 0) as top_opp_wins,
             (per.unconfirmed_wins * 4 + per.disputed_wins * 4 + per.fast_wins * 2
              + coalesce(pend.pending, 0) + (per.mismatch_games - per.unconfirmed_wins)
              + case when per.wins >= 5 and coalesce(t.n, 0)::numeric / per.wins >= 0.6 then 3 else 0 end
              + case when per.desync_games > 0 then 1 else 0 end) as score
      from per
      left join pend on pend.uid = per.uid
      left join top_opp t on t.uid = per.uid
    )
    select jsonb_agg(jsonb_build_object(
             'user_id', s.uid,
             'name', coalesce(u.display_name, 'Unknown'),
             'name_color', u.name_color,
             'games', s.games, 'wins', s.wins, 'abandoned', s.abandoned,
             'fast_wins', s.fast_wins, 'fastest_win_s', s.fastest_win_s,
             'last_standing_wins', s.last_standing_wins,
             'disputed_wins', s.disputed_wins, 'unconfirmed_wins', s.unconfirmed_wins,
             'mismatch_games', s.mismatch_games, 'desync_games', s.desync_games,
             'checked_games', s.checked_games, 'pending', s.pending,
             'top_opponent', (select display_name from user_profiles where user_id = s.opp_uid),
             'top_opponent_wins', s.top_opp_wins,
             'score', s.score,
             'flags', array_remove(array[
               case when s.unconfirmed_wins > 0 then s.unconfirmed_wins || ' win(s) not confirmed by replay' end,
               case when s.disputed_wins > 0 then s.disputed_wins || ' disputed win(s)' end,
               case when s.fast_wins > 0 then s.fast_wins || ' win(s) under 4 min' end,
               case when s.pending > 0 then s.pending || ' win(s) waiting for a witness' end,
               case when s.mismatch_games - s.unconfirmed_wins > 0 then (s.mismatch_games - s.unconfirmed_wins) || ' game(s) with replay differences' end,
               case when s.wins >= 5 and s.top_opp_wins::numeric / s.wins >= 0.6
                    then round(100.0 * s.top_opp_wins / s.wins) || '% of wins vs one player' end,
               case when s.desync_games > 0 then s.desync_games || ' game(s) with out-of-sync reports' end
             ], null))
           order by s.score desc, s.games desc)
    from scored s left join user_profiles u on u.user_id = s.uid
  ), '[]'::jsonb);
end;
$$;

create or replace function public.hermit_player_matches(p_user uuid, p_limit integer default 30)
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
    from (select * from matches
          where status in ('finished', 'abandoned')
            and players @> jsonb_build_array(jsonb_build_object('user_id', p_user::text))
          order by started_at desc
          limit least(greatest(coalesce(p_limit, 30), 1), 100)) m
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.hermit_player_overview(integer) from public, anon;
revoke all on function public.hermit_player_matches(uuid, integer) from public, anon;
grant execute on function public.hermit_player_overview(integer) to authenticated;
grant execute on function public.hermit_player_matches(uuid, integer) to authenticated;
