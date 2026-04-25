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
| Repo branch | `4.10.progresscheck` |
| Live URL | https://jakeseegers.github.io/Godaigo.Elements/ |

---

## ARCHITECTURE MAP
Drill down for details — do not read source files until the relevant INDEX is consulted.

```
CLAUDE.md  (you are here)
├── js/INDEX.md              ← All game JS modules, window globals, load order
│   └── js/scrolls/INDEX.md  ← Scroll system: definitions, effects, response window
├── css/INDEX.md             ← Stylesheet responsibilities and token locations
├── docs/INDEX.md            ← Game design doc pointer, design decisions
└── planning/current.md      ← Live task state (branch, files, next steps)
```

---

## SCRIPT LOAD ORDER (index.html)
Order matters — later scripts depend on earlier ones.

```
1. config.js               ← Supabase client, STONE_TYPES, PLAYER_COLORS, TILE_SIZE
2. tutorial.js             ← Old 7-step modal tutorial (session-dismiss only)
3. scroll-definitions.js   ← SCROLL_DECKS, SCROLL_DEFINITIONS globals
4. scroll-effects.js       ← ScrollEffects namespace (depends on scroll-definitions)
5. response-window.js      ← ResponseWindowSystem (depends on scroll-effects)
6. multiplayer-state.js    ← Shared MP state (myPlayerId, currentGameId, etc.)
7. game-core.js            ← SpellSystem, placeTile, revealTile, addAP, movement
8. game-ui.js              ← HUD, drag-drop handlers, panel toggles, scroll deck UI
9. parallax.js             ← Animated background (no game deps)
10. gamification.js        ← window.gami — XP/gold/profiles (depends on Supabase)
11. crt-overlay.js         ← CRT canvas effects (no game deps)
12. gamification-ui.js     ← Profile modal UI (depends on gamification.js)
13. lobby.js               ← Auth, room management, startGame() (depends on game-core)
14. tutorial-mode.js       ← Interactive tutorial (depends on lobby.js + game-core.js)
15. emoji-system.js        ← Emoji reactions (depends on gamification.js)
16. cosmetics-system.js    ← Name colour cosmetics (depends on gamification.js)
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

---

## KNOWN ACTIVE BUGS
See `TODO.md` for full list. Top open items as of last update:
- `TRANS-WIN-CON`: Transmute (Fire IV) doesn't always stamp fire symbol on player tile
- `TRANS-DOUBLE-DISP`: Transmute inventory display stale after discard
