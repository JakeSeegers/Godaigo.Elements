# Paper UI design system — how the source files actually work

> Written after being called out for integrating individual sprites (piece_37,
> piece_52, piece_54...) without understanding the pack as a whole. This is
> the missing outline: what's actually in every source file, what systems
> exist that we haven't used yet, and what's a dead end. Read this before
> touching `css/paper-ui-settings.css` or slicing anything else out of
> `assets/paper-ui-menus/`.
>
> Ground truth, not guesses: every claim below comes from parsing the real
> `.aseprite` binary files with `ase_audit.py` (this directory) — a
> from-scratch parser, since no Aseprite CLI or Python library was available
> in this environment — cross-checked by zlib-decompressing and re-encoding
> real pixel frames as PNGs (`evidence/`) to confirm the parse was right
> before trusting the numbers. Raw audit dumps: `evidence/audit_v13.txt`,
> `evidence/audit_v11.txt`.

---

## Two separate packs, don't conflate them

| | v1.1 "Paper UI System" | v1.3 "Humble Gift" |
|---|---|---|
| Palette | cream + green chevrons | darker tan + maroon border |
| Ships as | 1,410 pre-sliced PNGs + 5 `.aseprite` sources | 1 master `SpriteSheet.png` + 7 `.aseprite` sources |
| In repo at | `assets/paper-ui/` | `assets/paper-ui-menus/` (62 pieces sliced from the sheet, see `assets/paper-ui-menus/INDEX.md`) |
| What we've used so far | buttons/banners/holders drafted in `css/paper-ui.css` (unwired) | Settings tab skin, `css/paper-ui-settings.css` (live) |

Same creator, not the same asset — do not mix pieces from the two without
checking the palette matches.

---

## v1.3: six files are ONE composite demo scene, not six unrelated files

`0 Player HUD`, `1 Dialogue Box`, `2 Text Popup`, `3 Pause Menu`,
`4 Mini Dialogue Box`, `5 Settings Menu` all share the **identical base
scaffold** — same canvas (672×480), same layer names, same structure:

```
Background
Paper HUD (group)
  Base, Holder, Progress Bars, Buttons, items, Icons, Text, HighLighter
[[file-specific overlay group — see below]]
Branding (group)
  Brand Link, Border, Version
```

Each file just swaps in a different **overlay group** as its "content" demo:
`Dialogue System`, `Text Popup`, or (in file 5, the most complete one) BOTH
`Settings` and `Pause Menu` groups together. File 5 is the authoritative
one — it has the full `Pause Menu` group with all six menu items
(`Controls`/`Video`/`Audio`/`Display`/`Settings`/`Exit`), where file 3
(`Pause Menu v1.2`, an older version number) only has `Settings`/`Exit`.
**We've only ever pulled from file 5.** The other five files are the same
system demonstrating a dialogue box, a text popup, etc. — worth returning to
if we ever build those.

The `SpriteSheet.aseprite` file is just the flattened master sheet (1 frame,
1 layer) — no animation data, already fully represented by
`assets/paper-ui-menus/SpriteSheet.png`. Nothing further to extract there.

---

## System 1: the panel open/close unfold — DONE, in `css/paper-ui-settings.css`

`Pause Menu > Base` (and its paired `Page Line` layer, not yet used) goes
from invisible → a 37px folded strip → widens to 183px over 6 more frames
(~100ms each) → a few frames of horizontal settle-bounce. Fully decoded,
literal keyframes, verified against real frame timing. See
`evidence/panel-open-f13-start.png` / `-f19-end.png` for the actual decoded
pixels at both ends of the transition.

**Not used yet**: `Page Line` animates in lockstep with `Base` (same frame
range, 13-122) — it's very likely a divider/underline element inside the
panel we've never looked at. Worth decoding if the panel ever needs an
internal divider.

---

## System 2: HighLighter — a real selection/hover cursor, NOT decoration

This is the one most worth building next. `Paper HUD > HighLighter` (layer 9
in every file) has real per-frame pixel data across dozens of frames, and it
is not one asset — decoding four representative frames
(`evidence/highlighter-*.png`) shows **three distinct visual modes**,
switched depending on what it's currently pointing at:

