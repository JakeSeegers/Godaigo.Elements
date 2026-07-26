# assets/paper-ui/ — Paper UI System (asset catalog)

> Vendor sprite pack. Folder names/spaces/leading numbers preserved from the
> original download — reference paths verbatim, URL-encode spaces (`%20`) in
> HTML/CSS `url()`/`src` where needed (quoted CSS strings can use raw spaces).
> Nothing here is wired into the game yet. See `paper-ui-preview.html` (repo
> root) for a browsable gallery and `css/paper-ui.css` for starter classes.

Total pack size: ~6.1MB runtime assets (`assets/paper-ui/`) + ~3.8MB source
(`art-source/paper-ui/`, non-runtime).

---

## Content/ — atomic UI sprites (the reusable building blocks)

| Folder | Count | Dimensions (px) | Likely game use |
|---|---|---|---|
| `1 Items` | 27 | 16×16, 48×48 | Small inventory/scroll icon frames or item art |
| `2 Icons` | 26 | 16×16, 48×48, 64×32, 64×48, 64×64, 64×80, 112×112 | Mixed-size icon set — HUD glyphs, stat icons, action buttons |
| `3 Progress Bars` | 15 | 16×16 (tileable segments) | AP/HP/timer bar segments — likely a fill-track + end-cap kit |
| `4 Buttons` | 10 | 80×32 | Whole button skins (decorative left "gem" + right green chevron cap) — see note below |
| `4 Buttons/Sliced` | 33 | 16×16, 32×32 | Pre-cut 9-slice pieces (corners/edges/center) for the buttons above |
| `5 Holders` | 25 | 16×16 up to 224×224 (incl. one 224×224, one 112×112, one 80×80 circular frame) | Avatar/portrait frames, item-slot borders, dialog icon holders |
| `6 Highlighter` | 8 | 16×16 | Selection/highlight overlay tiles (e.g. hover state on a hex/slot) |
| `7 Day & Night Cycle` | 16 | 48×48, 80×48 | Small static sun/moon/weather content icons (not the animated cycle — see below) |
| `8 Equipment` | 18 | 16×16 | Equipment/gear slot icons |
| `9 Stamp/Stamp Mark` | 1 | 32×32 | Single ink-stamp mark overlay (e.g. "used"/"claimed" badge) |
| `9 Stamp/Stamp/idle` | 1 | 96×96 | Stamp tool at rest (for a stamping animation) |
| `9 Stamp/Stamp/Stamped` | 20 | 96×96 | Stamp-impact animation frames (20-frame stamping motion) |
| `10 Banners & Headers/Plain` | 20 | 64×64, 112×80, 112×192, 416×144, 576×176 | Panel/section title headers, plain parchment banners |
| `10 Banners & Headers/Cutout` | 20 | 64×64, 112×80, 112×192, 416×144, 576×160 | Same banner set, torn/cutout-paper edge variant |

**Buttons note:** `4 Buttons/*.png` are 80×32 composites with a fixed-size
decorative left cap (gem/rivet) and right cap (green chevron). A naive CSS
9-slice (`border-image`) will stretch/distort those caps if the button grows
much wider or taller than 80×32. `css/paper-ui.css` provides both a 9-slice
class and a stretched-background fallback — see comments there.

---

## Content Appear Animation/ — reveal/fold-in animations

Two style variants, each with the same 9 sub-categories, each a numbered PNG
frame sequence (play frame 1→N):

| Sub-category | Frames | Dimensions (Folding & Cutout / Plain) |
|---|---|---|
| `1 Headers` (4 sub-sequences) | 35 / 28 / 28 / 28 | ~336–480 × 64–112 |
| `2 item Holder` | 40 | 560×80 |
| `3 Rewards` (2 sub-sequences) | 32 / 34 | 384×144, 384×80 |
| `4 Notification` (2 sub-sequences) | 23 / 24 | 240×48, 272×48 |
| `5 Mini Map` | 20 | 160×160 |
| `6 Player HUD` | 22 | 224×96 |
| `7 Dialogue Box` | 44 | 624×128 |
| `8 Shop` | 36 | 288×336 |
| `9 Calender` | 49 | 560×432 |

