-- ============================================================
-- Elemental bots roster — run once against the Godaigo Supabase
-- project (lovybwpypkaarstnvkbz) via the SQL editor / service role.
--
-- Replaces the personal "Bot Tycoon" stable with five FIXED,
-- system-owned bots (one per element). System-owned = owner IS NULL.
-- The client only ever READS these rows (deployed_bots has public
-- SELECT); identity is resolved by nickname at runtime
-- (js/bot-elements.js resolveIds()), so no ids are hardcoded.
-- ============================================================

begin;

-- 1. System bots have no owner.
alter table public.deployed_bots alter column owner drop not null;

-- 2. Repurpose the existing "The Void Knight" row as the system void bot.
update public.deployed_bots
   set owner = null, is_active = true
 where nickname = 'The Void Knight';

-- 3. Seed the other four elemental bots. weights = current community
--    champion snapshot (a display fallback only — the live game always
--    layers the per-element lean over the freshly-fetched champion).
insert into public.deployed_bots (owner, nickname, weights, is_active)
select null,
       v.nickname,
       coalesce(
         (select weights from public.bot_champion_weights
           order by win_rate desc nulls last limit 1),
         '{}'::jsonb),
       true
from (values ('Terran Sentinel'),
             ('Tidewarden'),
             ('Emberkin'),
             ('Galewalker')) as v(nickname)
where not exists (
    select 1 from public.deployed_bots d
     where d.owner is null and d.nickname = v.nickname);

-- 4. Give the four new bots permanent ladder positions
--    (the void row is already ranked).
do $$
declare bid bigint;
begin
  for bid in
    select id from public.deployed_bots
     where owner is null
       and nickname in ('Terran Sentinel','Tidewarden','Emberkin','Galewalker')
  loop
    perform public.ladder_ensure_bot(bid);
  end loop;
end $$;

-- 5. (Optional) retire any leftover personally-owned bots so they drop
--    off the ladder display. Safe to skip if there are none.
update public.deployed_bots set is_active = false where owner is not null;

commit;

-- Verify:
--   select id, nickname, owner, is_active from public.deployed_bots order by id;
--   select l.rank, d.nickname from public.ladder l
--     join public.deployed_bots d on d.id = l.bot_id order by l.rank;
