-- ============================================================
-- bot_episodes — episodic "what happened after decisions like this"
-- memory for js/bot-memory.js (window.BotMemory), against the Godaigo
-- Supabase project (lovybwpypkaarstnvkbz).
--
-- One row per bot decision whose immediate evaluateSnapshot() swing
-- cleared BotMemory.SWING_THRESHOLD ("extremely good or extremely
-- bad"). Retrieved by similarity (BotMemory.retrieveSimilar()) to seed
-- js/bot.js's mctsPick() root-level UCB1 arms with bonus pseudo-visits
-- — a PRIOR, never an override of the search itself.
--
-- Same append-only, RLS shape as bot_champion_weights: anyone can
-- read, only an authenticated user can insert, and only as their own
-- row (created_by = auth.uid()).
--
-- Already applied live via mcp__Supabase__apply_migration
-- (migration name: create_bot_episodes) — this file documents that
-- migration in the repo; it is not re-run automatically.
-- ============================================================

create table public.bot_episodes (
    id bigint generated always as identity primary key,
    activated_count integer not null,
    ap_remaining integer not null,
    pool_total integer not null,
    pool_needed integer not null,
    hand_plus_active integer not null,
    eval_score double precision not null,
    action_key text not null,
    swing double precision not null,
    source text not null default 'bot-arena',
    created_by uuid references auth.users(id),
    created_at timestamptz not null default now()
);

comment on table public.bot_episodes is 'Episodic memory for bot decision-making (js/bot-memory.js): one row per bot decision whose immediate evaluateSnapshot() swing cleared a threshold ("extremely good or extremely bad"). Retrieved by similarity to seed MCTS (bot.js mctsPick()) root priors, never used to override a search outright. Append-only, same shape as bot_champion_weights.';

alter table public.bot_episodes enable row level security;

create policy "bot_episodes: anyone can select" on public.bot_episodes
    for select using (true);

create policy "bot_episodes: auth can insert own" on public.bot_episodes
    for insert with check ((select auth.uid()) = created_by);

create index bot_episodes_created_at_idx on public.bot_episodes (created_at desc);
