-- Friends, online status, game invites and player cards (2026-09-26).
-- Applied as migration `friends`. Client: js/social.js.
--
-- friend_links: one row per pair. status 'pending' (requester asked) or
-- 'accepted'. Only reachable through the RPCs below (RLS on, no policies).
-- friend_invites: "come join my room" from a friend; the receiver reads
-- them with my_game_invites(). Live online status itself is Supabase
-- Realtime presence (channel godaigo-online, see js/social.js); last_seen_at
-- is the fallback for "last seen 2 h ago". hide_online = "appear offline".

alter table user_profiles add column if not exists last_seen_at timestamptz;
alter table user_profiles add column if not exists hide_online boolean not null default false;

create table if not exists friend_links (
  requester    uuid not null references auth.users(id) on delete cascade,
  addressee    uuid not null references auth.users(id) on delete cascade,
  status       text not null check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  primary key (requester, addressee),
  check (requester <> addressee)
);
create index if not exists friend_links_addressee on friend_links (addressee);
alter table friend_links enable row level security;

create table if not exists friend_invites (
  id          bigserial primary key,
  from_user   uuid not null references auth.users(id) on delete cascade,
  to_user     uuid not null references auth.users(id) on delete cascade,
  game_id     integer not null,
  created_at  timestamptz not null default now()
);
create index if not exists friend_invites_to on friend_invites (to_user, created_at);
alter table friend_invites enable row level security;

create or replace function public._are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (select 1 from friend_links
                 where status = 'accepted'
                   and ((requester = a and addressee = b) or (requester = b and addressee = a)));
$$;
revoke all on function public._are_friends(uuid, uuid) from public, anon, authenticated;

-- Send a request by user id or by username. Returns:
-- 'sent', 'accepted' (they had asked you already), 'already', 'pending',
-- 'not_found', 'self', 'limit'.
create or replace function public.send_friend_request(p_user uuid default null, p_name text default null)
returns text language plpgsql security definer set search_path to 'public'
as $$
declare
  me uuid := auth.uid();
  them uuid := p_user;
begin
  if me is null then raise exception 'not signed in'; end if;
  if them is null then
    select user_id into them from user_profiles
    where lower(display_name) = lower(trim(coalesce(p_name, ''))) order by created_at limit 1;
  end if;
  if them is null or not exists (select 1 from user_profiles where user_id = them) then return 'not_found'; end if;
  if them = me then return 'self'; end if;
  if public._are_friends(me, them) then return 'already'; end if;
  if exists (select 1 from friend_links where requester = me and addressee = them) then return 'pending'; end if;
  if exists (select 1 from friend_links where requester = them and addressee = me and status = 'pending') then
    update friend_links set status = 'accepted', accepted_at = now() where requester = them and addressee = me;
    return 'accepted';
  end if;
  if (select count(*) from friend_links where requester = me and status = 'pending') >= 50 then return 'limit'; end if;
  insert into friend_links (requester, addressee, status) values (me, them, 'pending');
  return 'sent';
end;
$$;

-- Accept or decline a request someone sent you.
create or replace function public.respond_friend_request(p_user uuid, p_accept boolean)
returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_accept then
    update friend_links set status = 'accepted', accepted_at = now()
    where requester = p_user and addressee = auth.uid() and status = 'pending';
  else
    delete from friend_links where requester = p_user and addressee = auth.uid() and status = 'pending';
  end if;
end;
$$;

-- Remove a friend, or cancel your own request (either direction).
create or replace function public.remove_friend(p_user uuid)
returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from friend_links
  where (requester = auth.uid() and addressee = p_user) or (requester = p_user and addressee = auth.uid());
end;
$$;

-- Your friends and requests. last_seen_at is null for friends who appear offline.
create or replace function public.my_friends()
returns table (user_id uuid, name text, name_color text, state text, last_seen_at timestamptz, hidden boolean)
language sql stable security definer set search_path to 'public'
as $$
  select p.user_id, p.display_name::text, p.name_color,
         case when l.status = 'accepted' then 'friend'
              when l.requester = auth.uid() then 'outgoing' else 'incoming' end,
         case when l.status = 'accepted' and not p.hide_online then p.last_seen_at end,
         (l.status = 'accepted' and p.hide_online)
  from friend_links l
  join user_profiles p on p.user_id = case when l.requester = auth.uid() then l.addressee else l.requester end
  where l.requester = auth.uid() or l.addressee = auth.uid();
$$;

-- Called every few minutes while the game is open (skipped when hidden).
create or replace function public.touch_last_seen()
returns void language sql security definer set search_path to 'public'
as $$
  update user_profiles set last_seen_at = now() where user_id = auth.uid() and not hide_online;
