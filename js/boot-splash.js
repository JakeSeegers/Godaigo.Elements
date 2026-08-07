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
    // any point (mid-playback or after), crossfades the whole thing away.
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
        // Video background is #FBFCF3 (near-white). Two-threshold feather —
        // fully transparent inside INNER, fully opaque outside OUTER, linear
        // fade between — so edges around the logo don't look like a
        // hard-cut sticker. Tune these three if real playback shows
        // fringing or eats into the artwork's own pale pink/green tones.
        const KEY_R = 0xFB, KEY_G = 0xFC, KEY_B = 0xF3;
        const INNER = 18, OUTER = 45;

        // ── Wave + shimmer ────────────────────────────────────────────
        // Wave: the frame is drawn in thin horizontal strips, each nudged
        // sideways by a slow sine wave (classic heat-shimmer/water-ripple
        // technique) instead of one flat drawImage — cheap, since it's a
        // handful of extra draw calls, not extra per-pixel work.
        // Shimmer: a gentle whole-logo brightness pulse, folded into the
        // same per-pixel loop the chroma key already runs, so it's nearly
        // free. Keep all four amplitude/speed constants small — "slightly"
        // wavy/shimmery was the ask, not a full liquid-glitch effect.
        const STRIP_H          = 3;      // px per wave strip — smaller = smoother, more draw calls
        const WAVE_AMPLITUDE   = 4;       // px horizontal displacement
        const WAVE_LENGTH      = 90;      // px per vertical sine cycle — bigger = gentler
        const WAVE_SPEED       = 0.0011;  // radians/ms — how fast the wave drifts
        const SHIMMER_AMPLITUDE = 10;     // brightness delta, 0-255 scale
        const SHIMMER_SPEED     = 0.002;  // radians/ms

        function clamp8(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

        function drawWavyVideo(t) {
            const w = canvas.width, h = canvas.height;
            for (let y = 0; y < h; y += STRIP_H) {
                const dx = Math.sin(y / WAVE_LENGTH + t * WAVE_SPEED) * WAVE_AMPLITUDE;
                const sh = Math.min(STRIP_H, h - y);
                ctx.drawImage(video, 0, y, w, sh, dx, y, w, sh);
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
                    continue; // fully transparent — nothing to shimmer
                }
                if (dist < OUTER) {
                    d[i + 3] = Math.round(255 * (dist - INNER) / (OUTER - INNER));
                }
                d[i]     = clamp8(d[i]     + shimmer);
                d[i + 1] = clamp8(d[i + 1] + shimmer);
                d[i + 2] = clamp8(d[i + 2] + shimmer);
            }
            ctx.putImageData(frame, 0, 0);
        }

        function drawFrame(t) {
            if (!canvas.width) return; // metadata not loaded yet — next tick retries
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawWavyVideo(t);
            keyAndShimmerFrame(t);
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
            // Remove after the crossfade finishes so it can't intercept
            // clicks or linger in the DOM (matches the CSS opacity
            // transition, +margin).
            setTimeout(() => { splash.remove(); }, 900);
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
