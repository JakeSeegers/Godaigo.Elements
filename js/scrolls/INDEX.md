# js/scrolls/ — Scroll System Index

> See parent: [js/INDEX.md](../INDEX.md) → [CLAUDE.md](../../CLAUDE.md)

---

## FILE MAP

| File | Responsibility |
|------|---------------|
| `scroll-definitions.js` | Static data: all 31 scroll names, levels, elements, stone patterns, and effect descriptions. Exposes `window.SCROLL_DEFINITIONS` and `window.SCROLL_DECKS`. |
| `response-window.js` | `ResponseWindowSystem` class: detects which players can respond to a cast, manages 15s countdown, validates counter/reaction scrolls, resolves the stack. |
| `effects/scroll-effects.js` | `ScrollEffects` namespace: `execute(scrollId, playerIndex, spellSystem)` for all 31 scrolls, active buff tracking, selection modes (sacrifice, tile-flip, etc.). |

---

## SCROLL SYSTEM FLOW

```
Player clicks "Cast Spell"
    │
    ▼
spellSystem.activateScroll(scrollId, playerIndex)   [game-core.js]
    │  validates: pattern on board, 2 AP, scroll in active/common area
    │
    ▼
applyScrollEffects(scrollId, playerIndex, result)   [game-core.js]
    │  calls ScrollEffects.execute()
    │  checks result.cancelled before tracking win condition
    │
    ▼
ScrollEffects.execute(scrollId, playerIndex, ss)    [scroll-effects.js]
    │  returns { success, requiresSelection, cancelled, message }
    │
    ▼
ResponseWindowSystem.openWindow(castData)           [response-window.js]
    │  15s for other players to respond
    │  on response: re-enters execute() for the counter scroll
    │
    ▼
Win condition tracked in spellSystem.activated Set
```

---

## scroll-definitions.js — Deep Notes

### Data structures
```js
SCROLL_DEFINITIONS = {
  EARTH_SCROLL_1: {
    id: 'EARTH_SCROLL_1',
    name: 'Tremor',
    element: 'earth',
    level: 1,
    isResponse: true,       // level 1 scrolls are always response-only
    patterns: [[...], [...]], // array of rotation variants
    description: '...'
  },
  ...
}

SCROLL_DECKS = {
  earth: ['EARTH_SCROLL_1', ..., 'EARTH_SCROLL_5'],
  water: [...],
  fire:  [...],
  wind:  [...],
  void:  [...],
  catacomb: ['CATACOMB_SCROLL_1', ..., 'CATACOMB_SCROLL_6']
}
```

### Patterns
- Each pattern is a list of `{q, r, type}` relative offsets from the player's hex
- Multiple variants per scroll = rotation equivalents (the system checks all)
- `type` matches stone type strings: `'earth'`, `'water'`, `'fire'`, `'wind'`, `'void'`

### Catacomb scrolls
- 6 scrolls, dual-type (count toward 2 win conditions)
- Drawn when revealing a catacomb tile
- Stored in `SCROLL_DECKS.catacomb`

---

## scroll-effects.js — Deep Notes

### execute() return contract
```js
{
  success: bool,            // did the effect fire?
  requiresSelection: bool,  // is the system waiting for player input?
  cancelled: bool,          // if true, applyScrollEffects() skips win tracking
  message: string           // status bar text
}
```

### cancelled: true
Used when an execute() call cannot proceed (e.g., Sacrificial Pyre with empty hand).
`applyScrollEffects()` in game-core.js checks `result.cancelled` and returns before
tracking the element in the win condition set. Critical: the element tracking block
runs even if `success=false`, so `cancelled` is the only safe escape hatch.

### Active buffs
Stored in `ScrollEffects.activeBuffs{}`. Keyed by effect name. Cleared on turn end.
Examples: `callToAdventure` (draw stones on tile flip), `respirate` (wind return on turn end).

### Selection modes
Some scrolls pause normal gameplay to collect player input:
- `enterScrollSacrificeMode()` — player picks a scroll from hand to discard (Sacrificial Pyre)
- `tileMoveMode` on `window` — player picks tiles to move (Telekinesis)
- `takeFlightState` on `window` — player picks pawn to move (Take Flight / Breath of Power)

### Scroll-specific gotchas
- **Sacrificial Pyre (FIRE_SCROLL_3)**: checks hand size before entering sacrifice mode. Returns `cancelled:true` if hand is empty. Previously granted fire win-con on empty hand — fixed.
- **Heavy Stomp (EARTH_SCROLL_3)**: calls `performTileFlip()` in scroll-effects.js (NOT `revealTile()`). Remote flips use `flipTileVisually()`. Only `revealTile()` grants +1 AP for catacomb tiles and fires tutorial hooks.
- **Wandering River (WATER_SCROLL_X)**: uses `getEffectiveTileElement(tile)` to override shrine type for scroll drawing. Check this before assuming `tile.shrineType` is canonical.

---

## response-window.js — Deep Notes

### Response eligibility
A player can respond if:
1. They have a level-1 scroll of ANY element in active area
2. They have ≥ 2 AP remaining
3. The response window is open (15s after cast)

### Conflict resolution
If two players respond simultaneously, higher-rank element wins:
`Void > Wind > Fire > Water > Earth`
Same rule applies to stone conflict on the board.

### Stack resolution
- Response resolves BEFORE the original cast takes effect
- A response cannot itself be responded to (no counter-counter)
