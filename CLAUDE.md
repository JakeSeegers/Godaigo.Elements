# GODAIGO — AI Navigation Index

> Written for AI consumption. Lean and precise. No prose padding.
> Do NOT read source files until you have drilled down through the relevant INDEX.md first.

---

## HOUSE RULES (read every session)
These apply to all work on this repo. `tools/claude-hooks/` enforces rules 1 and 2
(see "How the rules are enforced" below).

1. **No em dashes, ever.** Not in code, comments, docs, commit messages, PR text, or
   game text. Use a comma, colon, period, parentheses, or " - " instead. Older text
   still has some; when you edit a line that has one, fix it.
2. **Release notes: one short summary per day** in `changelog.json` (shown by the lobby
   "Change Log" button, `js/changelog-ui.js`). Players read this, so keep it small.
   - **At most one entry per day.** `id` and `date` = today (`YYYY-MM-DD`). Newest first.
   - **Same day, more changes:** rewrite today's entry so it sums up the whole day. Merge,
     reword, or drop lines. Never add a second entry for the same day.
   - **At most 5 lines per entry.** Only list what players will notice (new features, rule
     or balance changes, visible fixes). Put small fixes into one "Small fixes and polish"
     line. Leave out refactors, dev tools, bot training internals, and docs.
   - Entry shape: `{ id, date, title, changes[] }`. Title = a few words for the day.
   - Simple English, short lines, how it affects the player. No file names or code terms.
   - When you skip a note because players cannot notice the change, tell the user.
3. **Start from `planning/current.md`** and drill down through the INDEX.md files before
   reading source (see below).
4. **Bump the game version** when you change files the browser loads (js/, css/, index.html,
   assets, changelog.json): run `node tools/bump-version.js` and commit `js/version.js` with
   the change. Open browsers see the new version and reload (see `js/version.js`). The Stop
   hook checks this.
5. **Keep docs in sync** after changes: follow the `/sync-docs` skill
   (`.claude/skills/sync-docs/SKILL.md`).

