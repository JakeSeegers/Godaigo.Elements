window.effectsSystem = (() => {
    const EFFECTS = {
        fire_effect: {
            frames: 30,
            fps: 18,
            filter: 'none',
            svgDiameter: 70,
            baseFrameSize: 128,
        },
        ring_fire: {
            frames: 30,
            fps: 13,
            srcId: 'fire_effect',
            filter: 'hue-rotate(342deg) brightness(0.95) saturate(1.75)',
            svgDiameter: 70,
            baseFrameSize: 128,
        }
    };

    const loaded = {};
    const active = [];

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:500;';
    const ctx = canvas.getContext('2d');

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);

    function attachCanvas() {
        if (document.body) { document.body.appendChild(canvas); resize(); }
        else requestAnimationFrame(attachCanvas);
    }
    attachCanvas();

    function preload(effectId) {
        const cfg = EFFECTS[effectId];
        if (!cfg || loaded[effectId]) return;
        loaded[effectId] = [];
        for (let i = 1; i <= cfg.frames; i++) {
            const img = new Image();
            img.src = `images/effects/${cfg.srcId || effectId}/${String(i).padStart(4, '0')}.png`;
            loaded[effectId].push(img);
        }
    }

    function tileToScreen(svgX, svgY) {
        const boardSvg = document.getElementById('boardSvg');
        const viewport = document.getElementById('viewport');
        if (!boardSvg || !viewport) return null;
        const pt = boardSvg.createSVGPoint();
        pt.x = svgX;
        pt.y = svgY;
        const ctm = viewport.getCTM();
        const screenPt = pt.matrixTransform(ctm);
        const ctmScale = Math.sqrt(ctm.a * ctm.a + ctm.b * ctm.b);
        // screenPt is relative to boardSvg's own untransformed box, which by
        // design matches .board-area's rect exactly at 0deg tilt (see
        // syncBoardViewport in js/game-core.js) — the same flat local-pixel
        // space getScreenFromBoardXY expects. Previously this just added
        // boardSvg.getBoundingClientRect() directly, which is wrong once a
        // board tilt is active (that rect becomes the foreshortened,
        // trapezoidal projected box — same issue getBoardScreenXY's own
        // comment describes for hit-testing). getScreenFromBoardXY
        // forward-projects through the tilt instead, so the fire-destroy
        // effect (and anything else using this) lands on the actual tile
        // position instead of drifting once tilted.
        const pos = window.getScreenFromBoardXY(screenPt.x, screenPt.y);
        if (!pos) return null;
        return {
            x: pos.x,
            y: pos.y,
            boardScale: ctmScale * pos.scale,
        };
    }

    let rafRunning = false;

    function loop() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const now = Date.now();
        for (let i = active.length - 1; i >= 0; i--) {
            const anim = active[i];
            const cfg = EFFECTS[anim.effectId];
            const frames = loaded[anim.effectId];
            if (!frames) continue;
            const frameIdx = Math.floor((now - anim.startTime) / (1000 / cfg.fps));
            if (frameIdx >= cfg.frames) { active.splice(i, 1); continue; }
            const img = frames[frameIdx];
            if (!img.complete) continue;
            const pos = tileToScreen(anim.svgX, anim.svgY);
            if (!pos) continue;
            const drawSize = cfg.svgDiameter * pos.boardScale;
            ctx.save();
            ctx.filter = cfg.filter;
            ctx.drawImage(img, pos.x - drawSize / 2, pos.y - drawSize / 2, drawSize, drawSize);
            ctx.restore();
        }
        if (active.length > 0) requestAnimationFrame(loop);
        else rafRunning = false;
    }

    Object.keys(EFFECTS).forEach(preload);

    return {
        play(effectId, svgX, svgY) {
            if (!EFFECTS[effectId]) return;
            active.push({ effectId, svgX, svgY, startTime: Date.now() });
            if (!rafRunning) { rafRunning = true; requestAnimationFrame(loop); }
        }
    };
})();