Two top-level styles: `Folding & Cutout/` (torn-paper fold-in) and `Plain/`
(flat parchment fold-in). Same sub-folder structure under each. These are
motion assets for panel-open transitions (e.g. opening the scroll deck,
a shop modal, dialogue box) — not currently used anywhere in the codebase.

---

## Day & Night Cycle/ — animated sky/weather cycle

`Full/` and `Half/` variants, each with 7 states (`1 Dawn`, `2 Day`, `3 Noon`,
`4 Night`, `5 Lightning 1`, `5 Lightning 2`... `7 Raining`), each a **10-frame**
96×96 sequence — 14 sequences × 10 frames = 140 PNGs total. Likely intended as
an ambient background loop (not the small static icons in
`Content/7 Day & Night Cycle`, which are single-frame stills of the same
concept).

---

## Other top-level folders (present, not part of the 3-deliverable brief but real assets on disk)

| Folder | Count | Dimensions | Note |
|---|---|---|---|
| `Book Desk/` | 7 | 768×560 | A themed background/scene sequence (desk with book) — possibly an idle/ambient animation or parallax layer. |
| `Paper UI Pack/Plain/` and `Paper UI Pack/Folding & Cutout/` | mixed (see sub-folders: `1 Paper`, `2 Headers`, `3 Item Holder`, `4 Notification`, `5 Mini Map`, `6 Player HUD`, `7 Dialogue Box`, `8 Shop`, `9 Rewards`, `10 Calander`) | mixed, up to 688×224 (Dialogue Box), 656×544 (Calendar) | Pre-composed, ready-to-use full UI panels/screens (as opposed to `Content/`'s atomic pieces) — grab one of these directly for a complete dialogue box, shop screen, or calendar rather than assembling from `Content/`. |

---

## art-source/paper-ui/ — NON-runtime source files

Do not reference from CSS/HTML. Kept for editing/re-export only.

- `art-source/paper-ui/Aseprite/` — `.aseprite` project files: `Plain Paper UI SpriteSheet.aseprite`, `Folding & Cutout Paper UI SpriteSheet.aseprite`, plus `Aseprite/Animated/` with 3 more `.aseprite` animation sources (`Plain Paper UI.aseprite`, `Folding & Cutout Paper UI.aseprite`, `Items Holder Day & Night Cycle.aseprite`).
- `art-source/paper-ui/SpriteSheet/` — master atlas PNGs (`Plain Paper UI SpriteSheet.png`, `Folding & Cutout Paper UI SpriteSheet.png`) that `Content/` was sliced from.
- `art-source/paper-ui/License.pdf` — pack license terms.

---

## Quick pointers for integration

- **Buttons:** `Content/4 Buttons/{0..9}.png` (80×32) or `Content/4 Buttons/Sliced/*` for hand-built 9-slice.
- **Panel/HUD headers:** `Content/10 Banners & Headers/Plain/1.png` (576×176, largest plain banner) or the `Cutout/` equivalent for a torn-paper look.
- **Avatar/portrait frame:** `Content/5 Holders/1.png` (224×224 circular frame).
- **AP/HP bar:** `Content/3 Progress Bars/*` (16×16 segments — inspect in `paper-ui-preview.html` before picking fill vs. track pieces).
- **Full pre-built screens:** `Paper UI Pack/Plain/` or `Paper UI Pack/Folding & Cutout/` sub-folders, if a single ready-made panel is preferred over composing from `Content/`.

See `paper-ui-preview.html` (repo root) to browse every sprite visually, and
`css/paper-ui.css` for starter (unwired) integration classes.
