#!/usr/bin/env python3
"""Aseprite (.aseprite) structural auditor — no external deps.

Parses the documented binary format directly: file header, then per-frame
chunk streams (LAYER, CEL, TAGS chunks). Produces a layer tree, all tags,
and a per-layer temporal summary (first/last frame with real pixel data,
how many DISTINCT real cels vs how many frames just re-show an earlier
one via a "linked" cel) — enough to spot which layers are static art vs
which ones actually animate, and roughly how much.

Usage: ase_audit.py <file.aseprite>
"""
import struct, sys

def parse(path):
    with open(path, 'rb') as f:
        data = f.read()

    (file_size, magic, n_frames, width, height, color_depth, flags, speed,
     res1, res2, transparent_idx, ignore1, ignore2, ignore3, n_colors,
     px_w, px_h, grid_x, grid_y, grid_w, grid_h) = struct.unpack_from(
        '<IHHHHHIHIIBBBBHBBhhHH', data, 0)
    assert magic == 0xA5E0, f"bad magic in {path}"

    pos = 128
    layers = []          # (index, name, childlevel, ltype, opacity)
    tags = []            # (name, from, to, direction)
    frame_durations = []
    # per layer_index: list of (frame_idx, celtype, w, h) for REAL cels only (0 or 2)
    # plus a separate count of LINKED cels (celtype==1) referencing this layer
    layer_real_cels = {}
    layer_linked_count = {}

    layer_index = 0
    for fi in range(n_frames):
        frame_start = pos
        bytes_in_frame, fmagic, old_n_chunks, duration, _res, new_n_chunks = \
            struct.unpack_from('<IHHH2sI', data, pos)
        assert fmagic == 0xF1FA, f"bad frame magic frame {fi} in {path}"
        n_chunks = new_n_chunks if old_n_chunks == 0xFFFF else old_n_chunks
        frame_durations.append(duration)
        cpos = pos + 16
        for ci in range(n_chunks):
            csize, ctype = struct.unpack_from('<IH', data, cpos)
            if ctype == 0x2004:  # LAYER
                flags_, ltype, childlvl, dw, dh, blend, opac = \
                    struct.unpack_from('<HHHHHHB', data, cpos+6)
                name_len = struct.unpack_from('<H', data, cpos+6+13+3)[0]
                name = data[cpos+6+13+3+2: cpos+6+13+3+2+name_len].decode('utf-8', 'replace')
                layers.append((layer_index, name, childlvl, ltype, opac))
                layer_index += 1
            elif ctype == 0x2005:  # CEL
                lidx, x, y, opac2, celtype, zidx = struct.unpack_from('<HhhBHh', data, cpos+6)
                if celtype in (0, 2):
                    w, h = struct.unpack_from('<HH', data, cpos+6+11+5)
                    layer_real_cels.setdefault(lidx, []).append((fi, celtype, w, h))
                elif celtype == 1:
                    layer_linked_count[lidx] = layer_linked_count.get(lidx, 0) + 1
            elif ctype == 0x2018:  # TAGS
                n_tags = struct.unpack_from('<H', data, cpos+6)[0]
                tpos = cpos + 6 + 2 + 8
                for ti in range(n_tags):
                    frm, to, direction = struct.unpack_from('<HHB', data, tpos)
                    tpos += 2+2+1 + 8 + 3 + 1
                    name_len = struct.unpack_from('<H', data, tpos)[0]
                    tpos += 2
                    name = data[tpos:tpos+name_len].decode('utf-8', 'replace')
                    tpos += name_len
                    tags.append((name, frm, to, direction))
            cpos += csize
        pos = frame_start + bytes_in_frame

    return {
        'path': path, 'n_frames': n_frames, 'width': width, 'height': height,
        'color_depth': color_depth, 'total_ms': sum(frame_durations),
        'layers': layers, 'tags': tags,
        'layer_real_cels': layer_real_cels, 'layer_linked_count': layer_linked_count,
    }

def report(info):
    p = info['path']
    print(f"\n{'='*100}\n{p}\n{'='*100}")
    print(f"frames={info['n_frames']} canvas={info['width']}x{info['height']} "
          f"depth={info['color_depth']}bpp total={info['total_ms']}ms")
    if info['tags']:
        print("TAGS:")
        for name, frm, to, d in info['tags']:
            print(f"  '{name}'  frames {frm}-{to}  dir={d}")
    else:
        print("TAGS: (none)")

    print("LAYER TREE (+ real-cel frame range / count, linked-cel count):")
    for idx, name, lvl, ltype, opac in info['layers']:
        real = info['layer_real_cels'].get(idx, [])
        linked = info['layer_linked_count'].get(idx, 0)
        if real:
            fmin = min(r[0] for r in real); fmax = max(r[0] for r in real)
            sizes = sorted(set((r[2], r[3]) for r in real))
            extent = f"real cels: {len(real)} spanning frames {fmin}-{fmax}; sizes seen: {sizes[:4]}{'...' if len(sizes)>4 else ''}"
        else:
            extent = "no real cels"
        tag = 'GROUP' if ltype == 1 else 'layer'
        print(f"{'  '*lvl}[{idx:3d}] {tag:5s} {name:30s} {extent}  (+{linked} linked)")

if __name__ == '__main__':
    for path in sys.argv[1:]:
        try:
            report(parse(path))
        except Exception as e:
            print(f"\n=== {path} ===\nFAILED: {e}")