$$;

create or replace function public.set_hide_online(p_hide boolean)
returns void language sql security definer set search_path to 'public'
as $$
  update user_profiles set hide_online = coalesce(p_hide, false),
         last_seen_at = case when coalesce(p_hide, false) then null else last_seen_at end
  where user_id = auth.uid();
$$;

-- Invite a friend to the waiting room you are in. Returns 'sent',
-- 'not_friends', 'no_room', 'too_many' (5 per minute, or the same friend
-- again within 20 seconds; a new invite replaces the old one).
create or replace function public.send_game_invite(p_user uuid)
returns text language plpgsql security definer set search_path to 'public'
as $$
declare
  me uuid := auth.uid();
  v_game integer;
begin
  if me is null then raise exception 'not signed in'; end if;
  if not public._are_friends(me, p_user) then return 'not_friends'; end if;
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

-- Invites for you from the last 10 minutes whose room is still waiting.
create or replace function public.my_game_invites()
returns table (id bigint, from_user uuid, from_name text, game_id integer, created_at timestamptz)
language sql stable security definer set search_path to 'public'
as $$
  select i.id, i.from_user, p.display_name::text, i.game_id, i.created_at
  from friend_invites i
  join user_profiles p on p.user_id = i.from_user
  join game_room g on g.id = i.game_id and g.status = 'waiting'
  where i.to_user = auth.uid() and i.created_at > now() - interval '10 minutes'
  order by i.created_at desc;
$$;

create or replace function public.dismiss_game_invite(p_id bigint)
returns void language sql security definer set search_path to 'public'
as $$
  delete from friend_invites where id = p_id and to_user = auth.uid();
$$;

-- Player card: public info about one account.
create or replace function public.get_player_card(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $$
declare
  p user_profiles;
  me uuid := auth.uid();
  v_state text := 'none';
  v_rank integer;
begin
  select * into p from user_profiles where user_id = p_user;
  if not found then return null; end if;
  if me = p_user then v_state := 'self';
  elsif public._are_friends(me, p_user) then v_state := 'friend';
  elsif exists (select 1 from friend_links where requester = me and addressee = p_user) then v_state := 'outgoing';
  elsif exists (select 1 from friend_links where requester = p_user and addressee = me) then v_state := 'incoming';
  end if;
  select rank into v_rank from ladder where user_id = p_user and entity_type = 'player' limit 1;
  return jsonb_build_object(
    'user_id', p.user_id,
    'name', p.display_name,
    'level', p.current_level,
    'name_color', p.name_color,
    'pawn_rim', p.pawn_rim, 'pawn_base', p.pawn_base, 'pawn_trail', p.pawn_trail,
    'rank', v_rank,
    'games', coalesce((p.stats->>'games_played')::int, 0),
    'wins', coalesce((p.stats->>'games_won')::int, 0),
    'elements', coalesce((p.stats->>'elements_activated')::int, 0),
    'member_since', p.created_at,
    'friend_state', v_state,
    'last_seen_at', case when v_state = 'friend' and not p.hide_online then p.last_seen_at end,
    'replays', coalesce((
      select jsonb_agg(r order by r->>'started_at' desc) from (
        select jsonb_build_object('id', m.id, 'started_at', m.started_at,
                 'won', exists (select 1 from jsonb_array_elements(m.players) s
                                where s->>'user_id' = p_user::text and (s->>'index')::int = m.winner_index)) r
        from matches m
        where m.is_public and m.status = 'finished'
          and m.players @> jsonb_build_array(jsonb_build_object('user_id', p_user::text))
        order by m.started_at desc limit 5) x), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.send_friend_request(uuid, text) from public, anon;
revoke all on function public.respond_friend_request(uuid, boolean) from public, anon;
revoke all on function public.remove_friend(uuid) from public, anon;
revoke all on function public.my_friends() from public, anon;
revoke all on function public.touch_last_seen() from public, anon;
revoke all on function public.set_hide_online(boolean) from public, anon;
revoke all on function public.send_game_invite(uuid) from public, anon;
revoke all on function public.my_game_invites() from public, anon;
revoke all on function public.dismiss_game_invite(bigint) from public, anon;
revoke all on function public.get_player_card(uuid) from public, anon;
grant execute on function public.send_friend_request(uuid, text) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.my_friends() to authenticated;
grant execute on function public.touch_last_seen() to authenticated;
grant execute on function public.set_hide_online(boolean) to authenticated;
grant execute on function public.send_game_invite(uuid) to authenticated;
grant execute on function public.my_game_invites() to authenticated;
grant execute on function public.dismiss_game_invite(bigint) to authenticated;
grant execute on function public.get_player_card(uuid) to authenticated;
