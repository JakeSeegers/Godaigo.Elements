# Paper UI / Cheat-Screens — UI Review

**Audited:** 2026-07-27
**Baseline:** No UI-SPEC.md exists for this branch. Audited against abstract 6-pillar standards, using css/variables.css + css/base.css + css/styles.css + css/components.css as the existing baseline design system for contrast.
**Screenshots:** Not captured (code-only audit per task instructions; no dev server started).

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Cheat-panel labels are specific and functional; one native `window.confirm()` breaks tone in an otherwise themed flow |
| 2. Visuals | 2/4 | Three unreconciled Paper UI visual systems coexist (unused v1.1 draft, live v1.3 lobby/profile skin, TheHermit's hand-exported overrides), fighting via stacked `!important` |
| 3. Color | 1/4 | Three non-overlapping ad hoc color palettes now exist in the project (base game tokens, new `--pp-*` tokens, and untokenized hex literals in two more places) with zero reuse between them |
| 4. Typography | 2/4 | New code hardcodes the string `'Press Start 2P'` instead of reusing the already-defined `var(--font-pixel)` token; font-sizes span 6 one-off values with no scale |
| 5. Spacing | 2/4 | Every spacing/border-width value in the three new files is a fresh literal; none reuse the existing `--space-*` scale, and several (7px, 10px, 14px, 26px, 28px, 64px) don't even round to it |
| 6. Experience Design | 2/4 | Good state coverage (disabled/locked/reduced-motion) undercut by a brittle hand-tuned 1000ms keyframe animation (documented clipping bug workaround) and a jarring native `confirm()` dialog |

**Overall: 12/24**

---

## Top 3 Priority Fixes

1. **Three incompatible color systems now coexist** (`css/variables.css`'s `--bg-dark`/`--accent-gold`/etc., `css/paper-ui-profile.css`'s new `--pp-*` set defined lines 18-29, and untokenized hex literals both in the profile modal chrome section [css/paper-ui-profile.css:172-188] and in TheHermit's designer export block [css/styles.css:4114-4148]) — user impact: the UI now has visibly clashing color logic depending on which surface you're on, and any future recolor requires editing three unrelated places. Fix: pick one token set (the new `--pp-*` maroon/parchment palette is the most complete), fold the loose modal-chrome hex values and TheHermit's export hex values into named `--pp-*` variables, and delete the redundant literals.

2. **Hardcoded `'Press Start 2P'` string instead of the existing `var(--font-pixel)` token** (css/paper-ui-profile.css:271, 394) — user impact: none visually today since they resolve to the same font, but it silently breaks the single-source-of-truth font swap the codebase already has (`--font-pixel` in css/variables.css:19), and defeats the Hermit-only universal font switcher's own font-remap logic if `--font-pixel` is ever repointed. Fix: replace both literals with `var(--font-pixel)`.

3. **Specificity war between paper-ui-lobby.css's generic button rule and TheHermit's designer-export block in styles.css** (css/paper-ui-lobby.css:71-85 vs css/styles.css:4114-4148, both stacking `!important` to beat each other, on top of a pre-existing `!important` dark-terminal rule the lobby file itself had to out-`!important`) — user impact: the lobby's button styling is now three layers of override deep, effectively unmaintainable and one edit away from silently regressing. Fix: consolidate into a single lobby button rule; delete the TheHermit export block once its intended values are merged in, rather than layering.

Also worth fixing, not in the top 3: the native `window.confirm()` call in the Hermit-only UI editor's `clearAll()` (js/game-ui.js, `initUiEditor` block) drops the user into an unthemed browser dialog mid-flow; and `css/paper-ui.css`'s entire button/banner/holder system is dead code (explicitly marked "NOT wired into the game" at line 4) sitting alongside the live v1.3 skin, which is itself confusing for anyone picking this branch back up later — either wire it in or delete it.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

- Cheat panel button labels (js/game-ui.js:4619-4692) are concrete and specific: "Fill Stones", "Toggle Deck Browser", "Download Action Log", "Place Anywhere: ON/OFF", "🤖 Bot Brain: Dumb (greedy)" / "🧠 Bot Brain: Smart (lookahead)" / "🧠 Bot Brain: Hybrid" — none of the generic "Submit/OK/Click Here" patterns the rubric flags.
- Status-line copy is also specific: "Place anywhere: ON — stones may be placed on any empty tile" (js/game-ui.js:4655), "Bot brain: DUMB — one-step greedy scoring" (js/game-ui.js:4692). This is above-average copywriting for a dev tool.
- Regression: `window.confirm('Remove ALL live UI overrides (and font swaps) this session?')` (js/game-ui.js, `clearAll()` inside `initUiEditor`) is a raw native browser dialog with default OK/Cancel chrome, dropped into an otherwise custom-themed live editor. It's the one place copy and presentation both regress to generic browser default.
- Paper UI-skinned surfaces (lobby, profile) don't introduce new copy of their own — they only restyle existing strings — so no new generic-label risk there.

### Pillar 2: Visuals (2/4)

- `css/paper-ui.css` (188 lines) is an entire drafted component system — buttons, banners, holders — explicitly marked at the top: "Status: NOT wired into the game. Not imported by index.html or any other stylesheet." (paper-ui.css:4-5). It sources sprites from `assets/paper-ui/Content/` (the v1.1 "Paper UI System" pack per docs/paper-ui-design-system.md line 22-26).
- Meanwhile `css/paper-ui-lobby.css` and `css/paper-ui-profile.css` (the two files actually wired in) source a *different* pack entirely, `assets/paper-ui-menus/` (v1.3 "Humble Gift", darker tan/maroon palette per docs/paper-ui-design-system.md line 23-26). The design-system doc's own words: "Same creator, not the same asset — do not mix pieces from the two without checking the palette matches" (docs/paper-ui-design-system.md:29-30).
- Net result: the repo now ships two visually distinct "Paper UI" vocabularies (cream/green vs tan/maroon) plus a third overlay — TheHermit's hand-authored designer export in css/styles.css:4104-4148, which uses yet another color pair (`#4b0d0d`/`#4c0d0d` ink-red with `#e0d2af`/`#e4d8c9` parchment stroke) that matches neither the unused v1.1 palette nor the live v1.3 `--pp-*` variables. Someone opening the lobby, the profile modal, and the (currently dead) paper-ui.css gallery back to back would see three unrelated skins claiming to be the same design language.
- The lobby explicitly disables the profile modal's signature open animation ("Deliberately NOT using the profile modal's 1000ms literal unfold-on-open animation here", paper-ui-lobby.css:8-12), which is a reasonable UX call individually, but it directly contradicts the file's own header claim that lobby and profile "read as one system, not two" (paper-ui-lobby.css:2-6) — one of the two defining interactions of the system is present in one surface and absent in the other.
- Icon-only elements: `.pp-back-btn` (paper-ui-profile.css:425-444) is a circular back-chevron button with no visible text and no `aria-label` in the CSS (can't confirm the HTML side adds one without reading gamification-ui.js render calls in full, which was out of scope) — flagged as a likely a11y gap, not confirmed.

### Pillar 3: Color (1/4)

- css/variables.css defines the base game's palette: `--bg-dark`, `--bg-panel`, `--accent-gold`, `--accent-orange`, `--text-primary/secondary/muted`, `--border-subtle/accent` (variables.css:5-16). None of these are referenced anywhere in the three new Paper UI files.
- css/paper-ui-profile.css:18-29 instead defines an entirely new, parallel 11-variable palette (`--pp-parch`, `--pp-parch-lt`, `--pp-parch-dk`, `--pp-maroon`, `--pp-ink`, `--pp-ink-soft`, `--pp-gold`, `--pp-green`, `--pp-rust`, `--pp-locked`) with zero value overlap with the base tokens (e.g. base `--accent-gold: #e6c79c` vs new `--pp-gold: #8a5a1f` — same semantic role, different literal, different variable name).
- On top of that second palette, the "MODAL CHROME" section (paper-ui-profile.css:171-188) introduces seven *more* untokenized hex literals that don't even use the `--pp-*` set it just defined one screen up: `#14100d`, `#3a2a1f`, `#d9b98c` (used 3x), `#a85a5a`, `#241a14`, `#e8c9a0`, `#000`. These are one-off values, not variables — if the maroon needs to shift shade later, this section won't move with the rest of the system.
- A *third* untokenized color set appears in TheHermit's designer export (css/styles.css:4114-4148): `#e0d2af`, `#4b0d0d`, `#e4d8c9`, `#4c0d0d` — again a maroon/parchment pairing, again not reusing `--pp-maroon`/`--pp-parch` despite being visually adjacent to the same lobby the `--pp-*` tokens were built for.
- Net count: 3 non-communicating color systems (base game, `--pp-*`, and two pockets of raw hex) now live in the same project, for what the branch intends to be one cohesive skin. This is the clearest, most concrete piece of evidence for the user's own "made it worse" verdict — a change that was supposed to add visual cohesion instead multiplied the number of independent palettes in play.
- 60/30/10-style distribution can't be meaningfully assessed without rendering, but structurally there's no single accent variable being reused sparingly — accent-equivalent colors (`--pp-maroon`, `--pp-gold`, the raw `#4b0d0d`) are declared in at least three separate places, which is itself the opposite of a disciplined accent system.

### Pillar 4: Typography (2/4)

- css/variables.css declares three font tokens: `--font-pixel: 'Press Start 2P', 'Courier New', monospace`, `--font-terminal: 'VT323', ...`, `--font-mono` (variables.css:19-21).
- css/paper-ui-profile.css:271 and :394 both hardcode the literal string `font-family: 'Press Start 2P', var(--font-terminal), monospace` instead of writing `var(--font-pixel), var(--font-terminal), monospace`. Functionally identical today, but it duplicates a value that already has a name, and it's exactly the kind of literal the codebase's own Hermit-only "universal font switcher" (js/game-ui.js, `initUiEditor`'s `collectUsedFonts`/`applyFontMap`, lines ~6429-6466) depends on resolving consistently by computed font-family string — a silent trap for that feature if `--font-pixel` is ever repointed to a different family, since these two rules won't follow it.
- Font-size values introduced across the three new files: 9px (paper-ui-profile.css watermark-adjacent context — actually css/styles.css:4095, part of the same designer-export era), 12px (paper-ui-lobby.css:84, :133), 13px (paper-ui-profile.css:284, :411), 15px (paper-ui-profile.css:445), plus TheHermit's export adds 18px and 19px (css/styles.css:4122, 4131, 4138, 4146) — six distinct one-off sizes with no declared scale (css/variables.css has no `--font-size-*` scale at all, a pre-existing gap that this branch's new code inherits and adds three more ad hoc values into rather than establishing one).
- Font-weight: TheHermit's export explicitly forces `font-weight: normal !important` (css/styles.css:4119, 4127, 4136) specifically to *undo* a previous export's bold weight (per the comment at styles.css:4108-4111: "that one's black stroke + orange host-btn fill + bold weight are gone"), meaning weight has now been flip-flopped across two hand-authored export generations on the same four buttons.

### Pillar 5: Spacing (2/4)

- css/variables.css declares a clean 4px-multiple scale: `--space-xs: 4px`, `--space-sm: 8px`, `--space-md: 12px`, `--space-lg: 16px`, `--space-xl: 24px` (variables.css:37-41).
- None of the three new Paper UI files reference any `--space-*` variable. Every padding/margin/border-width value is a fresh literal.
- Several of those literals happen to land on scale values by coincidence (8px, 12px, 16px, 24px appear), but a comparable number do not: border-widths of 7px (paper-ui-profile.css:299, paper-ui-lobby.css:125), 10px (paper-ui-lobby.css:74), 14px (paper-ui-profile.css:343, paper-ui.css:56/58), 26px (paper-ui-profile.css:74/76, paper-ui-lobby.css:33/35); padding of `28px 64px` (paper-ui.css:111) and `12px 24px` (paper-ui.css:128); inset offsets of `-14px` (paper-ui-profile.css:71, paper-ui-lobby.css:30) and `-6px` (paper-ui-profile.css:339).
- Several of these one-offs are driven by pixel-exact sprite-border math (documented, e.g. paper-ui-profile.css:85-92's border-image peak-reach recalculation) rather than a design decision — understandable given the asset constraint, but it means the spacing scale has effectively been abandoned for anything sprite-adjacent, with no attempt to reconcile the two systems (e.g. rounding sprite border-widths to the nearest scale step where the asset tolerates it).
- `.pp-player-row` (paper-ui-lobby.css:168-178) uses `padding: 10px; margin: 5px 0;` — both off-scale (10 and 5 are not in the 4/8/12/16/24 set), for a component with no sprite-precision justification, showing the off-scale drift isn't fully explained by asset math alone.

### Pillar 6: Experience Design (2/4)

- Positive: reduced-motion handling is present and consistent across all three new files (paper-ui-lobby.css:188-190, paper-ui-profile.css:144-151, plus the highlighter animation at paper-ui-profile.css:360-362) — this is a real accessibility win the base game didn't necessarily have everywhere.
- Positive: disabled/locked/owned states are handled with clear, consistent opacity treatment: `.gami-badge-card.locked { opacity: 0.55 }`, `.gami-cos-btn.cant-afford { opacity: 0.5; cursor: default }`, `.gami-shop-item.owned { opacity: 0.65 }` (paper-ui-profile.css:211, 313, 213).
- Negative: the panel open animation (paper-ui-profile.css:93-105) is a hand-tuned, literally-reverse-engineered 1000ms keyframe sequence with a documented workaround for a real clipping bug encountered during development (paper-ui-profile.css:85-92: "mapping 183px alone to our 100% leaves zero room for that bounce (tried it — it clipped against .gami-modal's overflow:hidden)"). This is a fragile foundation: any future change to `#gami-content`'s width, the modal's overflow behavior, or the border-image assets risks silently reintroducing the same clipping, and the fix that's in place is a magic-number recalculation (`204px` peak-reach) rather than a robust layout technique.
- Negative: that same 1000ms delay is explicitly why the lobby had to be given a *different*, static (non-animated) treatment (paper-ui-lobby.css:8-12: "the lobby is part of the page flow ... and that animation replaying on every visit was exactly the 'screens take too long to start loading' complaint"). This is direct evidence, in the developer's own words, that the flagship animation feature actively hurt perceived performance before being scoped down — a real regression the branch had to walk back mid-stream.
- Negative: the Hermit-only UI editor's "clear all overrides" action uses a native `window.confirm()` (js/game-ui.js, `clearAll()`) rather than a themed confirmation, breaking flow for a destructive action inside an otherwise fully custom-built live editor panel.
- Neutral/scope note: the cheat panel itself (js/game-ui.js:4573-4820, `initCheatPanel`) is NOT reskinned with Paper UI at all — it keeps its original dark inline-style treatment (`#1a1a2e` background, `#2d2d44` buttons). This means the "cheat screens" the user asked about are visually split: the oldest/most-used dev panel is untouched, while the newer Hermit-only UI editor panel (js/game-ui.js:6519-6721, also plain dark inline styles, not Paper UI) and the player-facing lobby/profile are on three different visual tracks. If the goal was a unified developer-tool skin, it hasn't reached the actual cheat panel or UI editor at all — only the player-facing lobby and profile modal.

---

## Files Audited

- `css/paper-ui.css`
- `css/paper-ui-lobby.css`
- `css/paper-ui-profile.css`
- `css/variables.css` (baseline comparison)
- `css/base.css`, `css/styles.css`, `css/components.css` (baseline comparison; `css/styles.css` also directly audited for TheHermit's designer-export block, lines ~4095-4148)
- `docs/paper-ui-design-system.md`
- `paper-ui-preview.html`
- `js/game-ui.js` (grep + targeted read: cheat panel `initCheatPanel` lines 4573-4820+, Hermit-only live UI editor `initUiEditor` lines 6366-6820+, Hermit-only dev menu `initHermitMenu` lines 6937+)
- `js/gamification-ui.js` (grep for `paper-ui`/`gami_openPanel`/`gami_switchTab`/`pp-fresh-open` wiring)
- `js/bot-arena.js` (grep only; no cheat/Hermit/paper-ui matches of note beyond what game-ui.js already surfaced)