### How the rules are enforced
- This file is loaded into every Claude session automatically.
- `.claude/settings.json` runs two hooks:
  - **SessionStart** `tools/claude-hooks/session-start.js`: saves the starting commit to
    `.git/claude-session-base` and prints a short rules reminder into context.
  - **Stop** `tools/claude-hooks/stop-check.js`: before Claude finishes, checks this
    session's own commits plus uncommitted work for (1) em dashes in added lines that are
    still in the file, (2) game files changed without a `changelog.json` change (a
    reminder: Claude either updates today's summary or tells the user why not), and
    (3) `changelog.json` shape: valid JSON, one entry per date, newest first, at most 5
    lines per entry, (4) client files changed without a `js/version.js` bump. If any fails, Claude is told to fix it. It blocks once per stop, so it cannot loop.
    Skips work that came in through a merge.

---

## CURRENT ACTIVE WORK
→ **[planning/current.md](planning/current.md)**
Start every session here. It contains the live task, branch, and files in flight.

---

## PROJECT SNAPSHOT

| Key | Value |
|-----|-------|
| Type | Browser-based multiplayer hex-tile strategy game |
| Stack | Vanilla JS, SVG board, Supabase (auth + realtime DB) |
| Entry point | `index.html` — loads all scripts in order (see Script Load Order below) |
| Dev server | `npx serve -p 3333` (see `.claude/launch.json`) |
| Repo branch | `fixes/all-consolidated` is the live branch (GitHub Pages serves it; confirmed by the owner 2026-09-24). Push finished work there. `claude/missing-video-filename-sc1ajm` was the live branch before and is now old. Pages deploys it with GitHub's built-in "pages build and deployment" (branch source set in repo Settings). There is no deploy workflow file; the old one (for branch `4.10.progresscheck`) was deleted 2026-09-24. |
| Live URL | https://jakeseegers.github.io/Godaigo.Elements/ |

---

## ARCHITECTURE MAP
Drill down for details — do not read source files until the relevant INDEX is consulted.

```
CLAUDE.md  (you are here)
├── js/INDEX.md              ← All game JS modules, window globals, load order
│   └── js/scrolls/INDEX.md  ← Scroll system: definitions, effects, response window
├── css/INDEX.md             ← Stylesheet responsibilities and token locations
├── joytone/                 ← Embedded Joytone music app (iframe; driven by js/joytone-bridge.js)
├── docs/INDEX.md            ← Game design doc pointer, design decisions
└── planning/current.md      ← Live task state (branch, files, next steps)
```

---

## SCRIPT LOAD ORDER (index.html)
Order matters — later scripts depend on earlier ones.

> Resynced 2026-08 against the actual `<script>` tags in index.html (a
> connectivity/performance audit found this list had drifted: `config.js`
> is listed below as script #1 but is dead — never actually loaded, see its
> own file-header comment and js/INDEX.md; `tutorial.js` was listed as #2
> but the file no longer exists on disk; `scroll-panels.js`, `boot-splash.js`
> and `effects-system.js` are real, loaded scripts that were simply missing
> from this list entirely). If this list and index.html ever disagree again,
> index.html is the source of truth — verify with it before trusting this.

```
0. version.js             ← window.GAME_VERSION + update check: asks the server for the newest js/version.js
                             (no-store) on load, every 2 min and on tab focus. Newer and not in a room/game
                             (and not typing): re-fetch every own file with cache:'reload', then reload
                             (once per version). In a waiting room: banner with a Reload button. In a game,
                             tutorial or replay: waits. Bump with tools/bump-version.js (HOUSE RULES #4).
1. boot-splash.js          ← Studio/logo intro video (chroma-keyed canvas), plays once per page load. No game deps — loads first.
2. scroll-definitions.js   ← SCROLL_DECKS, SCROLL_DEFINITIONS globals
3. scroll-effects.js       ← ScrollEffects namespace (depends on scroll-definitions)
4. response-window.js      ← ResponseWindowSystem (depends on scroll-effects)
5. multiplayer-state.js    ← Shared MP state (myPlayerId, currentGameId, etc.) + the REAL Supabase client/URL/key (config.js is dead — see above)
6. connection-monitor.js   ← window.ConnectionMonitor — network health badge + isWorkable() gate (depends only on multiplayer-state.js's SUPABASE_URL)
7. sounds.js               ← window.SoundSystem — SFX + login music
8. joytone-bridge.js       ← window.JoytoneBridge — adaptive music via hidden joytone/ iframe (Shift+J+T popup)
9. game-core.js            ← SpellSystem, placeTile, revealTile, addAP, movement. Also the REAL home of TILE_SIZE/STONE_TYPES/PLAYER_COLORS/etc. (config.js is dead — see above)
9b. bot-elements.js        ← window.BotElements — the five fixed elemental bots: colour→element map, names, per-element weight "lean" overlays, runtime id resolution. No BotSystem dep at load. Must precede gamification-ui.js + lobby.js.
10. effects-system.js      ← window.effectsSystem — sprite/particle visual effect definitions (fire, etc.), no game logic
11. game-ui.js             ← HUD, drag-drop handlers, panel toggles, scroll deck UI
12. scroll-panels.js       ← window.ScrollPanelSystem — shared floating-panel chrome (Hand/Active/Common/Game Log/Opponent Status/Elemental Stones)
13. parallax.js            ← Animated background (no game deps)
13b. lore-intro.js         ← window.LoreIntro — hand-drawn sketch/typewriter lore sequence
                             (LoreIntroClips/chunk*.mp4), played by boot-splash.js's
                             revealLogin() right after the logo, before login. Reads
                             parallax.js's LIVE DOM output at runtime (getBoundingClientRect
                             + computed transform/opacity on the real #parallax-bg layers,
                             re-drawn into its own canvas so it can read pixels — a
                             foreignObject-snapshot approach was tried and confirmed to
                             permanently taint the canvas, even with every image inlined as
                             a data URI) — placed after parallax.js for clarity only, no
                             actual parse-order dependency.
14. gamification.js        ← window.gami — XP/gold/profiles (depends on Supabase)
15. crt-overlay.js         ← CRT canvas effects (no game deps)
16. gamification-ui.js     ← Profile modal UI (depends on gamification.js)
16b. changelog-ui.js       ← window.Changelog: lobby "Change Log" button + release-notes modal.
                             Reads /changelog.json (see HOUSE RULES #2). "New" dot on the button
                             until the newest entry is opened (localStorage godaigo_changelog_seen).
                             No game deps.
16c. account-recovery.js   ← window.AccountRecovery: optional recovery email (Profile > Settings > Account)
                             and sign-in "Forgot password?". Talks to the account-recovery edge function
                             (supabase/functions/account-recovery, sends via Resend, 2 emails/account/hour).
                             Handles ?recovery_verify=TOKEN and the #type=recovery reset link on load
                             (multiplayer-state.js sets window.__godaigoRecoveryLink before the client
                             consumes the hash).
17. lobby.js               ← Auth, room management, startGame() (depends on game-core)
17b. match-recorder.js     ← window.MatchRecorder: HOST-only recording of every online game's broadcast
                             messages to Supabase (`matches` + `match_moves`, sql/match-recording.sql).
                             Hooks in lobby.js: broadcastGameAction (own/bot sends; channel is self:false),
                             a catch-all gameChannel.on('broadcast', {event:'*'}) (everyone else),
                             handleGameStart (start), host re-election (adopt), game-over paths (finish),
                             resetToLobby (stop). Foundation for replays, cheat checks, stats (phases 2-4).
17c. match-witness.js      ← window.MatchWitness: every human browser in an online game (1) hashes the PUBLIC
                             board the instant currentTurnNumber changes (100 ms watcher) -> report_fingerprint,
                             (2) at game over (hook in showGameOverToAll) checks the winner vs its own board
                             (5 activated + isPlayerAtOwnShrine) -> report_game_result. claim_game_win needs a
                             confirming report from another fresh human seat, else the claim waits as 'pending'
                             and is paid when the report lands. sql/match-witness.sql + sql/match-witness-v2.sql.
17d. replay-viewer.js      ← window.Replay: plays a finished match back (Phase 3). get_match_replay -> Supabase
                             switched "offline" (fake channel, empty from()/rpc()) -> startMultiplayerGame()
                             from recorded seats + deck seed -> myPlayerIndex = -1 (spectator; game-core
                             getPlayerScrolls shows the ACTIVE player's hand for a negative seat) -> recorded
                             messages dispatched into setupGameBroadcast()'s own handlers, timed, with
                             play/pause/step/speed. Exit/Restart reload the page. Prototype: console
                             Replay.open(matchId); player screens not built yet.
18. tutorial-mode.js       ← LAZY-LOADED (no <script> tag — see #30 asset-preloader.js / window.LazyScripts). Interactive tutorial (depends on lobby.js + game-core.js). The old 7-step modal tutorial this superseded (formerly js/tutorial.js) has since been fully removed — no dead script tag remains.
19. emoji-system.js        ← Emoji reactions (depends on gamification.js)
20. cosmetics-system.js    ← Name colour cosmetics (depends on gamification.js)
21. bot-state.js           ← window.BotState — game-state snapshot / legal actions / apply (no strategy)
22. bot-sim.js             ← window.BotSim — pure forward model (simulate / legalActions / isTerminal) + validate() harness
23. bot-effects.js         ← window.BotEffects — Stage 2.5 scroll-effect usage: driveSelection() (tile-flip,
                             scorched-earth, tile-swap, Create, Scholar's Insight, Quick Reflexes, Sacrificial
                             Pyre, Inspiring Draught), driveTransmute() (open-ended discard-for-AP modal),
                             decideResponse() (response-scroll respond/pass — both arena and real multiplayer,
                             wired from bot.js and bot-driver.js respectively)
24. bot.js                 ← window.BotSystem — utility-scored bot + optional lookahead (WEIGHTS.searchDepth, default 0);
                             Shift+R = one step, Shift+B = full turn; waitForQuiescence() tries BotEffects
                             before cancelling a selection it can't drive. Also owns mctsPick() (Stage 2 step
                             5 — determinized root-level UCT, WEIGHTS.mctsEnabled) and signalBrainMode()
                             (emoji over the acting pawn — 🧠 search / 🎲 MCTS — when a bot's brain mode
                             switches, broadcast in multiplayer via broadcastGameAction('emoji', ...))
24b. bot-memory.js         ← window.BotMemory — episodic "what happened after decisions like this" memory.
                             Captures a fingerprint+action+outcome row whenever a bot decision's immediate
                             evaluateSnapshot() swing is extreme; retrieveSimilar() feeds mctsPick()'s root
                             UCB1 arms bonus pseudo-visits as a PRIOR (never an override). Shared via the
                             Supabase `bot_episodes` table (same RLS shape as bot_champion_weights: public
                             SELECT, authenticated insert with created_by = auth.uid()) — local
                             (localStorage godaigo_bot_episodes) is only the fallback/offline cache. Must
                             follow bot.js (needs window.BotSystem.evaluateSnapshot).
25. bot-driver.js          ← window.BotDriver — host-only multiplayer bot player ("🤖 Add Bot" lobby button);
                             host's client impersonates the bot's index to drive its turns
26. bot-arena.js           ← LAZY-LOADED (no <script> tag — see #30 asset-preloader.js / window.LazyScripts). window.BotArena — self-play arena (bot-vs-bot local games, weight evolution).
                             Shared playMatch() core for 2-5 players (calls ensureLocalMode() so a stale
                             isMultiplayer identity from an incomplete online-game leave never kills a local
                             match); run/evolve/spectate all support opts.visual (watch instead of muted-fast)
                             and evolve supports opts.nPlayers (2-5). Roadmap for smarter stages: docs/bot-roadmap.md
27. action-log.js          ← window.ActionLog — in-memory record of every meaningful action this session
                             (human AND bot); record()/onRecord() feed both the hidden dev cheat-panel's
                             "Download Action Log" button and game-log-ui.js's player-facing panel
27b. bot-imitation.js      ← window.BotImitation — HERMIT-ONLY, opt-in "learn from my play" imitation
                             learning (docs/void-knight.md). Watches ActionLog.onRecord() during the
                             hermit's own turns in a real online game that has a bot in it; compares
                             endTurn/discardScroll decisions to bot.js's own ranking (rankActions()'s
                             opts.withTrace) and nudges a small additive DELTA table (localStorage
                             godaigo_bot_weight_deltas), never a weight snapshot. lobby.js's
                             hostStartGame() layers that delta onto every bot's normal (elemental-lean)
                             base whenever the HOST is the hermit with the toggle on — same bots
                             already in the room, not a separate one; toggle off = plain base,
                             unchanged. Never touches the shared community champion itself.
28. game-log-ui.js         ← Player-facing readable "Game Log" panel (#game-log-panel, left side), built
                             from ActionLog.onRecord() — colour-coded, collapses movement, never shows
                             discardScroll or anything else that would reveal another player's hand
29. thehermit.js           ← window.TheHermit — dev tool, drag-to-reorder editor for the dock-bar/hud-bar
                             buttons and indicators (Shift+H, or the cheat-panel button); persists the
                             chosen order to localStorage and exports it as JSON for hardcoding back in
30. asset-preloader.js     ← window.AssetPreloader — background-loads in-game art + sounds after the intro;
                             shows a loading bar over the board if a match starts before it's done
                             Also window.LazyScripts.load('tutorial'|'bot-arena'): loads #18/#26 on idle after
                             the preload, or on demand from their entry points (Tutorial button, Train Bot,
                             cheat/bot-training panels, bot-driver.js per-bot weights) — await it before
                             touching window.TutorialMode / window.BotArena from any NEW entry point.
```

---

## NAMING CONVENTIONS

| Thing | Convention | Example |
|-------|-----------|---------|
| Scroll IDs | `ELEMENT_SCROLL_N` | `EARTH_SCROLL_5`, `CATACOMB_SCROLL_2` |
| Stone types | lowercase string | `'earth'`, `'void'`, `'catacomb'` |
| Player colors | lowercase name → hex via `PLAYER_COLORS` | `'purple'` → `'#9b59b6'` |
| Hex coords | world pixel coords from `hexToPixel(q, r, size)` | `{x: 138.6, y: 0}` |
| Tile IDs | auto-increment integer from `nextTileId` | `1`, `2`, `3` |
| Supabase tables | snake_case | `game_room`, `user_profiles` |
| CSS classes (tutorial) | `tmode-` prefix | `tmode-exit`, `tmode-next` |
| CSS classes (game) | semantic kebab | `placed-tile`, `player-marker` |

---

## KEY CROSS-MODULE GLOBALS
Full list: see `js/INDEX.md § Window Globals`.

| Global | Set in | Used by |
|--------|--------|---------|
| `window.spellSystem` | game-core.js | scroll-effects, game-ui, tutorial-mode |
| `window.startGame` | lobby.js | tutorial-mode |
| `window.placeTile` | game-core.js | game-ui, tutorial-mode, lobby |
| `window.isTutorialMode` | tutorial-mode.js | game-core, game-ui |
| `window.TutorialMode` | tutorial-mode.js | game-core (hooks), index.html (button) |
| `window.SCROLL_DEFINITIONS` | scroll-definitions.js | game-core, scroll-effects |
| `window.gami` | gamification.js | lobby, gamification-ui |

---

## SUPABASE TABLES

| Table | Owner module | Purpose |
|-------|-------------|---------|
| `game_room` | lobby.js | Active game sessions |
| `players` | lobby.js | Player slots in a session |
| `matches` | match-recorder.js | One row per online game: players snapshot, deck seed, settings, winner, status (playing/finished/abandoned), move_count, `keep`. Written ONLY via RPCs `start_match` / `finish_match` (room host or hermit). Read ONLY via RPCs (sql/replay-access.sql): `list_my_matches`, `list_public_matches`, `get_match_replay` (finished + (player of it OR `is_public` OR hermit)), `set_match_public` (players of it). Posting sets `keep`. Finished matches older than 30 days are deleted unless `keep`. `game_room.match_id` points at the live one. |
| `match_moves` | match-recorder.js | Every broadcast message of a match in order (`seq` assigned by the server), with event name, sender seat, payload. Written ONLY via `append_match_moves` (room host or hermit, batches of 200 max, 32 KB per payload). |
| `user_profiles` | gamification.js | XP, gold, level, stats. Clients may only UPDATE `stats`, `updated_at`, `skip_intro`; gold/XP/level/badges change ONLY through server functions: `claim_daily_login()`, `claim_game_win(room)`, `claim_training_reward(amount)` (60/claim, 300/day), `spend_gold(amount)`. `award_gold` / `update_user_xp` / `award_badge` are server-internal (not client-callable). See `sql/secure-rewards.sql`. |
| `user_activities` | gamification.js | Activity log for rewards. Clients may only insert `scroll_cast` / `element_activated` with no rewards; everything else is written by the server functions above. Inserts fire `check_badges_trigger` (badges). |
| `game_rewards` | claim_game_win() | One XP claim per (room, player), `status` paid/pending (pending = waiting for a witness); also the 4-per-hour win-claim limit. Server only. |
| `match_reports` | match-witness.js | Game-over witness report per (room, reporter): winner seen, confirms, activated, at_shrine, fingerprint. A non-confirming witness sets `matches.disputed`. Written only via `report_game_result`. |
| `match_fingerprints` | match-witness.js | Board fingerprint per (room, turn, reporter). A mismatch bumps `matches.desync_count`. Written only via `report_fingerprint`. 30-day cleanup. |
| `badges` | gamification-ui.js | Badge ownership |
| `account_recovery` | edge fn account-recovery | Optional recovery email per account (+ verified flag, confirm token hash). RLS on, NO client policies; client only uses RPCs `my_recovery_email()` / `remove_my_recovery_email()`. `sql/account-recovery.sql` |
| `recovery_email_log` | edge fn account-recovery | One row per email sent, for rate limits (2/account/hour, 3/address/day, 90/day total). Server only. |
| `bot_champion_weights` | bot.js, game-ui.js | THE single shared bot brain — append-only submission log; `win_rate` generated column ranks them. Best one auto-applied on load (bot.js); the auth-bar "Train Bot" button (hillclimb) submits + pays 25 gold on a confirmed win (game-ui.js `runHillClimbTraining`). |
| `deployed_bots` | bot-elements.js, lobby.js, gamification-ui.js | Now holds exactly FIVE system-owned rows (`owner IS NULL`) = the elemental bots (`sql/elemental-bots-seed.sql`). Nicknames = Terran Sentinel / Tidewarden / Emberkin / Galewalker / The Void Knight. Client READ-only (public SELECT); ids resolved by nickname at runtime. `ladder.bot_id` FKs here. **Dormant / unused now:** `captured_bots`, `void_knight`, `user_profiles.capture_stones` — the personal Bot Tycoon economy (Shop/Stable/capture) was removed. |

---

## KNOWN ACTIVE BUGS
See `TODO.md` for full list. `TRANS-WIN-CON` and `TRANS-DOUBLE-DISP` (Transmute
fire-symbol stamp / stale inventory display) are confirmed cleared. No other
top-level items as of last update.
