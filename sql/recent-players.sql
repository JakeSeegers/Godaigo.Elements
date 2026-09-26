-- Recent players + "play again together" invites (2026-09-26).
-- Applied as migration recent_players. Client: js/social.js.

-- People you played with in recorded online games (last 30 days), newest
-- first, with how many games you shared and whether you are friends.
create or replace function public.my_recent_players()
returns table (user_id uuid, name text, name_color text, last_played timestamptz, games integer, friend_state text)
language sql stable security definer set search_path to 'public'
as $$
  with mine as (
    select m.id, m.started_at, m.players from matches m
    where m.players @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))
      and m.started_at > now() - interval '30 days'
    order by m.started_at desc limit 40
  ), others as (
    select (s->>'user_id')::uuid as uid, max(mine.started_at) as last_played, count(*)::int as games
    from mine, jsonb_array_elements(mine.players) s
    where nullif(s->>'user_id', '') is not null and (s->>'user_id')::uuid <> auth.uid()
    group by 1
  )
  select o.uid, p.display_name::text, p.name_color, o.last_played, o.games,
         case when public._are_friends(auth.uid(), o.uid) then 'friend'
              when exists (select 1 from friend_links where requester = auth.uid() and addressee = o.uid) then 'outgoing'
              when exists (select 1 from friend_links where requester = o.uid and addressee = auth.uid()) then 'incoming'
              else 'none' end
  from others o join user_profiles p on p.user_id = o.uid
  order by o.last_played desc
  limit 15;
$$;

-- Played in the same recorded game within the last 3 hours.
create or replace function public._played_recently(a uuid, b uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (select 1 from matches m
                 where coalesce(m.ended_at, m.last_move_at, m.started_at) > now() - interval '3 hours'
                   and m.players @> jsonb_build_array(jsonb_build_object('user_id', a::text))
                   and m.players @> jsonb_build_array(jsonb_build_object('user_id', b::text)));
$$;
revoke all on function public._played_recently(uuid, uuid) from public, anon, authenticated;

-- send_game_invite: friends, or anyone you just played with ("play again").
create or replace function public.send_game_invite(p_user uuid)
returns text language plpgsql security definer set search_path to 'public'
as $$
declare
  me uuid := auth.uid();
  v_game integer;
begin
  if me is null then raise exception 'not signed in'; end if;
  if not (public._are_friends(me, p_user) or public._played_recently(me, p_user)) then return 'not_friends'; end if;
  select pl.game_id into v_game from players pl join game_room g on g.id = pl.game_id
  where pl.user_id = me and g.status = 'waiting' order by pl.created_at desc limit 1;
  if v_game is null then return 'no_room'; end if;
  if (select count(*) from friend_invites where from_user = me and created_at > now() - interval '1 minute') >= 5
     or exists (select 1 from friend_invites where from_user = me and to_user = p_user
                and created_at > now() - interval '20 seconds') then
    return 'too_many';
  end if;
  delete from friend_invites where created_at < now() - interval '1 day';
  delete from friend_invites where from_user = me and to_user = p_user;
  insert into friend_invites (from_user, to_user, game_id) values (me, p_user, v_game);
  return 'sent';
end;
$$;

revoke all on function public.my_recent_players() from public, anon;
grant execute on function public.my_recent_players() to authenticated;
