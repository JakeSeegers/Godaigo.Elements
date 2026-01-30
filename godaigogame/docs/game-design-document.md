# Godaigo Game Design Document

## Overview
Godaigo is a strategic board game featuring elemental scrolls and tactical positioning.

---

## Scroll System

### Scroll Types
Six scroll categories:
- **Fire** (5 scrolls, levels I-V)
- **Water** (5 scrolls, levels I-V)
- **Earth** (5 scrolls, levels I-V)
- **Wind** (5 scrolls, levels I-V)
- **Void** (5 scrolls, levels I-V)
- **Catacomb** (10 scrolls - multi-element patterns)

### Scroll Decks
- Each scroll type has its own separate deck (array)
- All decks are **shuffled at game start** (Fisher-Yates shuffle)
- Scrolls are **drawn from the top** of the deck when a shrine is revealed
- When a scroll is discarded, it returns to the **bottom** of its specific element deck (not reshuffled)

### Scroll Locations
Scrolls can exist in three locations:
1. **Hand** - Private to the player, only they can see full details
2. **Active Area** - Preparing for activation, opponents can see name + element
3. **Deck** - The draw/discard pile for each element

### Moving Scrolls (Hand <-> Active Area)
- **Cost:** 0 AP (free action)
- **Timing:** Can be done anytime the player could activate a scroll
- **UI:** Click "To Active" or "To Hand" buttons in Scroll Inventory
- Future: A reaction phase will be added where players can respond with activations

### Scroll Visibility

#### In Hand
- Only visible to the owning player
- Full scroll information shown (name, element, description, pattern requirements)

#### In Active Area
- **Owner sees:** Full scroll information including shape layout requirements
- **Opponents see:** Name and element only (pattern requirements hidden)
- Visual indicator: Orange border around Active Area scrolls

### Scroll Activation (Cast Spell)
- **Cost:** 2 AP
- **Requirement:** Scroll must be in **Active Area** (not Hand)
- Player must be standing in a position where stones around them match the scroll's pattern
- When activated, the scroll's effect triggers (grants elemental stones based on level)
- The scroll **stays in player's control** after activation
- Activating an element type contributes to the win condition (activate all 5 elements)

### Collecting Scrolls
- Scrolls are collected when revealing shrine tiles
- The scroll is drawn from the top of the corresponding element's deck
- Collected scrolls go directly to the player's **Hand**

---

## Action Points (AP)

### AP Costs
| Action | AP Cost |
|--------|---------|
| Move scroll between Hand and Active Area | 0 |
| Cast Spell (activate scroll) | 2 |
| *(other actions - movement, stone placement, etc.)* | varies |

---

## Win Condition
- Activate at least one scroll of each of the 5 main elements (Fire, Water, Earth, Wind, Void)
- Catacomb scrolls can contribute to multiple elements at once

---

## Game Phases
*(To be expanded)*

- Main Phase
- Reaction Phase (planned - allows players to respond with scroll activations)

---

## Implementation Notes

### Code Structure (SpellSystem class)
- `scrollDecks`: Object with arrays for each element type
- `playerScrolls`: Per-player object with `hand`, `active`, and `activated` Sets
- Key methods:
  - `shuffleDeck(deck)`: Fisher-Yates shuffle
  - `drawFromDeck(element)`: Remove and return first element
  - `discardToDeck(scrollName)`: Add to end of deck
  - `moveToActive(scrollName)`: Move from hand to active (0 AP)
  - `moveToHand(scrollName)`: Move from active to hand (0 AP)
  - `discardScroll(scrollName)`: Remove from hand/active, add to deck bottom
  - `castSpell()`: Check active scrolls for pattern matches

### Multiplayer Sync
- Scroll movements broadcast via `scroll-move` action
- Scroll discards broadcast via `scroll-discard` action
- Scroll collections broadcast via `scroll-collected` action
- Spell casts broadcast via `spell-cast` action

---

## Future Additions
- Reaction phase for scroll activation responses
- Visual display of opponent's Active Area scrolls on the board
- Scroll trading/stealing mechanics
- Additional scroll effects beyond stone generation
