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

        function keyFrame() {
            const w = canvas.width, h = canvas.height;
            if (!w || !h) return;
            const frame = ctx.getImageData(0, 0, w, h);
            const d = frame.data;
            for (let i = 0; i < d.length; i += 4) {
                const dr = Math.abs(d[i]     - KEY_R);
                const dg = Math.abs(d[i + 1] - KEY_G);
                const db = Math.abs(d[i + 2] - KEY_B);
                const dist = Math.max(dr, dg, db);
                if (dist <= INNER) {
                    d[i + 3] = 0;
                } else if (dist < OUTER) {
                    d[i + 3] = Math.round(255 * (dist - INNER) / (OUTER - INNER));
                }
                // else dist >= OUTER: leave alpha at 255, fully opaque.
            }
            ctx.putImageData(frame, 0, 0);
        }

        function drawFrame() {
            if (!canvas.width) return; // metadata not loaded yet — next tick retries
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            keyFrame();
        }

        let rafId = null;
        function loop() {
            drawFrame();
            if (!video.paused && !video.ended) rafId = requestAnimationFrame(loop);
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
            drawFrame(); // make sure the canvas matches the true final frame
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
