// ── Parallax Background ───────────────────────────────────────────────────
// Injects a layered animated background into every .board-area element.
// Layers (back to front):
//   1. Truebackground.png   — static deep-space base
//   2. secondlayer...png    — oversized, slow diagonal drift (space pan)
//   3. smallcloud 1–4       — organic floating movement, each unique path

(function initParallax() {
    // Inject keyframe animations
    const style = document.createElement('style');
    style.textContent = `
        #parallax-bg {
            position: absolute;
            inset: 0;
            z-index: 0;
            overflow: hidden;
            pointer-events: none;
        }
        .parallax-base {
            position: absolute;
            inset: 0;
            background: url('images/Background/background/Truebackground.png') center / cover no-repeat;
        }
        .parallax-space {
            position: absolute;
            width: 140%;
            height: 140%;
            top: -20%;
            left: -20%;
            object-fit: cover;
            opacity: 0.65;
            animation: space-drift 160s ease-in-out infinite;
            will-change: transform;
        }
        .parallax-cloud {
            position: absolute;
            object-fit: contain;
            will-change: transform;
        }
        @keyframes space-drift {
            0%   { transform: translate(0%,    0%)   scale(1);    }
            20%  { transform: translate(-4%,  -3%)   scale(1.02); }
            45%  { transform: translate(-8%,   2%)   scale(1);    }
            70%  { transform: translate(-3%,   6%)   scale(1.01); }
            100% { transform: translate(0%,    0%)   scale(1);    }
        }
        @keyframes cloud-a {
            0%   { transform: translate(0px,   0px);  }
            20%  { transform: translate(28px, -18px); }
            50%  { transform: translate(60px,  12px); }
            75%  { transform: translate(35px,  32px); }
            100% { transform: translate(0px,   0px);  }
        }
        @keyframes cloud-b {
            0%   { transform: translate(0px,   0px);  }
            30%  { transform: translate(-38px, 22px); }
            65%  { transform: translate(-18px,-28px); }
            100% { transform: translate(0px,   0px);  }
        }
        @keyframes cloud-c {
            0%   { transform: translate(0px,   0px);  }
            25%  { transform: translate(45px,  20px); }
            55%  { transform: translate(22px, -22px); }
            80%  { transform: translate(-28px, 14px); }
            100% { transform: translate(0px,   0px);  }
        }
        @keyframes cloud-d {
            0%   { transform: translate(0px,   0px);  }
            35%  { transform: translate(-22px,-30px); }
            65%  { transform: translate(18px, -18px); }
            100% { transform: translate(0px,   0px);  }
        }
    `;
    document.head.appendChild(style);

    const BASE      = 'images/Background/background/';
    const CLOUDS = [
        {
            src:    BASE + 'smallcloud.png',
            style:  'width:38%;top:4%;left:-6%;opacity:0.38;',
            anim:   'cloud-a 58s ease-in-out infinite',
            delay:  '0s'
        },
        {
            src:    BASE + 'smallcloud2.png',
            style:  'width:30%;top:55%;left:68%;opacity:0.32;',
            anim:   'cloud-b 74s ease-in-out infinite',
            delay:  '-20s'
        },
        {
            src:    BASE + 'smallcloud3.png',
            style:  'width:42%;top:28%;left:52%;opacity:0.28;',
            anim:   'cloud-c 90s ease-in-out infinite',
            delay:  '-35s'
        },
        {
            src:    BASE + 'smallcloud4.png',
            style:  'width:26%;top:72%;left:8%;opacity:0.36;',
            anim:   'cloud-d 48s ease-in-out infinite',
            delay:  '-12s'
        },
    ];

    function buildParallax(boardArea) {
        if (boardArea.querySelector('#parallax-bg')) return; // Already injected

        // Ensure the board-area is a positioning context
        const computed = getComputedStyle(boardArea).position;
        if (computed === 'static') boardArea.style.position = 'relative';

        const bg = document.createElement('div');
        bg.id = 'parallax-bg';

        // Layer 1: static base
        const base = document.createElement('div');
        base.className = 'parallax-base';
        bg.appendChild(base);

        // Layer 2: slow-drifting space layer
        const space = document.createElement('img');
        space.className = 'parallax-space';
        space.src = BASE + 'secondlayermuchbiggerthantrue.png';
        space.alt = '';
        space.style.animationDelay = '-40s'; // start mid-drift so it's already moving
        bg.appendChild(space);

        // Layer 3–6: clouds
        CLOUDS.forEach(c => {
            const img = document.createElement('img');
            img.className = 'parallax-cloud';
            img.src = c.src;
            img.alt = '';
            img.style.cssText += c.style + `animation:${c.anim};animation-delay:${c.delay};`;
            bg.appendChild(img);
        });

        // Insert before everything else in the board-area
        boardArea.insertBefore(bg, boardArea.firstChild);

        // Ensure board content sits above the parallax layer
        boardArea.querySelectorAll(':scope > :not(#parallax-bg)').forEach(el => {
            if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
            el.style.zIndex = '1';
        });
    }

    // Run on DOMContentLoaded (or immediately if DOM is already ready)
    function run() {
        document.querySelectorAll('.board-area').forEach(buildParallax);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
    } else {
        run();
    }
})();
