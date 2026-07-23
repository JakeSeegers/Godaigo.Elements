# The Void Knight — public leader bot (v1, shipped 2026-07-23)

> STATUS: v1 LIVE. Built in one pass from the design conversation of
> 2026-07-23; extends (and partially supersedes) docs/bot-tycoon-proposal.md.
> The decisions below were made explicitly by the user — do not re-litigate
> them without asking.

## Concept

**The Void Knight** is the system-owned public leader bot. It replaces the
anonymous `bot_champion_weights` top row as the player-facing "champion".
Everyone can see it on the Leaderboard tab and do two things to it:

- **Challenge** — pure evaluation, no training. Your ACTIVE deployed bot
  plays a mirror-paired local series against it (20 games, ≥55% of decided
  games to win, ≥10 decided). Win → the Knight **copies your bot's weights**
  (a fork — you keep evolving yours independently), you take the
  reigning-champion accolade shown on its card + 50 gold. **No XP** — XP is
  only ever awarded for winning games.
- **Train** — public good. Routes to the Bot Training panel in leader mode:
  a hill climb anchored to the Knight's OWN weights. A confirmed improvement
  appends a stronger Knight for everyone and pays a 25 gold bounty. The
  trainer's local weights/bots are untouched either way.

The champion **title is historical**: it names the last bot to dethrone the
Knight, and holds even after community training pushes the Knight past that
bot's strength — until someone else dethrones it.

## Data model

`public.void_knight` (append-only; the CURRENT Knight = newest row / max id):
`weights jsonb`, `update_type` ('seed'|'training'|'dethrone'), `updated_by`,
`champion_name`/`champion_owner` (the accolade, set on dethrone),
`confirm_wins/losses/draws`, `created_at`. RLS: public SELECT,
authenticated INSERT with `auth.uid() = updated_by`. Seeded from the
strongest `bot_champion_weights` row.

## Anchor-follows-button (training rework)

Which weights a hill climb starts from and must beat is decided by WHERE the
run was launched, not by the method (`runHillClimbTraining` in game-ui.js):

| Entry point | Anchor / confirm vs | On success |
|---|---|---|
| Stable "Train" (`opts.sourceBotId`) | the bot's OWN weights | written to that bot's row only — no champion share, no XP/gold |
| Leaderboard "Train" (`opts.leaderWeights`) | the Void Knight's weights | new `void_knight` row + 25 gold; local weights restored |
| Ambient (cheat panel, no opts) | online champion (legacy) | unchanged: apply + share to `bot_champion_weights` |

The old "Stable hill climb dethrones the online champion for 250 XP + 50
gold" behavior is REMOVED — dethroning now lives exclusively on the
leaderboard's Challenge button, gold-only.

## Bot identity rules (shipped alongside)

- **Globally unique nicknames** (case-insensitive) via DB unique index;
  existing cross-owner duplicates were suffixed. Client flows surface the
  "taken by another player" case. Names matching /void\s*knight/i are
  reserved.
- **One leaderboard bot per player**: `is_active` = visible on the
  leaderboard. Activating a bot (Stable toggle) or deploying a new one
  benches all your others. All owned bots stay trainable regardless.
- **Hide bots** viewer-side toggle on the Leaderboard tab (localStorage
  `godaigo_hide_bots`).

## Petals (bot attribute view)

Clicking a bot's name in the Stable opens a five-petal flower — one petal
per element, scored by how far the bot's weights deviate from
`DEFAULT_WEIGHTS` along the pre-validated elemental bundles from
bot-tycoon-proposal § ELEMENTAL WEIGHT-BUNDLE ITEMS (tanh-squashed;
50 = stock). Purely descriptive. `GAMI_PETAL_BUNDLES` in gamification-ui.js
is the single source of the bundle definitions — the future elemental
consumable items should reuse it.

## Explicitly deferred (design settled, not built)

1. **Positional ladder** replacing the XP-sorted leaderboard: humans + bots
   on one ladder, seeded once from XP, moved ONLY by head-to-head challenges
   (winner takes loser's position); XP stays for profile stats/unlocks.
   Maybe a tournament structure instead — user is considering.
2. **Stable self-training (target + gauntlet)**: pick one bot to improve,
   your other bots form the opponent field — needs the CLI hall-of-fame
   gauntlet ported into in-browser `hillClimb()`.
3. **Practice vs my bot**: a normal local game against a specific deployed
   bot's weights. Prerequisite for the later imitation-learning idea
   (perceptron-style weight nudges from human action logs).
4. **Challenge trust**: results are client-run and self-reported. Cheap v2:
   commit-then-play (register seed+weights before the series) + random
   deterministic replay audits. Noted, deliberately not in v1.
