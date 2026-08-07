(function () {
    'use strict';

    // ── Boot Splash ──────────────────────────────────────────────────────
    // Studio/logo intro video, shown once per page load ahead of the lobby.
    // The video's own (near-white) background is chroma-keyed out in real
    // time on a canvas so js/parallax.js's already-running moving
    // background (it injects straight into #lobby-wrapper, underneath
    // this) shows through around the logo instead of a flat backdrop.
    // Plays muted+autoplay (guaranteed to work with no prior user gesture —
    // there is no audio to preserve here), lingers on its last frame once
    // it ends, then fades in a "press any key" prompt. Any key or click, at
    // any point (mid-playback or after), fades the whole thing out — fully,
    // before the login screen starts its own fade-in (see css/boot-splash.css;
    // sequential on purpose, not a crossfade).
    // Just before the video reaches its end, images/Final Logo Sign In.png
    // (same pixel dimensions as the video, so it lines up with zero extra
    // positioning math) crossfades in on top, chroma-keyed the same way —
    // see "Sign-in logo overlay" below.
    //
    // An inline <script> right after #boot-splash's markup (before
    // #lobby-wrapper even exists in the DOM, so there's zero flash) already
    // added body.boot-splash-active, which hides #auth-screen /
    // #multiplayer-lobby via css/boot-splash.css — they visually collided
    // with the logo animation. revealLogin() below is the only thing that
    // removes that class, and it's reachable from every exit path,
    // including setup failure, so a broken splash can never permanently
    // hard-lock the player out of logging in.

    function revealLogin() {
        document.body.classList.remove('boot-splash-active');
    }

    const splash = document.getElementById('boot-splash');
    const video  = document.getElementById('boot-splash-video');
    const canvas = document.getElementById('boot-splash-canvas');
    const prompt = document.getElementById('boot-splash-prompt');
    if (!splash || !video || !canvas || !prompt) { revealLogin(); return; }

    try {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        // ── Chroma key ──────────────────────────────────────────────────
        // Video background is #FCFFFC (near-white). Two-threshold feather —
        // fully transparent inside INNER, fully opaque outside OUTER, linear
        // fade between — so edges around the logo don't look like a
        // hard-cut sticker. Widened past the original 18/45 (per request)
        // to pull more of the near-white background out and soften the
        // transition into a visibly fuzzier edge; the logo art itself is
        // also pale, so push these further only if playback still shows a
        // white fringe — past a point it starts eating the artwork's own
        // pale tones instead.
        const KEY_R = 0xFC, KEY_G = 0xFF, KEY_B = 0xFC;
        const INNER = 26, OUTER = 70;
        // The video's H.264 compression introduces per-pixel noise right
        // around the key color, so a handful of edge pixels land just
        // outside INNER on any given frame and pop as a bright fleck
        // against the (usually dark) background behind them — "speckle".
        // Two independent mitigations, both applied only in the
        // INNER..OUTER feather band (solid interior artwork untouched):
        // EDGE_DARKEN_MIN dims a stray fleck's brightness so it blends in
        // instead of standing out, and medianAlphaChannel() (below) cleans
        // up isolated noisy alpha pixels. Deliberately a median filter, not
        // a box/mean blur — a mean blur softens every pixel it touches
        // (made the whole logo read as blurry, not just its edges); a
        // median filter only overrides a pixel that disagrees with its
        // neighbors, so continuous real gradients pass through untouched
        // and just the salt-and-pepper noise gets cleaned up.
        const EDGE_DARKEN_MIN = 0.55;

        // ── Shimmer ────────────────────────────────────────────────────
        // A gentle whole-logo brightness pulse, folded into the same
        // per-pixel loop the chroma key already runs, so it's nearly free.
        // (Wave distortion removed — was drawing the frame in offset
        // horizontal strips; dropped per request.)
        const SHIMMER_AMPLITUDE = 10;     // brightness delta, 0-255 scale
        const SHIMMER_SPEED     = 0.002;  // radians/ms

        function clamp8(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

        // ── Sign-in logo overlay ───────────────────────────────────────
        // images/Final Logo Sign In.png is 852x480 — exactly the video's
        // raw decoded frame size (confirmed against the mp4's tkhd box),
        // so it's drawn 1:1 onto the canvas with no scaling/offset math.
        // Its flat background is a solid #B174E7 (confirmed by sampling
        // the file), chroma-keyed out the same two-threshold-feather way
        // as the video above so the same parallax background shows
        // through around it. Keyed once into an offscreen canvas on load
        // (cheap — it's a still image, not a per-frame video decode) and
        // faded in over the last SIGNIN_FADE_SECONDS of playback by
        // ramping globalAlpha; video.currentTime holds at video.duration
        // once 'ended' fires, so alpha naturally settles at 1 and stays
        // there through the "press any key" wait with no extra state.
        const SIGNIN_KEY_R = 0xB1, SIGNIN_KEY_G = 0x74, SIGNIN_KEY_B = 0xE7;
        const SIGNIN_INNER = 18, SIGNIN_OUTER = 45;
        // Shortened from the original 0.8s (per request) — the crossfade
        // between the video and this overlay now happens quicker.
        const SIGNIN_FADE_SECONDS = 0.45;

        let signInCanvas = null; // set once the image has loaded + been keyed
        const signInImg = new Image();
        signInImg.addEventListener('load', () => {
            const off = document.createElement('canvas');
            off.width = signInImg.naturalWidth;
            off.height = signInImg.naturalHeight;
            const octx = off.getContext('2d');
            octx.drawImage(signInImg, 0, 0);
            const frame = octx.getImageData(0, 0, off.width, off.height);
            const d = frame.data;
            for (let i = 0; i < d.length; i += 4) {
                const dr = Math.abs(d[i]     - SIGNIN_KEY_R);
                const dg = Math.abs(d[i + 1] - SIGNIN_KEY_G);
                const db = Math.abs(d[i + 2] - SIGNIN_KEY_B);
                const dist = Math.max(dr, dg, db);
                if (dist <= SIGNIN_INNER) {
                    d[i + 3] = 0;
                } else if (dist < SIGNIN_OUTER) {
                    // Scale (not overwrite) so any anti-aliasing already
                    // baked into the PNG's own alpha channel is preserved.
                    d[i + 3] = Math.round(d[i + 3] * (dist - SIGNIN_INNER) / (SIGNIN_OUTER - SIGNIN_INNER));
                }
            }
            octx.putImageData(frame, 0, 0);
            signInCanvas = off; // only assign once fully keyed — drawSignInOverlay checks this
        });
        // If the image 404s or fails to decode, the splash still plays
        // fine — signInCanvas just never gets set and drawSignInOverlay()
        // stays a no-op.
        signInImg.addEventListener('error', () => {
            console.warn('Boot splash: sign-in logo failed to load, skipping overlay');
        });
        signInImg.src = 'images/Final Logo Sign In.png';

        function drawSignInOverlay() {
            if (!signInCanvas || !video.duration || !isFinite(video.duration)) return;
            const remaining = video.duration - video.currentTime;
            if (remaining >= SIGNIN_FADE_SECONDS) return;
            const alpha = 1 - Math.max(0, remaining) / SIGNIN_FADE_SECONDS;
            const prevAlpha = ctx.globalAlpha;
            ctx.globalAlpha = alpha;
            ctx.drawImage(signInCanvas, 0, 0, canvas.width, canvas.height);
            ctx.globalAlpha = prevAlpha;
        }

        // H.264 encodes in 16px macroblocks; whichever of a video's
        // width/height isn't a multiple of 16 gets a padding row/column on
        // decode that doesn't crop cleanly — a solid, flat-colored edge
        // artifact distinct from the real background color (confirmed on
        // two different source videos so far: one had it on the bottom row,
        // the next had it on the right column instead, depending on which
        // dimension didn't divide evenly). Trimming a small margin off all
        // four edges unconditionally, rather than diagnosing which specific
        // edge is affected each time a video gets swapped, costs nothing
        // visually and is robust to whatever the next file's dimensions are.
        const EDGE_TRIM_PX = 3;
        // This particular source clip also has a small stray blob baked
        // into the top-right of its first few frames (roughly x:603-614,
        // y:10-20 at 852x480) — real content, not an encoder artifact; it
        // gets covered by the paint animation within ~0.15s but is visible
        // right at the start. Cropping the top down past it is simpler and
        // more robust than trying to mask just that one region for just
        // those first few frames.
        const TOP_TRIM_PX = 24;

        function drawVideoFrame() {
            const vw = video.videoWidth, vh = video.videoHeight;
            const sw = Math.max(1, vw - EDGE_TRIM_PX * 2);
            const sh = Math.max(1, vh - TOP_TRIM_PX - EDGE_TRIM_PX);
            ctx.drawImage(video, EDGE_TRIM_PX, TOP_TRIM_PX, sw, sh, EDGE_TRIM_PX, TOP_TRIM_PX, sw, sh);
        }

        // This source clip's actual frame 0 is a stray dark lead-in frame
        // baked into the file itself (confirmed with ffmpeg: frame 1
        // averages to a dark rgb(121,111,122); every frame after it
        // averages to a near-white rgb(255,250,255)) — not a browser-
        // readiness thing. Skip drawing several frames up front, generous
        // margin past the 1 confirmed-dark one — this is belt-and-suspenders
        // with the CSS-side hard hold in css/boot-splash.css (independent,
        // time-based rather than frame-count-based, so a bug in one doesn't
        // sink both).
        const SKIP_FIRST_N_FRAMES = 6;
        let framesDrawn = 0;

        // 3x3 median filter on just the alpha channel — unlike a box/mean
        // blur, a median only ever replaces a pixel that disagrees with
        // its neighborhood (exactly what a compression-noise speckle is),
        // so a smooth intentional gradient — which is already locally
        // consistent — passes through essentially unchanged. Cheap: at
        // most 9 taps per pixel, tiny selection sort (no generic
        // Array#sort comparator overhead) to find the middle value.
        function medianAlphaChannel(d, w, h) {
            const n = w * h;
            const src = new Uint8ClampedArray(n);
            for (let p = 0; p < n; p++) src[p] = d[p * 4 + 3];
            const win = new Uint8ClampedArray(9);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    let count = 0;
                    for (let dy = -1; dy <= 1; dy++) {
                        const sy = y + dy;
                        if (sy < 0 || sy >= h) continue;
                        const row = sy * w;
                        for (let dx = -1; dx <= 1; dx++) {
                            const sx = x + dx;
                            if (sx < 0 || sx >= w) continue;
                            win[count++] = src[row + sx];
                        }
                    }
                    for (let a = 0; a < count - 1; a++) {
                        let m = a;
                        for (let b = a + 1; b < count; b++) if (win[b] < win[m]) m = b;
                        if (m !== a) { const tmp = win[a]; win[a] = win[m]; win[m] = tmp; }
                    }
                    d[(y * w + x) * 4 + 3] = win[count >> 1];
                }
            }
        }

        function keyAndShimmerFrame(t) {
            const w = canvas.width, h = canvas.height;
            const frame = ctx.getImageData(0, 0, w, h);
            const d = frame.data;
            const shimmer = Math.sin(t * SHIMMER_SPEED) * SHIMMER_AMPLITUDE;
            for (let i = 0; i < d.length; i += 4) {
                const dr = Math.abs(d[i]     - KEY_R);
                const dg = Math.abs(d[i + 1] - KEY_G);
                const db = Math.abs(d[i + 2] - KEY_B);
                const dist = Math.max(dr, dg, db);
                if (dist <= INNER) {
                    d[i + 3] = 0;
                    continue; // fully transparent — nothing to shimmer or darken
                }
                let darken = 1;
                if (dist < OUTER) {
                    const alphaFrac = (dist - INNER) / (OUTER - INNER);
                    d[i + 3] = Math.round(255 * alphaFrac);
                    // Worst right at the edge (alphaFrac -> 0, darken ->
                    // EDGE_DARKEN_MIN), fading to no effect (darken -> 1)
                    // by the time a pixel is fully opaque.
                    darken = EDGE_DARKEN_MIN + (1 - EDGE_DARKEN_MIN) * alphaFrac;
                }
                d[i]     = clamp8((d[i]     + shimmer) * darken);
                d[i + 1] = clamp8((d[i + 1] + shimmer) * darken);
                d[i + 2] = clamp8((d[i + 2] + shimmer) * darken);
            }
            medianAlphaChannel(d, w, h);
            ctx.putImageData(frame, 0, 0);
        }

        function drawFrame(t) {
            // canvas.width alone isn't a safe "ready" check — an untouched
            // <canvas> defaults to 300x150 (non-zero!) before loadedmetadata
            // sets the real size, so this used to let the loop draw a frame
            // or two of default/black video content while still "loading".
            // The chroma key only ever REMOVES opacity, never adds it, so
            // that dark not-ready content stayed fully opaque — and with
            // the drop-shadow glow added, that was a flashed glowing box on
            // load. readyState >= HAVE_CURRENT_DATA guarantees an actual
            // decoded frame exists (and, being a later state, that metadata
            // — hence real canvas dimensions — is already set too).
            if (!canvas.width || video.readyState < video.HAVE_CURRENT_DATA) return;
            if (framesDrawn < SKIP_FIRST_N_FRAMES) { framesDrawn++; return; }
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawVideoFrame();
            keyAndShimmerFrame(t);
            drawSignInOverlay();
        }

        // Keeps redrawing (and so keeps waving/shimmering) even once the
        // video itself has frozen on its last frame — a paused/ended
        // <video> still yields that frame to drawImage(), so this reads
        // identically whether it's actually playing or not. Runs until
        // dismiss(), not until the video ends. Throttled well below native
        // refresh rate: plenty smooth for a gentle wave, cheaper to keep
        // running indefinitely while waiting on "press any key".
        const FRAME_INTERVAL = 1000 / 30;
        let rafId = null;
        let lastDraw = 0;
        function loop(now) {
            if (now - lastDraw >= FRAME_INTERVAL) {
                lastDraw = now;
                drawFrame(now);
            }
            rafId = requestAnimationFrame(loop);
        }

        video.addEventListener('loadedmetadata', () => {
            canvas.width  = video.videoWidth;
            canvas.height = video.videoHeight;
        });

        let dismissed = false;

        function showPrompt() {
            prompt.classList.add('boot-splash-prompt-visible');
        }

        function onEnded() {
            // No need to force a redraw — loop() keeps drawing every tick
            // regardless of playback state, wave/shimmer included.
            showPrompt();
        }

        function dismiss() {
            if (dismissed) return;
            dismissed = true;
            document.removeEventListener('keydown', dismiss);
            document.removeEventListener('click', dismiss);
            video.removeEventListener('ended', onEnded);
            video.removeEventListener('error', showPrompt);
            if (rafId) cancelAnimationFrame(rafId);
            splash.classList.add('boot-splash-hidden');
            revealLogin();
            video.pause();
            // Remove after the fade-out finishes so it can't intercept
            // clicks or linger in the DOM (matches css/boot-splash.css's
            // 1.4s #boot-splash fade-out, +margin).
            setTimeout(() => { splash.remove(); }, 1500);
        }

        video.addEventListener('ended', onEnded);
        // Defensive: if the video can't play at all (unsupported format,
        // blocked, slow network, missing file), don't strand the player on
        // a black screen forever — surface the prompt so there's still a
        // way through.
        video.addEventListener('error', showPrompt);

        document.addEventListener('keydown', dismiss);
        document.addEventListener('click', dismiss);

        video.play().then(() => {
            rafId = requestAnimationFrame(loop);
        }).catch(() => {
            // Even muted autoplay was blocked (rare) — skip straight to
            // the prompt so there's still something for the player to act
            // on.
            showPrompt();
        });
    } catch (e) {
        // Whatever went wrong, the login screen must not stay hidden.
        console.warn('Boot splash failed to initialize:', e);
        revealLogin();
    }
})();
