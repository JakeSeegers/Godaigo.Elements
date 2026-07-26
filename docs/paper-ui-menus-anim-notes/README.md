# Settings panel open animation — source data

`css/paper-ui-settings.css`'s `pp-panel-unfold` keyframes are decoded
directly from `art-source/paper-ui-menus/Aseprite/5 Settings Menu v1.3.aseprite`
(a real Aseprite project file, not a guess) — specifically the
`Pause Menu > Base` layer (layer index 17), frames 13-19.

`.aseprite` is a documented binary format: a 128-byte file header, then
one frame header + a sequence of chunks per frame (Cel chunks carry each
layer's per-frame position/size and, for `cel type 2`, zlib-compressed
RGBA pixel data). No aseprite CLI or Python library was available in this
environment, so a minimal parser was written by hand for this file to:
1. Walk frame headers to get real per-frame duration (ms).
2. Walk LAYER chunks to build the layer tree (name/parent/group), to find
   `Pause Menu` (group) > `Base` (its animated background/frame layer).
3. Walk CEL chunks for that one layer across all frames, reading x/y/w/h.
4. For the two attached PNGs (frames 13 and 19), also zlib-decompress the
   cel's actual pixel payload and re-encode it as a real PNG (via a
   headless-canvas ImageData → toDataURL round trip) to visually confirm
   the decode was correct before trusting the numbers.

Findings used in the CSS: the panel is invisible frames 0-12, appears at
frame 13 as a 37px-wide strip (full height already), widens over frames
14-19 to its full 183px (frame 19 = literal 100%), all at ~100ms/frame
(600ms total) — height never changes, only width. Frames 19-23 (not
reproduced) add a few px of side-to-side settle that only works in the
source's own canvas, which has empty margin around the panel for it to
move into; our panel fills 100% of its container, so that nudge has
nowhere to go but past the edge — it was tried and clipped against
`.gami-modal`'s `overflow:hidden`, so it was dropped rather than shipped
as a visible glitch.

Files here: `decoded-f13-open-start.png` (37×280, the very first visible
frame) and `decoded-f19-open-end.png` (183×280, first frame at full
width) — the two extremes of the reproduced range, kept as evidence this
was measured, not eyeballed.