1. **Button mode** (`highlighter-button-mode.png`, ~42×45) — a simple
   rounded-rect outline glow, sized to one small button/icon.
2. **Panel mode** (`highlighter-panel-mode.png`, ~293×261) — NOT a filled
   box. It's the same corner-bracket ornament motif used on the static
   frame borders (compare to piece_54's corners), just scattered across a
   much bigger bounding box to mark all four corners of a whole highlighted
   panel/region.
3. **Micro mode** (`highlighter-micro-mode.png`, 11×11) — a tiny dashed
   circle, for small widgets (looked like a scrollbar thumb/dot indicator
   in context).

And it moves: tracing its geometry across `5 Settings Menu`'s frames shows
it jump from a button, to a full-panel highlight, then **step down through
a vertical list** (same x, y increasing by a fixed amount each frame —
literally "cursor moves down a menu"), to a tiny widget stepping sideways,
then reverse back through the same path. This is a designed, reusable
hover/selection system across three element sizes, not a one-off animation.

**What building this for real would mean**: decode all three modes' full
pixel data (only did 1 frame per mode so far, as visual proof), and wire up
a CSS/JS hover state on our own buttons/menu items that swaps in the right
mode's border-image sized to the target element, matching their move-between
targets motion for keyboard/gamepad-style focus if we ever add it.

---

## System 3: per-item staggered reveal — not yet touched

The six `Pause Menu` items (`Controls`, `Video`, `Audio`, `Display`,
`Settings`, `Exit`) are each their own layer, and they do **not** appear
together. Real cel frame ranges (file 5):

| Item | Frames |
|---|---|
| Settings | 27–48 |
| Exit | 25–50 |
| Controls | 53–111 |
| Video | 55–109 |
| Audio | 57–107 |
| Display | 59–105 |

Settings/Exit reveal first (in the file 3 subset), Controls/Video/Audio/
Display reveal later as a second wave — each individually, via the same
kind of width-growth mechanic as the panel frame itself (their cel sizes
step through small-to-full widths across their own frame range, same as
`Base` did). Our current Settings tab fades all rows in with a flat 35ms
stagger (a guess); this system suggests each row/button should do its own
literal width-reveal, not just fade+slide.

---

## Fonts: there is no font file — all text is rasterized

Aseprite has no font-resource chunk type. Every piece of text in these
scenes ("PAUSE", "DISPLAY", button labels) lives in a `Text` layer as
regular pixel-art cel data, redrawn per frame. **There is nothing to
"apply" as a font-family.** Matching their exact letterforms would mean
extracting individual glyphs from the `Text` layers as a sprite font —
a distinct, nontrivial task (find each letter's bounding box across many
button-label cels, deduplicate into a character set, build a usable
CSS/canvas spritefont) — not something achievable by naming a Google Font.
We currently use Press Start 2P as a stand-in; it's a reasonable
visual match (chunky pixel caps) but not their actual typeface.

---

## v1.1 pack: also has an undecoded appear-animation layer

`Folding & Cutout Paper UI.aseprite` and `Plain Paper UI.aseprite` (the
animated demo files, distinct from the static per-piece PNGs we sliced)
each have a `Content Appear Animation > Appear Animation` layer: 49 real
cels, frames 0–48, sizes stepping through multiple stages — same kind of
literal reveal-motion data as System 1, but for the v1.1 pack's own pieces
(buttons/banners/holders), never decoded. Also present: `Items Holder Day &
Night Cycle.aseprite` has genuine named tags (Dawn/Day/Noon/Night/
Lightning×2/Raining, ~10 frames each, two full cycles) — a real weather/
time-of-day animation set, completely unused so far.

---

## Open questions / not yet investigated

- `Page Line` (paired with `Base` in every panel) — never decoded.
- The full pixel content of all three HighLighter modes (only 1 frame per
  mode decoded as proof-of-concept).
- Per-item reveal: only geometry ranges pulled, not the actual width-growth
  curve per item (same method as System 1 would apply directly).
- v1.1's `Content Appear Animation` and `Items Holder Day & Night Cycle` —
  geometry/tags found, nothing decoded yet.
- Glyph/spritefont extraction — not started, flagged above as its own task.
