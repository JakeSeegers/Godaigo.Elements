# GODAIGO — AI Navigation Index

> Written for AI consumption. Lean and precise. No prose padding.
> Do NOT read source files until you have drilled down through the relevant INDEX.md first.

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
| Repo branch | `claude/missing-video-filename-sc1ajm` — the branch GitHub Pages actually deploys from (Settings → Pages); confirm with `git log -1` before trusting this, other branches carry unrelated parallel work |
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
1. boot-splash.js          ← Studio/logo intro video (chroma-keyed canvas), plays once per page load. No game deps — loads first.
2. scroll-definitions.js   ← SCROLL_DECKS, SCROLL_DEFINITIONS globals
3. scroll-effects.js       ← ScrollEffects namespace (depends on scroll-definitions)
4. response-window.js      ← ResponseWindowSystem (depends on scroll-effects)
5. multiplayer-state.js    ← Shared MP state (myPlayerId, currentGameId, etc.) + the REAL Supabase client/URL/key (config.js is dead — see above)
6. connection-monitor.js   ← window.ConnectionMonitor — network health badge + isWorkable() gate (depends only on multiplayer-state.js's SUPABASE_URL)
7. sounds.js               ← window.SoundSystem — SFX + login music
8. joytone-bridge.js       ← window.JoytoneBridge — adaptive music via hidden joytone/ iframe (Shift+J+T popup)
9. game-core.js            ← SpellSystem, placeTile, revealTile, addAP, movement. Also the REAL home of TILE_SIZE/STONE_TYPES/PLAYER_COLORS/etc. (config.js is dead — see above)
10. effects-system.js      ← window.effectsSystem — sprite/particle visual effect definitions (fire, etc.), no game logic
11. game-ui.js             ← HUD, drag-drop handlers, panel toggles, scroll deck UI
12. scroll-panels.js       ← window.ScrollPanelSystem — shared floating-panel chrome (Hand/Active/Common/Game Log/Opponent Status/Elemental Stones)
13. parallax.js            ← Animated background (no game deps)
14. gamification.js        ← window.gami — XP/gold/profiles (depends on Supabase)
15. crt-overlay.js         ← CRT canvas effects (no game deps)
16. gamification-ui.js     ← Profile modal UI (depends on gamification.js)
17. lobby.js               ← Auth, room management, startGame() (depends on game-core)
18. tutorial-mode.js       ← Interactive tutorial (depends on lobby.js + game-core.js). The old 7-step modal tutorial this superseded (formerly js/tutorial.js) has since been fully removed — no dead script tag remains.
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
                             before cancelling a selection it can't drive
25. bot-driver.js          ← window.BotDriver — host-only multiplayer bot player ("🤖 Add Bot" lobby button);
                             host's client impersonates the bot's index to drive its turns
26. bot-arena.js           ← window.BotArena — self-play arena (bot-vs-bot local games, weight evolution).
                             Shared playMatch() core for 2-5 players (calls ensureLocalMode() so a stale
                             isMultiplayer identity from an incomplete online-game leave never kills a local
                             match); run/evolve/spectate all support opts.visual (watch instead of muted-fast)
                             and evolve supports opts.nPlayers (2-5). Roadmap for smarter stages: docs/bot-roadmap.md
27. action-log.js          ← window.ActionLog — in-memory record of every meaningful action this session
                             (human AND bot); record()/onRecord() feed both the hidden dev cheat-panel's
                             "Download Action Log" button and game-log-ui.js's player-facing panel
28. game-log-ui.js         ← Player-facing readable "Game Log" panel (#game-log-panel, left side), built
                             from ActionLog.onRecord() — colour-coded, collapses movement, never shows
                             discardScroll or anything else that would reveal another player's hand
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
| `user_profiles` | gamification.js | XP, gold, level, stats |
| `user_activities` | gamification.js | Activity log for rewards |
| `badges` | gamification-ui.js | Badge ownership |
| `bot_champion_weights` | bot.js, game-ui.js | Trained bot weight tables — append-only submission log; `win_rate` generated column ranks them. Best one auto-applied on load (bot.js), Start Training submits to it when logged in (game-ui.js). Not `game_state`/`shop_items` — those exist but are unused (0 rows). |

---

## KNOWN ACTIVE BUGS
See `TODO.md` for full list. `TRANS-WIN-CON` and `TRANS-DOUBLE-DISP` (Transmute
fire-symbol stamp / stale inventory display) are confirmed cleared. No other
top-level items as of last update.
