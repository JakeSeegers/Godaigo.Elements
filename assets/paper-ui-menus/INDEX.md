# Paper UI Menus v1.3 — AI Navigation Index

> Written for AI consumption. Lean and precise.

## SOURCE

- `SpriteSheet.png` — master sheet.
- `pieces/` — 62 auto-sliced PNGs, `piece_NN_WxH.png` (NN = `00`..`61`), plus
  `pieces/_contactsheet.png` (labeled overview of all 62 — view it directly to
  re-verify any description below).
- Palette: darker tan (#e8b98a-ish) fills with maroon/dark-navy borders —
  distinct from the existing `assets/paper-ui/` (v1.1) pack's lighter parchment.
- **Filenames are stable.** Do NOT rename or renumber the PNGs — nothing
  references them yet, but the contact sheet's labels assume this numbering.
- Nothing in this pack is wired into the game. This file and
  `paper-ui-preview.html` are cataloging only.

## CATALOG

Table columns: piece, size (px), description (from contact sheet), likely
Godaigo use.

### Panels & Frames

| Piece | Size | Description | Likely Godaigo use |
|---|---|---|---|
| piece_00 | 159x67 | Wide filled panel, tan fill, maroon border, folder-tab notch top-left | Lobby room-name field backing / small header panel |
| piece_03 | 159x67 | Wide filled panel, tan fill, maroon border, plain rectangle (no notch) | Lobby room-name field / HUD sub-panel |
| piece_18 | 159x67 | Wide filled panel, tan fill, maroon border, folder-tab notch top-right (variant of #00) | Alt lobby header panel (paired with #00) |
| piece_01 | 83x82 | Square filled panel, tan fill, maroon border, notch cut bottom-left | Scroll-inventory slot frame / profile stat tile |
| piece_02 | 83x82 | Square filled panel, tan fill, maroon border, no notch | Scroll-inventory slot frame (plain variant) |
| piece_04 | 83x82 | Square filled panel, tan fill, maroon border, notch cut bottom-right | Scroll-inventory slot frame (mirrored notch, pairs with #01) |
| piece_22 | 350x70 | Wide pill-shaped bar, tan fill, maroon border, plain rectangle | HUD top bar (AP counter / turn banner) |
| piece_28 | 152x34 | Banner bar, tan fill, dark border, diagonal-cut top corners | Section header inside a modal (e.g. "Players") |
| piece_31 | 412x86 | Large wide bar, tan fill, maroon border | Pause-menu title bar / "GAME OVER" banner backing |
| piece_44 | 175x51 | Mid-width bar, tan fill, maroon border | Dialogue-box header strip / named-panel title |
| piece_23 | 51x51 | Four dashed corner-bracket markers arranged in a square (9-slice / crop guide) | Not a UI element — slicing guide; likely discard or repurpose as a "targeting" bracket overlay |

### Dialogue & Popups

| Piece | Size | Description | Likely Godaigo use |
|---|---|---|---|
| piece_37 | 185x282 | Large filled vertical panel, tan fill, no border | Tutorial callout / scroll-detail popup body |
| piece_39 | 161x253 | Large vertical panel, outline only (no fill), ornate flourish corners | Settings-tab background frame (outline, lets game bg show through) |
| piece_53 | 250x282 | Large filled vertical panel, tan fill, maroon border | Profile/Shop/Stable modal body |
| piece_54 | 226x253 | Large vertical panel, outline only, ornate flourish corners (variant of #39) | Settings-tab background frame (wider variant) |
| piece_36 | 111x36 | Speech-bubble tag, tan fill, maroon border, tail pointing down-left | Tutorial callout speech bubble |
| piece_17 | 42x45 | Dashed rounded-corner selection box (no fill) | Tile/slot selection highlight overlay |

### Buttons & Arrows

| Piece | Size | Description | Likely Godaigo use |
|---|---|---|---|
| piece_25 | 24x44 | Left-pointing arrow button, outline style, dark navy | Room-browser page-left / carousel nav (idle state) |
| piece_26 | 24x44 | Left-pointing arrow button, filled maroon style | Room-browser page-left (pressed/hover state, pairs with #25) |
| piece_45 | 19x33 | Right-pointing arrow button, outline style, dark navy | Room-browser page-right / carousel nav (idle state) |
| piece_46 | 19x33 | Right-pointing arrow button, filled maroon style | Room-browser page-right (pressed/hover state, pairs with #45) |
| piece_27 | 54x30 | Small rectangular button, tan fill, maroon border | Host/Join button base |
| piece_29 | 35x38 | Small square button panel, tan fill, navy border | Scroll-deck small action button |
| piece_30 | 36x38 | Small square button panel, tan fill, navy border (variant of #29) | Scroll-deck small action button (alt state) |
| piece_34 | 21x23 | Small square button, tan fill, navy border | Icon-only button (e.g. mute toggle) |
| piece_35 | 21x21 | Small square button, tan fill, navy border | Icon-only button (alt size, pairs with #34) |
| piece_38 | 27x24 | Small button, tan fill, thin border | Compact HUD button |
| piece_40 | 41x24 | Small bar/button, tan fill, dark border | Settings-tab option button (short label) |
| piece_41 | 51x24 | Small bar/button, tan fill, dark border | Settings-tab option button |
| piece_42 | 57x24 | Small bar/button, tan fill, dark border | Settings-tab option button |
| piece_43 | 59x24 | Small bar/button, tan fill, dark border | Settings-tab option button (widest of the set) |
| piece_51 | 59x24 | Small bar/button, tan fill, dark border (variant of #43) | Settings-tab option button, alt state |
| piece_52 | 59x22 | Small bar/button, darker tan fill, dark border | Settings-tab option button, pressed/selected state |

### Checkboxes & Sliders

| Piece | Size | Description | Likely Godaigo use |
|---|---|---|---|
| piece_60 | 14x30 | Checkbox pair: checked box (top) + empty box (bottom) | Settings-tab toggle (e.g. "Fullscreen", "SFX") |
| piece_59 | 13x31 | Two small stacked squares (stepper/scrollbar-thumb glyph) | Volume-slider or list scrollbar thumb |
| piece_49 | 168x38 | Horizontal slider track with square handle at left end | Settings-tab volume slider (Display/Audio/Video) |
| piece_33 | 71x11 | Thin horizontal divider line with diamond arrow terminals | Section divider inside modal (Profile/Settings) |
| piece_50 | 92x25 | Small decorative text ornament with double underline rule | Decorative label under a modal title |

### Item Icons

| Piece | Size | Description | Likely Godaigo use |
|---|---|---|---|
| piece_05 | 18x18 | Magnifying glass with sparkle | Search/inspect icon (room browser filter) |
| piece_06 | 18x18 | Rolled brown item (scroll/loaf) | Scroll-inventory generic icon |
| piece_07 | 18x17 | Book icon, blue + brown | Rules/help button icon |
| piece_08 | 14x17 | White egg/orb icon | Generic collectible icon |
| piece_09 | 18x17 | Red gem/ruby icon | Stone-type icon (fire/earth accent) |
| piece_10 | 14x14 | Small teal/cyan gem icon | Stone-type icon (water/void accent) |
| piece_11 | 18x18 | Blue gem/crystal icon | Stone-type icon (water accent) |
| piece_12 | 18x18 | Gold bar/ingot icon | Currency (gold) icon for shop/profile |
| piece_13 | 18x18 | Brown stick/wand icon | Scroll-effect action icon |
| piece_14 | 17x17 | Paintbrush with colorful splatter | Cosmetics-system icon |
| piece_15 | 18x17 | Orange/red food (meat) icon | Generic reward icon |
| piece_16 | 18x17 | Pair of green leaves/herb icon | Stone-type icon (earth accent) |
| piece_20 | 18x18 | Yellow star icon | XP / rating icon (gamification) |
| piece_21 | 18x18 | Yellow/orange diamond icon | Coin/currency icon (alt to #12) |

### Text Labels

| Piece | Size | Description | Likely Godaigo use |
|---|---|---|---|
| piece_47 | 66x18 | Pixel-font label "PAUSE" | Pause-menu title graphic |
| piece_55 | 90x18 | Pixel-font label "DISPLAY" | Settings-tab section heading |
| piece_56 | 66x18 | Pixel-font label "AUDIO" | Settings-tab section heading |
| piece_57 | 66x18 | Pixel-font label "VIDEO" | Settings-tab section heading |
| piece_58 | 106x18 | Pixel-font label "CONTROLS" | Settings-tab section heading |

### Portrait

| Piece | Size | Description | Likely Godaigo use |
|---|---|---|---|
| piece_32 | 67x84 | Large player portrait bust, dark hair | Profile modal avatar / win-screen portrait |
| piece_19 | 26x29 | Small player head icon | Players-panel roster entry icon |
| piece_48 | 26x29 | Small player head icon, alt variant (pairs with #19) | Players-panel roster entry icon (second player) |

### Misc

| Piece | Size | Description | Likely Godaigo use |
|---|---|---|---|
| piece_24 | 76x13 | Row of control glyphs (diamond/person/x/gear/colon) | Controls-tab keybind row icon strip |
| piece_61 | 50x25 | Row of 6 small item-slot squares (2x3 grid) | Scroll-deck mini inventory slot row |

## NOTES / CORRECTIONS vs. task's initial labeling

- #00/#03/#18 are the "folder-tab" trio (not #00/#03/#18 all folder-tabbed —
  #03 has no notch; only #00 and #18 are true folder-tab shapes, mirrored).
- #23 is a 9-slice/crop guide overlay (four dashed corner brackets), not a
  usable panel graphic on its own — flagged as possibly not a real UI asset.
- #59 reads as a stepper/scrollbar-thumb glyph, not a checkbox — the actual
  checkbox pair is #60.
- #50 is a decorative text-ornament rule, not a slider track — the real
  slider-with-handle is #49.
- Icon identifications (#05-#16, #20, #21) are best-effort at 18x18 pixel
  scale; re-view `pieces/_contactsheet.png` before using any single icon for
  a specific stone type.
