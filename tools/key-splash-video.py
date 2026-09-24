#!/usr/bin/env python3
"""Bake the boot splash's chroma key into a transparent (VP9 alpha) WebM.

js/boot-splash.js used to key the splash video's near-white background out
in JavaScript, pixel by pixel, 30 times a second. This script runs the SAME
key once, offline, on every frame and writes video/splash-intro-alpha.webm,
which Chrome/Edge/Firefox play with the background already transparent, so
the page only has to draw each frame. Safari/iOS can't decode WebM alpha and
keep using the original MP4 + the in-page key (still in boot-splash.js).

Re-run this whenever video/splash-intro.mp4 changes. Keep the constants in
step with the ones in js/boot-splash.js (KEY_*, INNER, OUTER,
EDGE_DARKEN_MIN, EDGE_TRIM_PX, TOP_TRIM_PX, the 3x3 alpha median).

Needs: numpy, and an ffmpeg with libvpx-vp9 on PATH (or set FFMPEG=...).
    python3 tools/key-splash-video.py
"""
import os
import subprocess
import sys

import numpy as np

SRC = 'video/splash-intro.mp4'
DST = 'video/splash-intro-alpha.webm'
FFMPEG = os.environ.get('FFMPEG', 'ffmpeg')

# ── Same values as js/boot-splash.js ─────────────────────────────────────
KEY = np.array([0xFC, 0xFF, 0xFC], dtype=np.int16)
INNER, OUTER = 26, 70
EDGE_DARKEN_MIN = 0.55
EDGE_TRIM_PX = 3
TOP_TRIM_PX = 24


def probe_size():
    out = subprocess.run([FFMPEG, '-hide_banner', '-i', SRC], capture_output=True, text=True).stderr
    for tok in out.replace(',', ' ').split():
        if 'x' in tok:
            w, _, h = tok.partition('x')
            if w.isdigit() and h.isdigit() and int(w) > 16:
                return int(w), int(h)
    sys.exit('could not read video size from ffmpeg')


def median3x3(a):
    """3x3 median with in-bounds neighbours only, like medianAlphaChannel():
    edge pixels take the median of 4 or 6 values (upper-middle for even
    counts — JS uses sorted[count >> 1])."""
    h, w = a.shape
    pad = np.pad(a.astype(np.int16), 1, constant_values=-1)  # -1 = out of bounds
    stack = np.stack([pad[dy:dy + h, dx:dx + w] for dy in range(3) for dx in range(3)])
    valid = stack >= 0
    count = valid.sum(axis=0)
    # Push out-of-bounds entries past the top so they sort last.
    s = np.sort(np.where(valid, stack, 999), axis=0)
    idx = (count >> 1)[None]
    return np.take_along_axis(s, idx, axis=0)[0].astype(np.uint8)


def key_frame(rgb):
    h, w, _ = rgb.shape
    px = rgb.astype(np.int16)
    dist = np.abs(px - KEY).max(axis=2)
    alpha = np.full((h, w), 255, dtype=np.float32)
    darken = np.ones((h, w), dtype=np.float32)
    alpha[dist <= INNER] = 0
    band = (dist > INNER) & (dist < OUTER)
    frac = (dist[band] - INNER) / (OUTER - INNER)
    alpha[band] = np.round(255 * frac)
    darken[band] = EDGE_DARKEN_MIN + (1 - EDGE_DARKEN_MIN) * frac
    # Round half-to-even, like writing into a Uint8ClampedArray in JS.
    out_rgb = np.clip(np.rint(px * darken[..., None]), 0, 255)
    # Trimmed margins are never drawn in boot-splash.js (drawVideoFrame).
    keep = np.zeros((h, w), dtype=bool)
    keep[TOP_TRIM_PX:h - EDGE_TRIM_PX, EDGE_TRIM_PX:w - EDGE_TRIM_PX] = True
    alpha[~keep] = 0
    alpha = median3x3(alpha.astype(np.uint8))
    return np.dstack([out_rgb.astype(np.uint8), alpha])


def main():
    w, h = probe_size()
    dec = subprocess.Popen([FFMPEG, '-v', 'error', '-i', SRC, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                           stdout=subprocess.PIPE)
    enc = subprocess.Popen([FFMPEG, '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba',
                            '-s', f'{w}x{h}', '-r', '30', '-i', '-',
                            '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '24',
                            '-row-mt', '1', '-auto-alt-ref', '0', DST], stdin=subprocess.PIPE)
    n = 0
    frame_bytes = w * h * 3
    while True:
        buf = dec.stdout.read(frame_bytes)
        if len(buf) < frame_bytes:
            break
        rgb = np.frombuffer(buf, dtype=np.uint8).reshape(h, w, 3)
        enc.stdin.write(key_frame(rgb).tobytes())
        n += 1
    enc.stdin.close()
    enc.wait()
    dec.wait()
    print(f'{n} frames -> {DST} ({os.path.getsize(DST) / 1024:.0f} KB)')


if __name__ == '__main__':
    main()
