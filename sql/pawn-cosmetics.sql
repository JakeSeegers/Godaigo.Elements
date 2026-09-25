-- Pawn decorations: rims, bases, trails (2026-09-25, migration pawn_cosmetics).
-- Bought with buy_cosmetic (prices in cosmetic_price, sql/cosmetics.sql),
-- owned in user_profiles.cosmetics_owned. One equipped item per slot:
--   pawn_rim / pawn_base / pawn_trail  (item id or null)
-- Public read (everyone draws everyone's pawn); changed only by equip_pawn.
-- Decorations never cover the pawn's colour (js/pawn-cosmetics.js).

alter table public.user_profiles add column if not exists pawn_rim text;
alter table public.user_profiles add column if not exists pawn_base text;
alter table public.user_profiles add column if not exists pawn_trail text;

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
    when 'pawn_rim_gold'     then 100
    when 'pawn_rim_silver'   then 100
    when 'pawn_rim_runes'    then 150
    when 'pawn_base_lotus'   then 125
    when 'pawn_base_plinth'  then 125
    when 'pawn_trail_ink'    then 150
    when 'pawn_trail_embers' then 150
    when 'pawn_trail_drops'  then 150
    when 'pawn_trail_leaves' then 150
    when 'pawn_trail_void'   then 150
  end;
$$;

-- Equip an owned pawn item in its slot, or pass null to clear the slot.
create or replace function public.equip_pawn(p_slot text, p_id text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if p_slot not in ('rim', 'base', 'trail') then raise exception 'bad slot'; end if;
  if p_id is not null and left(p_id, length('pawn_' || p_slot || '_')) <> 'pawn_' || p_slot || '_' then
    raise exception 'wrong slot';
  end if;
  if p_id is not null and not exists (select 1 from user_profiles where user_id = v_uid and p_id = any(cosmetics_owned)) then
    raise exception 'not owned';
  end if;
  update user_profiles set
    pawn_rim   = case when p_slot = 'rim'   then p_id else pawn_rim end,
    pawn_base  = case when p_slot = 'base'  then p_id else pawn_base end,
    pawn_trail = case when p_slot = 'trail' then p_id else pawn_trail end,
    updated_at = now()
  where user_id = v_uid;
end;
$$;

revoke all on function public.equip_pawn(text, text) from public, anon;
grant execute on function public.equip_pawn(text, text) to authenticated;
