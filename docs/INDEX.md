# docs/ — Documentation Index

> See parent: [CLAUDE.md](../CLAUDE.md)

---

## FILE MAP

| File | Purpose |
|------|---------|
| `game-design-document.md` | Canonical game rules: tile mechanics, shrine system, scroll patterns, win conditions, stone abilities, elemental hierarchy, balance notes |

---

## game-design-document.md — Key Rules Summary

> Read the full GDD for balance decisions. This is a quick-reference extract.

### Win condition
Activate one scroll of each element type: Earth, Water, Fire, Wind, Void.
Catacomb scrolls are dual-type and count toward two conditions simultaneously.

### Elemental rank (high to low)
`Void > Wind > Fire > Water > Earth`
Used for: stone conflict resolution, response scroll priority, stone break AP cost.

### Stone abilities
| Element | Effect |
|---------|--------|
| Earth | Blocks movement (impassable) |
| Water | 2 AP to pass; adapts to adjacent Earth (block) or Wind (free) |
| Fire | Destroys adjacent stones on placement (not Void, not Fire) |
| Wind | 0 AP to pass through |
| Void | Raises player's AP maximum; nullifies adjacent stones' effects |

### Stone break cost
Right-click a stone to remove it. AP cost = stone's rank number:
`Earth=5, Water=4, Fire=3, Wind=2, Void=1`

### Shrine stone yield (end-of-turn)
`Earth=5, Water=4, Fire=3, Wind=2, Void=1`
Max 25 of each type across all players (shared pool).

### Catacomb tiles
- Flipping one: `+1 AP` refund + draw a catacomb scroll
- Ending turn on center: no stones (non-elemental)
- Catacomb scroll: dual-type, counts 2 win conditions

### Response scrolls
- Level 1 scroll of any element
- Can only be played during another player's action
- Requires 2 AP + player in center of pattern
- If two players respond: higher rank element resolves first
