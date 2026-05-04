// ============================================================
// CRT OVERLAY  (js/crt-overlay.js)
//
// Canvas-based CRT effects drawn over the entire page.
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
    let _canvas = null;
    let _ctx    = null;
    let _raf    = null;

    const DEFAULTS = { scanlines: true, vignette: true, grain: true, flicker: true };
    let _opts = { ...DEFAULTS };

    // Vignette gradient — rebuilt on resize, reused every frame
    let _vignetteGrad = null;

    // Scanline pattern — rebuilt on resize, reused every frame
    let _scanPattern = null;

    // Offscreen grain canvas (256×256, tiled)
    let _grainCanvas  = null;
    let _grainCtx     = null;
    let _grainPattern = null;
    let _grainFrame   = 0;

    // Flicker state
    let _flickerAlpha = 0;

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
    }

    function saveForUser(userId) {
        try {
            localStorage.setItem(_key(userId), JSON.stringify(_opts));
        } catch (e) {
            console.warn('[crt-overlay] failed to save settings:', e);
        }
    }

    // ── Canvas setup ──────────────────────────────────────────

    function init() {
        if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
        if (document.getElementById('crt-canvas')) {
            // Already exists — just restart the loop
            _canvas = document.getElementById('crt-canvas');
            _ctx    = _canvas.getContext('2d');
            _onResize();
            _loop();
            return;
        }

        _canvas = document.createElement('canvas');
        _canvas.id = 'crt-canvas';
        _canvas.style.cssText = [
            'position:fixed',
            'inset:0',
            'width:100%',
            'height:100%',
            'z-index:9999',
            'pointer-events:none',
            'display:block'
        ].join(';');
        document.body.appendChild(_canvas);
        _ctx = _canvas.getContext('2d');

        // Grain offscreen canvas
        _grainCanvas = document.createElement('canvas');
        _grainCanvas.width  = 256;
        _grainCanvas.height = 256;
        _grainCtx = _grainCanvas.getContext('2d');

        window.addEventListener('resize', _onResize);
        // Defer resize to next frame so the canvas is fully laid out
        requestAnimationFrame(() => { _onResize(); _loop(); });
    }

    function _onResize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        _canvas.width  = w;
        _canvas.height = h;
        _vignetteGrad  = _buildVignetteGrad(w, h);
        _scanPattern   = _buildScanPattern();
        // Grain pattern rebuilt next grain frame
        _grainPattern  = null;
    }

    // ── Effect builders ───────────────────────────────────────

    function _buildVignetteGrad(w, h) {
        const grad = _ctx.createRadialGradient(
            w / 2, h / 2, 0,
            w / 2, h / 2, Math.max(w, h) * 0.72
        );
        grad.addColorStop(0,    'rgba(0,0,0,0)');
        grad.addColorStop(0.55, 'rgba(0,0,0,0)');
        grad.addColorStop(1.0,  'rgba(0,0,0,0.55)');
        return grad;
    }

    function _buildScanPattern() {
        // Realistic CRT phosphor scanlines: 4px period with soft gradient falloff.
        // Real CRTs have a dark inter-line gap that feathers into the bright phosphor
        // area rather than a hard edge. Four opacity steps simulate this:
        //   y=0  gap (darkest)   → y=1  soft shadow   → y=2  barely visible
        //   → y=3  clear (phosphor active — full brightness)
        // Max opacity (0.09) is half the old flat-line value (0.18).
        const sc = document.createElement('canvas');
        sc.width  = 1;
        sc.height = 4;
        const c = sc.getContext('2d');
        c.clearRect(0, 0, 1, 4);
        c.fillStyle = 'rgba(0,0,0,0.09)';  // inter-line gap — darkest
        c.fillRect(0, 0, 1, 1);
        c.fillStyle = 'rgba(0,0,0,0.04)';  // soft shadow
        c.fillRect(0, 1, 1, 1);
        c.fillStyle = 'rgba(0,0,0,0.01)';  // barely visible transition
        c.fillRect(0, 2, 1, 1);
        // y=3: left transparent — phosphor center at full brightness
        return _ctx.createPattern(sc, 'repeat');
    }

    function _updateGrain() {
        const iw = _grainCanvas.width;
        const ih = _grainCanvas.height;
        const imageData = _grainCtx.createImageData(iw, ih);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const v = (Math.random() * 40) | 0;
            data[i]     = v;
            data[i + 1] = v;
            data[i + 2] = v;
            data[i + 3] = Math.random() < 0.45 ? 22 : 0;
        }
        _grainCtx.putImageData(imageData, 0, 0);
        _grainPattern = _ctx.createPattern(_grainCanvas, 'repeat');
    }

    // ── Render loop ───────────────────────────────────────────

    function _loop() {
        const ctx = _ctx;
        const w   = _canvas.width;
        const h   = _canvas.height;

        ctx.clearRect(0, 0, w, h);

        if (_opts.flicker)   _drawFlicker(ctx, w, h);
        if (_opts.vignette)  _drawVignette(ctx, w, h);
        if (_opts.grain)     _drawGrain(ctx, w, h);
        if (_opts.scanlines) _drawScanlines(ctx, w, h);

        _raf = requestAnimationFrame(_loop);
    }

    function _drawFlicker(ctx, w, h) {
        _flickerAlpha += (Math.random() - 0.5) * 0.012;
        _flickerAlpha  = Math.max(0, Math.min(0.045, _flickerAlpha));
        if (_flickerAlpha > 0.001) {
            ctx.fillStyle = `rgba(0,0,0,${_flickerAlpha.toFixed(3)})`;
            ctx.fillRect(0, 0, w, h);
        }
    }

    function _drawVignette(ctx, w, h) {
        if (!_vignetteGrad) _vignetteGrad = _buildVignetteGrad(w, h);
        ctx.fillStyle = _vignetteGrad;
        ctx.fillRect(0, 0, w, h);
    }

    function _drawGrain(ctx, w, h) {
        // Update grain tile every 2nd frame
        _grainFrame++;
        if (_grainFrame % 2 === 0 || !_grainPattern) {
            _updateGrain();
        }
        if (_grainPattern) {
            ctx.fillStyle = _grainPattern;
            ctx.fillRect(0, 0, w, h);
        }
    }

    function _drawScanlines(ctx, w, h) {
        if (!_scanPattern) _scanPattern = _buildScanPattern();
        ctx.fillStyle = _scanPattern;
        ctx.fillRect(0, 0, w, h);
    }

    // ── Public API ────────────────────────────────────────────

    function setOption(key, value) {
        if (!(key in DEFAULTS)) return;
        _opts[key] = !!value;
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
