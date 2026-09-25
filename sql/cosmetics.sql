-- Name colours on the server.
-- Applied 2026-09-24 (migration cosmetics_server).
--
-- Before this, owned and equipped name colours lived only in the buyer's
-- browser (localStorage), so nobody else could see them (the leaderboard
-- could not colour names) and a player could "own" a colour by editing
-- localStorage. Now:
--   user_profiles.cosmetics_owned  text[]  colours bought
--   user_profiles.name_color       text    equipped colour id, or null
-- Clients cannot write either column (user_profiles UPDATE is granted only
-- on stats / updated_at / skip_intro); they change only through
-- buy_cosmetic() and equip_cosmetic() below. Everyone can read them (public
-- SELECT on user_profiles), which is what the leaderboard needs.
-- Prices must match NAME_COLORS in js/cosmetics-system.js.

alter table public.user_profiles add column if not exists cosmetics_owned text[] not null default '{}';
alter table public.user_profiles add column if not exists name_color text;

create or replace function public.cosmetic_price(p_id text)
returns integer
language sql
immutable
as $$
  select case p_id
    when 'name_gold'    then 50
    when 'name_crimson' then 50
    when 'name_blue'    then 50
    when 'name_emerald' then 50
    when 'name_purple'  then 75
    when 'name_rainbow' then 200
    -- 2026-09-25 (migration cosmetics_more_styles): elements, metals, animated
    when 'name_el_earth' then 100
    when 'name_el_water' then 100
    when 'name_el_fire'  then 100
    when 'name_el_wind'  then 100
    when 'name_el_void'  then 100
    when 'name_silver'   then 75
    when 'name_bronze'   then 75
    when 'name_obsidian' then 100
    when 'name_shimmer'  then 150
    when 'name_ember'    then 175
    when 'name_tide'     then 175
    when 'name_voidpulse' then 175
    when 'name_glitch'   then 250
  end;
$$;

-- Buy a colour: pays the server price, adds it to cosmetics_owned. Returns
-- the new gold total.
create or replace function public.buy_cosmetic(p_id text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid   uuid := auth.uid();
  v_price integer := public.cosmetic_price(p_id);
  v_gold  integer;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if v_price is null then raise exception 'unknown item'; end if;
  update user_profiles
  set gold = gold - v_price,
      cosmetics_owned = array_append(cosmetics_owned, p_id),
      updated_at = now()
  where user_id = v_uid and gold >= v_price and not (p_id = any(cosmetics_owned))
  returning gold into v_gold;
  if not found then
    if exists (select 1 from user_profiles where user_id = v_uid and p_id = any(cosmetics_owned)) then
      raise exception 'already owned';
    end if;
    raise exception 'not enough gold';
  end if;
  insert into user_activities (user_id, activity_type, gold_spent, description, metadata)
  values (v_uid, 'gold_spent', v_price, 'Name colour: ' || p_id, jsonb_build_object('item', p_id));
  return v_gold;
end;
$$;

-- Equip an owned colour, or pass null to take it off.
create or replace function public.equip_cosmetic(p_id text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  update user_profiles set name_color = p_id, updated_at = now()
  where user_id = v_uid and (p_id is null or p_id = any(cosmetics_owned));
  if not found then raise exception 'not owned'; end if;
end;
$$;

revoke all on function public.buy_cosmetic(text) from public, anon;
revoke all on function public.equip_cosmetic(text) from public, anon;
grant execute on function public.buy_cosmetic(text) to authenticated;
grant execute on function public.equip_cosmetic(text) to authenticated;

-- Carry over the one purchase the server has a record of (older purchases
-- were only saved in the browser).
update user_profiles p
set cosmetics_owned = array(select distinct unnest(p.cosmetics_owned || array['name_rainbow']))
where exists (select 1 from user_activities a
              where a.user_id = p.user_id and a.description = 'Name colour: Rainbow');
