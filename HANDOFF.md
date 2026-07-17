# HANDOFF — Godaigo bot-training co-pilot

You (a **local** Claude Code running on the user's Windows machine) are picking up
a bot-tuning effort from a cloud Claude Code session. The cloud session can't
reach the user's hardware, network, or Supabase — you can, which is why the loop
is moving to you. Read this file first, then `planning/current.md` (detailed
running log, newest entries on top) and `docs/bot-roadmap.md` (bot strategy) for
depth.

---

## 0. FIRST — sync git (the user's local ref is stale)
Work lives on branch `claude/game-testing-player-count-0oxsn6`. The user's local
`origin/...` pointer is behind, so a plain `git reset --hard origin/...` keeps
snapping back to an old commit. Fetch that branch explicitly and reset to exactly
what you fetched:
```
git fetch origin claude/game-testing-player-count-0oxsn6
git reset --hard FETCH_HEAD
git log --oneline -1
```
Sanity check you have the latest: `tools/arena-headless.mjs` should contain the
string `ONLINE CHAMPION from Supabase`. (The user is on Windows PowerShell — `&&`
is NOT a valid separator there; give one command per line.)

## 1. What this is
Godaigo.Elements — a browser hex-tile strategy game (vanilla JS, SVG board,
Supabase). We're improving the AI bot the game plays against. Bot logic:
`js/bot.js` (utility scorer + hybrid lookahead search); weights live in
`BotSystem.WEIGHTS`. The community "champion" weights are stored in the Supabase
table `bot_champion_weights` (the highest `win_rate` row auto-loads for every
player).

## 2. The training tool — `tools/arena-headless.mjs`
Runs the REAL game headless in Chromium and tunes bot weights.
- `--hillclimb` = champion-anchored (1+λ) climber: hold a champion fixed, spawn λ
  mutant challengers, each plays N games vs the champion, promote one ONLY if it
  clears a real win-rate margin. Monotonic — the champion can only go up. This is
  the reliable trainer. (The old GA, `evolve()`, was a noise-dominated random
  walk — don't use it for real tuning.)
- `--hc-session NAME` = resumable. Run the SAME command in 20–40 min chunks; it
  continues where it left off (champion / hall-of-fame / round history persist to
  `tools/.cache/hc-session-NAME.json`). Ctrl-C is safe (writes an apply file and
  saves state).
- **ANCHORING (the thing we just fixed — critical):** a fresh session fetches the
  current ONLINE champion from Supabase as its baseline and prints
  `baseline = ONLINE CHAMPION from Supabase (win_rate X)`. If it can't reach
  Supabase it **ABORTS** rather than silently train against weak DEFAULT weights
  (that silent fallback was the bug — it produced champions that beat defaults
  but lost online). `--hc-allow-defaults` is an explicit override for offline
  runs. NOTE: a session that was created before this fix is permanently anchored
  to defaults — start a FRESH session name.
- Key knobs: `--hc-games N` (games per challenger trial — **use 30+; 20 is too
  noisy and promotes flukes**), `--shards 6` (parallel across cores),
  `--hc-hof 4` (Phase-2 hall-of-fame gauntlet — its behavioral verification is
  still PENDING, so prefer `--hc-hof 0`, the fully-verified single-champion
  path).
- Output: `tools/.cache/apply-champion.txt`. Section (1) = paste into the game
  console (F12) to watch YOUR champion locally (it sets `godaigo_bot_weights_pin`
  so the online champion doesn't overwrite it; `bot.js` honors that flag).
  Section (2) = submit it to the online champion table.

## 3. THE OPEN QUESTION (this is the whole point right now)
Trained champions reliably beat DEFAULT weights, but once **properly anchored to
the online champion** they do NOT clearly beat it. The first correctly-anchored
run promoted a challenger on a noisy 20-game trial, then it lost the confirm
**4–16 (20%)** to the online champion. So:

**Are we at the weight-tuning ceiling?** — can *any* re-weighting of the bot's
existing features beat the online champion, or does it need a NEW feature (a
"sense" the bot doesn't currently have — e.g. valuing spatial denial or
resource-hoarding) that no multiplier can create?

## 4. The next experiment (do this with the user)
Run a properly-anchored session and let it climb several honest rounds:
```
node tools/arena-headless.mjs --hillclimb --hc-session anchored1 --hc-rounds 1 --shards 6 --hc-games 30 --hc-hof 0
```
Resume the same command each chunk. Read the verdict each time:
- **IMPROVED (≥55% vs the online champion)** → weight-tuning still has headroom;
  keep climbing, then apply/submit the champion.
- **Keeps failing over several honest rounds** → that's the answer: weight-tuning
  ceiling. Pivot away from tuning multipliers. Instead, figure out what the
  online champion does that ours can't *perceive*, and add it as a new evaluation
  FEATURE in `js/bot.js` (`evaluateSnapshot()` and/or `scoreAction()`). Watching a
  real game via the pinned apply-file is the best way to spot the missing sense.

## 5. House rules
- **Verify before committing.** This repo's discipline: exercise any bot-logic
  change against the REAL game headless (via `tools/arena-headless.mjs` or a small
  Playwright script), ideally with a negative control. Don't commit bot changes on
  reasoning alone. (The offline arena IS the real client headless — same code
  paths — so it's a faithful test; the one thing it doesn't exercise is real
  multiplayer code paths, so MP-specific bugs still need a live look.)
- Update `planning/current.md` after meaningful work (newest entry on top).
- Develop on `claude/game-testing-player-count-0oxsn6`; commit + push there.
- Recent known-good fixes to be aware of: Take Flight can no longer teleport onto
  face-down tiles; the hillClimb confirm gate rejects 5-5 "ties" as noise (needs a
  real margin); `loadCommunityChampion()` honors the pin flag so a pinned local
  champion isn't clobbered by the online one.
