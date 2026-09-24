// ============================================================
// CRT OVERLAY  (js/crt-overlay.js)
//
// CRT effects layered over the entire page (CSS layers, see § Layers).
// Effects: scanlines, vignette, film grain, flicker.
// All effects are on by default and individually togglable.
//
// Storage key: godaigo_crt_${userId}  (or godaigo_crt_guest)
// Public API:  window.crtOverlay.init()
//              window.crtOverlay.setOption(key, bool)
//              window.crtOverlay.getOptions()
//              window.crtOverlay.loadForUser(userId)
//              window.crtOverlay.saveForUser(userId)
// ============================================================

window.crtOverlay = (function () {

    // ── Internal state ────────────────────────────────────────
    const DEFAULTS = { scanlines: true, vignette: true, grain: true, flicker: true };
    let _opts = { ...DEFAULTS };

    // Private RNG for cosmetic noise. NEVER use Math.random here: the bot
    // arena seeds Math.random per game for deterministic replays, and the
    // old version of this overlay ran every animation frame — consuming the
    // shared stream at frame rate made mid-game deck reshuffles
    // (scroll-effects shuffleDeck) timing-dependent and broke seeded-game
    // determinism. (Now it only draws noise once, at init — still private.)
    let _noiseSeed = 0x9e3779b9;
    function _rand() {
        _noiseSeed = (_noiseSeed * 1664525 + 1013904223) >>> 0;
        return _noiseSeed / 4294967296;
    }

    // ── Storage ───────────────────────────────────────────────

    function _key(userId) {
        return userId ? `godaigo_crt_${userId}` : 'godaigo_crt_guest';
    }

    function loadForUser(userId) {
        try {
            const raw = localStorage.getItem(_key(userId));
            if (raw) {
                const parsed = JSON.parse(raw);
                Object.keys(DEFAULTS).forEach(k => {
                    if (typeof parsed[k] === 'boolean') _opts[k] = parsed[k];
                });
            } else {
                // No saved prefs — use defaults
                _opts = { ...DEFAULTS };
            }
        } catch (e) {
            console.warn('[crt-overlay] failed to load settings:', e);
            _opts = { ...DEFAULTS };
        }
        _apply();
    }

    function saveForUser(userId) {
        try {
            localStorage.setItem(_key(userId), JSON.stringify(_opts));
        } catch (e) {
            console.warn('[crt-overlay] failed to save settings:', e);
        }
    }

    // ── Layers ────────────────────────────────────────────────
    // Each effect is its own fixed, full-screen <div>, not one canvas
    // redrawn every animation frame. The old canvas loop cleared and
    // refilled the whole screen four times per frame (up to 144x/s on a
    // high-refresh monitor) even though scanlines and vignette never
    // change — measured at ~85% of the page's main-thread time on the game
    // board. Now scanlines/vignette are static CSS gradients (painted
    // once), and grain/flicker are CSS animations of transform/opacity
    // only, which the compositor runs without repainting or touching the
    // main thread. Same look: same colours, stops, and noise as before.
    // Stacking order matches the old draw order (flicker, vignette, grain,
    // scanlines — later on top).

    let _root   = null;
    let _layers = null; // { flicker, vignette, grain, scanlines }

    const GRAIN_TILE = 256;
    const GRAIN_STEPS = 8;              // was an 8-tile pool...
    const GRAIN_CYCLE_MS = 267;         // ...advanced every 2nd frame at 60Hz
    const FLICKER_SAMPLES = 60;         // random-walk keyframes
    const FLICKER_CYCLE_MS = 4000;      // ~15 samples/s, alternate = no seam

    function _grainTileURL() {
        const gc = document.createElement('canvas');
        gc.width = gc.height = GRAIN_TILE;
        const gctx = gc.getContext('2d');
        const imageData = gctx.createImageData(GRAIN_TILE, GRAIN_TILE);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const v = (_rand() * 40) | 0;
            data[i]     = v;
            data[i + 1] = v;
            data[i + 2] = v;
            data[i + 3] = _rand() < 0.45 ? 22 : 0;
        }
        gctx.putImageData(imageData, 0, 0);
        return gc.toDataURL('image/png');
    }

    function _keyframesCSS() {
        // Grain: one noise tile jumped to GRAIN_STEPS random offsets —
        // visually the same random static as cycling 8 separate tiles.
        let grain = '@keyframes crt-grain {';
        for (let i = 0; i < GRAIN_STEPS; i++) {
            const x = -((_rand() * GRAIN_TILE) | 0), y = -((_rand() * GRAIN_TILE) | 0);
            grain += `${(i * 100 / GRAIN_STEPS).toFixed(2)}% { transform: translate(${x}px, ${y}px); }`;
        }
        grain += '}';
        // Flicker: the same clamped random walk (0..0.045 black) as the old
        // per-frame version, sampled into keyframes.
        let flicker = '@keyframes crt-flicker {';
        let a = 0;
        for (let i = 0; i <= FLICKER_SAMPLES; i++) {
            for (let f = 0; f < 4; f++) {     // 4 old frames per sample
                a += (_rand() - 0.5) * 0.012;
                a = Math.max(0, Math.min(0.045, a));
            }
            flicker += `${(i * 100 / FLICKER_SAMPLES).toFixed(2)}% { opacity: ${a.toFixed(3)}; }`;
        }
        flicker += '}';
        return grain + flicker;
    }

    function _build() {
        const style = document.createElement('style');
        style.id = 'crt-overlay-style';
        style.textContent = _keyframesCSS();
        document.head.appendChild(style);

        _root = document.createElement('div');
        _root.id = 'crt-overlay';
        _root.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none;overflow:hidden;';

        const layer = (css) => {
            const d = document.createElement('div');
            d.style.cssText = 'position:absolute;inset:0;pointer-events:none;' + css;
            _root.appendChild(d);
            return d;
        };
        _layers = {
            flicker: layer(
                'background:#000;opacity:0;will-change:opacity;' +
                `animation:crt-flicker ${FLICKER_CYCLE_MS}ms linear infinite alternate;`),
            vignette: layer(
                // Old canvas gradient: radius max(w,h)*0.72, clear to 55%,
                // then to 0.55 black at the edge.
                'background:radial-gradient(circle calc(max(100vw, 100vh) * 0.72) at 50% 50%,' +
                'rgba(0,0,0,0) 0%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%);'),
            grain: layer(
                // Oversized by one tile each side so any offset still
                // covers the screen.
                `inset:-${GRAIN_TILE}px;background:url(${_grainTileURL()}) repeat;` +
                'will-change:transform;' +
                `animation:crt-grain ${GRAIN_CYCLE_MS}ms steps(1, end) infinite;`),
            scanlines: layer(
                // Old 1x4 pattern: 0.09 / 0.04 / 0.01 / clear.
                'background:repeating-linear-gradient(to bottom,' +
                'rgba(0,0,0,0.09) 0px, rgba(0,0,0,0.09) 1px,' +
                'rgba(0,0,0,0.04) 1px, rgba(0,0,0,0.04) 2px,' +
                'rgba(0,0,0,0.01) 2px, rgba(0,0,0,0.01) 3px,' +
                'rgba(0,0,0,0) 3px, rgba(0,0,0,0) 4px);'),
        };
        document.body.appendChild(_root);
    }

    function _apply() {
        if (!_layers) return;
        Object.keys(_layers).forEach(k => {
            _layers[k].style.display = _opts[k] ? '' : 'none';
        });
    }

    function init() {
        if (!_root) _build();
        _apply();
    }

    // ── Public API ────────────────────────────────────────────

    function setOption(key, value) {
        if (!(key in DEFAULTS)) return;
        _opts[key] = !!value;
        _apply();
    }

    function getOptions() {
        return { ..._opts };
    }

    return { init, setOption, getOptions, loadForUser, saveForUser };

})();

// Auto-init on page load (guest defaults until user signs in)
(function () {
    function _start() {
        window.crtOverlay.loadForUser(null);
        window.crtOverlay.init();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _start);
    } else {
        _start();
    }
})();
