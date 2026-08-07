(function () {
    'use strict';

    // ── Boot Splash ──────────────────────────────────────────────────────
    // Studio/logo intro video, shown once per page load ahead of the lobby.
    // Plays muted+autoplay (guaranteed to work with no prior user gesture —
    // there is no audio to preserve here), lingers on its last frame once
    // it ends, then fades in a "press any key" prompt. Any key or click, at
    // any point (mid-playback or after), crossfades the whole thing away.
    // No game deps — safe to load first.

    const splash = document.getElementById('boot-splash');
    const video  = document.getElementById('boot-splash-video');
    const prompt = document.getElementById('boot-splash-prompt');
    if (!splash || !video || !prompt) return;

    let dismissed = false;

    function showPrompt() {
        prompt.classList.add('boot-splash-prompt-visible');
    }

    function dismiss() {
        if (dismissed) return;
        dismissed = true;
        document.removeEventListener('keydown', dismiss);
        document.removeEventListener('click', dismiss);
        video.removeEventListener('ended', showPrompt);
        video.removeEventListener('error', dismiss);
        splash.classList.add('boot-splash-hidden');
        video.pause();
        // Remove after the crossfade finishes so it can't intercept clicks
        // or linger in the DOM (matches the CSS opacity transition, +margin).
        setTimeout(() => { splash.remove(); }, 900);
    }

    video.addEventListener('ended', showPrompt);
    // Defensive: if the video can't play at all (unsupported format, blocked,
    // slow network, missing file), don't strand the player on a black
    // screen forever — surface the prompt so there's still a way through.
    video.addEventListener('error', showPrompt);

    document.addEventListener('keydown', dismiss);
    document.addEventListener('click', dismiss);

    video.play().catch(() => {
        // Even muted autoplay was blocked (rare) — skip straight to the
        // prompt so there's still something for the player to act on.
        showPrompt();
    });
})();
