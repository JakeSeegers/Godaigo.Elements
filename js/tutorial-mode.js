/**
 * Tutorial Mode for Godaigo — Interactive Guided Tutorial
 *
 * Features:
 *  - Auto-builds a scripted board (earth tile at center, player + enemy pawns placed)
 *  - 14-step walkthrough using the official voice-recorded transcript
 *  - Spotlight system: dims everything and highlights one UI element at a time
 *  - Movement gating: restricts the pawn to the tutorial destination
 *  - Click-to-advance: certain steps wait for the player to click the spotlit element
 *
 * Entry point: TutorialMode.start()  (called from the auth-screen button)
 * Hooks required in game code:
 *   game-core.js → window.placeTile, window.spellSystem, tutorialDeckOverride in initializeDeck,
 *                  TutorialMode.onTileRevealed in revealTile
 *   game-ui.js   → tutorialBlocked gate + TutorialMode.onPlayerMoved after placePlayer
 */

window.isTutorialMode      = false;
window.tutorialAllowedHexes = null;   // Set<'x,y'>: restricts pawn drops when non-null

const TutorialMode = (function () {

    // ── Board geometry (TILE_SIZE=20, largeHexSize=80) ────────────────────────
    const S = 80, SQ3 = Math.sqrt(3);
    const hp = (q, r) => ({ x: S * SQ3 * (q + r / 2), y: S * 1.5 * r });

    const EARTH_POS  = hp( 0,  0);  // center of spiral → earth tile
    const PLAYER_POS = hp( 1,  0);  // east  → player pawn start
    const ENEMY_POS  = hp(-1,  2);  // south → opponent pawn (cosmetic only)

    const TUTORIAL_DECK = ['earth', 'catacomb', 'water', 'fire', 'wind', 'void'];

    // ── State ─────────────────────────────────────────────────────────────────
    let currentStep       = -1;
    let boardRingEl       = null;   // SVG pulsing ring on earth tile
    let modalEl           = null;
    let overlayEl         = null;   // blocking dim overlay
    let spotlightEl       = null;   // currently spotlit DOM element
    let spotlightHandler  = null;   // {el, fn} for click-to-advance cleanup
    let earthRevealed     = false;  // tracks whether the first tile reveal has been processed
    let exitBtnEl         = null;   // persistent exit button shown for the whole tutorial
    let liftedAncestors   = [];     // ancestors temporarily raised above the overlay

    // ── New kinesthetic state ─────────────────────────────────────────────────
    let patternPollInterval  = null;   // setInterval for checkPattern polling
    let hintTimer            = null;   // setTimeout for 15-second inactivity hint

    // ── Step definitions ──────────────────────────────────────────────────────
    // action:
    //   'read'  – Next/Continue button advances
    //   'move'  – onPlayerMoved() fires advance (pawn reaches earth tile)
    //   'click' – clicking the spotlit element fires advance
    //
    // spotlight: CSS selector of HTML element to highlight (null = board ring only)
    // boardRing: true = show pulsing ring on earth tile
    // modalPos:  'center' (default) | 'corner' (bottom-right, used when spotlight is active)
    const STEPS = [
        // ── 0  welcome (read — only intro step permitted as read-only) ─────────
        {
            id: 'welcome',
            title: 'Welcome to Godaigo!',
            content: `Hi, welcome to the tutorial for <strong>Godaigo: Secret of the Five Elements</strong>. Thanks for playing!
            <div style="margin-top:12px;">
                Your goal is to <strong>master all 5 elements</strong> by finding and activating one scroll of each type.
            </div>
            <div style="margin-top:14px; display:flex; justify-content:center; gap:14px; font-size:18px; flex-wrap:wrap; line-height:2.2;">
                <span style="color:#69d83a;">⬡ Earth</span>
                <span style="color:#5894f4;">⬡ Water</span>
                <span style="color:#ed1b43;">⬡ Fire</span>
                <span style="color:#ffce00;">⬡ Wind</span>
                <span style="color:#9458f4;">⬡ Void</span>
            </div>
            <div style="margin-top:10px; color:#aaa; font-size:13px;">
                Be the first player to activate all five to win — and escape the mystical island!
            </div>`,
            action: 'read',
            nextLabel: "Let's Go!",
            modalPos: 'center'
        },
        // ── 1  place tile (action-gated: onPlayerTilePlaced) ──────────────────
        {
            id: 'tile-placed',
            title: 'Place Your Starting Tile',
            content: `See the <strong>hexagonal tile in the left panel?</strong> That's your Player Tile.
            <div style="margin-top:10px;">
                <strong>Drag it onto the board</strong> and snap it next to the edge of two existing tiles. You'll see a ghost tile showing where it'll land.
            </div>`,
            action: 'place-tile',
            nextLabel: null,
            spotlight: '#new-player-tile-deck',
            modalPos: 'corner'
        },
        // ── 2  camera (brief read — no sensible action gate for controls intro) ─
        {
            id: 'camera',
            title: 'Camera Controls',
            content: `A few handy controls before you start moving:
            <ul style="margin:10px 0; padding-left:18px; line-height:2;">
                <li><strong>Scroll wheel</strong> — zoom in / out</li>
                <li><strong>Right-click drag</strong> — pan the board</li>
                <li><strong>Right-click drag outside tiles</strong> — rotate the board</li>
            </ul>
            <div style="color:#aaa; font-size:13px;">
                Try zooming now — it never costs AP.
            </div>`,
            action: 'read',
            nextLabel: 'Got it'
        },
        // ── 3  explore / flip tile (action-gated: onTileRevealed) ────────────
        {
            id: 'move-pawn',
            title: 'Explore the Board',
            content: `<strong>Drag your pawn</strong> to move it across the board.
            <div style="margin-top:10px;">
                Each hex costs <strong>1 Action Point</strong>. You start every turn with 5 AP.
            </div>
            <div style="margin-top:10px;">
                All the tiles are hidden — <strong>step onto any face-down tile to flip it</strong> and reveal the shrine underneath!
            </div>`,
            action: 'explore',
            nextLabel: null,
            spotlight: '#hud-ap-value',
            modalPos: 'corner'
        },
        // ── 4  scroll found (read-only) ───────────────────────────────────────
        {
            id: 'scroll-found',
            title: 'You Found a Scroll!',
            content: `When you flip a tile, a scroll is added to your <strong>hand</strong>. You got an <strong style="color:#69d83a;">Avalanche (Earth V)</strong> scroll — a powerful earth spell.
            <div style="margin-top:10px;">
                We'll use it soon. For now, let's collect some <strong style="color:#69d83a;">Earth stones</strong> to power it up.
            </div>`,
            action: 'read',
            nextLabel: 'Got it!',
            modalPos: 'corner'
        },
        // ── 5  earth shrine (action-gated: onEndTurn at EARTH_POS) ───────────
        {
            id: 'earth-shrine',
            title: 'Collect Earth Stones',
            content: `You flipped an <strong style="color:#69d83a;">Earth tile</strong>! The glowing center is the <strong>Earth shrine</strong>.
            <div style="margin-top:10px;">
                <strong>Walk your pawn to the glowing center</strong>, then click <strong>End Turn</strong> to collect <strong style="color:#69d83a;">5 Earth stones</strong>.
            </div>
            <div style="margin-top:10px; color:#aaa; font-size:13px;">
                Stones come from shared <strong>Source Pools</strong> — 25 of each type max.
            </div>`,
            action: 'end-turn',
            nextLabel: null,
            boardRing: true,
            freeMove: true,
            spotlight: '#end-turn',
            modalPos: 'corner'
        },
        // ── 6  open scrolls hand panel (action-gated: click) ─────────────────
        {
            id: 'open-scrolls',
            title: 'Open Your Hand',
            content: `Click the <strong>Hand</strong> button in the dock to open your scroll hand panel.`,
            action: 'click',
            spotlight: '#panel-btn-hand',
            nextLabel: null,
            modalPos: 'corner'
        },
        // ── 7  move scroll to active area (action-gated: onScrollMoved hand→active) ─
        {
            id: 'scrolls-explained',
            title: 'Move Scroll to Active Area',
            content: `Your scrolls are split across three panels:
            <ul style="margin:10px 0; padding-left:18px; line-height:2.1;">
                <li><strong>Hand</strong> — private; max 2 scrolls</li>
                <li><strong>Active</strong> — face-up, visible to all; scrolls here can be cast</li>
                <li><strong>Common Area</strong> — shared pool any player can cast from</li>
            </ul>
            <div style="margin-top:8px;">
                <strong>Click "Move to Active Area"</strong> on your Avalanche scroll to get it ready to cast.
            </div>`,
            action: 'scroll-moved',
            nextLabel: null,
            modalPos: 'corner'
        },
        // ── 8  how to win (brief read then action-gated into pattern step) ────
        {
            id: 'how-to-win',
            title: 'How to Win',
            content: `To win, <strong>activate a scroll of each element</strong> (Earth, Water, Fire, Wind, Void).
            <div style="margin-top:10px;">
                To cast a scroll you need to:
                <ol style="margin:8px 0; padding-left:18px; line-height:2;">
                    <li>Have it in your <strong>Active Area</strong></li>
                    <li>Stand in the <strong>center</strong> of the pattern</li>
                    <li>Build the pattern with <strong>stones</strong> on the board</li>
                    <li>Spend <strong>2 AP</strong> and click <strong>Cast Spell</strong></li>
                </ol>
            </div>`,
            action: 'read',
            nextLabel: "Let's try it!"
        },
        // ── 9  place earth stone (action-gated: onStonePlaced('earth')) ───────
        {
            id: 'place-stone',
            title: 'Place an Earth Stone',
            content: `You have <strong style="color:#69d83a;">5 Earth stones</strong> in your pool (bottom dock).
            <div style="margin-top:10px;">
                <strong>Drag an Earth stone</strong> from the dock and drop it on a hex <em>adjacent</em> to your pawn.
                Placing stones is free — no AP cost.
            </div>`,
            action: 'stone-placed',
            stoneType: 'earth',
            nextLabel: null,
            modalPos: 'corner'
        },
        // ── 10  build the avalanche pattern (action-gated: checkPattern polling) ─
        {
            id: 'build-pattern',
            title: 'Build the Avalanche Pattern',
            content: `The Avalanche scroll requires a pattern of <strong>4 Earth stones</strong> around your pawn.
            <div style="margin-top:10px;">
                Open the scroll card in your Active Area — you'll see the exact pattern layout.
                <strong>Place the remaining stones</strong> to complete it.
            </div>
            <div style="margin-top:8px; color:#aaa; font-size:13px;">
                Once the pattern is complete, the "Cast ✦" button on the scroll card will glow.
            </div>`,
            action: 'pattern-built',
            nextLabel: null,
            modalPos: 'corner'
        },
        // ── 11  cast avalanche (action-gated: onSpellCast) ────────────────────
        {
            id: 'cast-avalanche',
            title: 'Cast Avalanche!',
            content: `The pattern is complete! Now cast the scroll.
            <div style="margin-top:10px;">
                Click <strong>Cast Spell</strong> in the dock — or the glowing <strong>Cast ✦</strong> button on the Avalanche scroll card.
            </div>
            <div style="margin-top:8px; color:#aaa; font-size:13px;">
                Casting costs 2 AP. After casting, your Earth win-condition is fulfilled!
            </div>`,
            action: 'spell-cast',
            nextLabel: null,
            spotlight: '#cast-spell',
            modalPos: 'corner'
        },
        // ── opponent-trap: scripted AI places ring, auto-advance after ring placed ─
        {
            id: 'opponent-trap',
            title: 'Opponent Responds!',
            content: `Your opponent sees your Avalanche cast and taunts you — the Earth stones you placed are now working against you!
                <div style="margin-top:10px;">
                    Earth stones block movement. You're hemmed in by your own cast.
                </div>
                <div style="margin-top:8px; color:#aaa; font-size:13px;">
                    Continuing to the escape lesson…
                </div>`,
            action: 'scripted-ai',   // auto-advances after AI fires
            nextLabel: null,
            modalPos: 'corner'
        },
        // ── break-trap: player must break one earth stone ─────────────────────────
        {
            id: 'break-trap',
            title: 'Stone Breaker',
            content: `Sometimes you need to break a stone — to open a path, disrupt an opponent's pattern, or return it to the source pool.
                <div style="margin-top:10px;">
                    <strong>Right-click any Earth stone</strong> on the board to break it.
                    Breaking costs <strong>AP equal to the stone's rank</strong> — Earth is rank 5, so it costs <strong style="color:#69d83a;">5 AP</strong>.
                </div>
                <div style="margin-top:8px; color:#aaa; font-size:13px;">
                    On touch devices: long-press the stone instead.
                </div>`,
            action: 'stone-broken',
            nextLabel: null,
            boardRing: true,
            boardRingTarget: PLAYER_POS,
            freeMove: true,
            modalPos: 'corner'
        },
        // ── retrap: scripted AI fires second trap, auto-advance ───────────────────
        {
            id: 'opponent-retrap',
            title: 'Second Trap!',
            content: `Your opponent threatens to re-trap you — don't let them! It's time to fight back with a different element.
                <div style="margin-top:10px;">
                    Brute-forcing through Earth costs too much AP. Wind and Fire give you better options.
                </div>
                <div style="margin-top:8px; color:#aaa; font-size:13px;">
                    We've added Wind and Fire stones to your pool. Use them next.
                </div>`,
            action: 'scripted-ai',
            nextLabel: null,
            modalPos: 'corner'
        },
        // ── wind-escape: player places a wind stone ───────────────────────────────
        {
            id: 'wind-escape',
            title: 'Wind Stone — Free Move!',
            content: `<strong style="color:#ffce00;">Wind stones</strong> let you move for free (0 AP)!
                <div style="margin-top:10px;">
                    Look at the dock — you have Wind stones now. <strong>Drag a Wind stone</strong> from the pool and drop it on a hex near the trap.
                </div>
                <div style="margin-top:8px; color:#aaa; font-size:13px;">
                    Once placed, walking onto that hex costs zero AP.
                </div>`,
            action: 'stone-placed-wind',
            nextLabel: null,
            modalPos: 'corner'
        },
        // ── fire-counter: player places a fire stone adjacent to earth ────────────
        {
            id: 'fire-counter',
            title: 'Fire Destroys Earth!',
            content: `<strong style="color:#ed1b43;">Fire stones</strong> destroy adjacent stones when placed!
                <div style="margin-top:10px;">
                    <strong>Drag a Fire stone</strong> from the pool and drop it <em>adjacent to an Earth stone</em>.
                    Watch the Earth stone disappear.
                </div>
                <div style="margin-top:8px; color:#aaa; font-size:13px;">
                    This is how Fire counters Earth — perfect for breaking traps without spending AP.
                </div>`,
            action: 'stone-placed-fire',
            nextLabel: null,
            modalPos: 'corner'
        },
        // ── react-scrolls: explanation-only, no player action required ──────────
        {
            id: 'react-scrolls',
            title: 'Reaction Scrolls',
            content: `Some scrolls are <strong>Reaction scrolls</strong> — they activate on your <em>opponent's</em> turn, not yours.
                <div style="margin-top:10px;">
                    <strong>Level 1 reactions</strong> are the easiest to build and require the fewest stones. When multiple players try to react on the same turn, reactions resolve by <strong>element rank</strong> — Wind outranks Earth, for example.
                </div>
                <div style="margin-top:10px;">
                    Only <strong>one reaction fires per turn</strong>. You cannot react to a reaction — once one resolves, the window closes.
                </div>
                <div style="margin-top:8px; color:#aaa; font-size:13px;">
                    Build a reaction scroll pattern in your Active Area before your opponent's turn to surprise them!
                </div>`,
            action: 'read',
            nextLabel: 'Good to know!',
            modalPos: 'corner'
        },
        // ── 17  HUD reference (brief read) ───────────────────────────────────
        {
            id: 'hud',
            title: 'The HUD & Dock',
            content: `Quick reference for the on-screen controls:
            <ul style="margin:10px 0; padding-left:18px; line-height:2.1;">
                <li><strong>AP pips</strong> — five orange squares; each = 1 remaining AP</li>
                <li><strong>Shrine dots</strong> — light up as you activate scrolls</li>
                <li><strong>Cast Spell</strong> — casts the best matching scroll from Active or Common Area</li>
                <li><strong>End Turn</strong> — ends your turn; AP resets to 5 next turn</li>
            </ul>`,
            action: 'read',
            nextLabel: "I'm ready!",
            spotlight: '#hud-ap-pips',
            modalPos: 'corner'
        },
        // ── 13  finish ───────────────────────────────────────────────────────
        {
            id: 'finish',
            title: "You're Ready!",
            content: `That's the basics of Godaigo!
            <div style="margin-top:12px;">
                Keep exploring — flip hidden tiles, collect scrolls, build stone patterns, and activate one scroll of each element to win.
            </div>
            <div style="margin-top:10px; color:#aaa; font-size:13px;">
                Good luck, adventurer. The mystical island awaits.
            </div>`,
            action: 'read',
            nextLabel: 'Start Playing'
        }
    ];

    // ── Board setup ───────────────────────────────────────────────────────────

    function start() {
        window.isTutorialMode       = true;
        window.tutorialDeckOverride = [...TUTORIAL_DECK];
        earthRevealed = false;
        currentStep   = -1;

        const sg = window.startGame || (typeof startGame !== 'undefined' ? startGame : null);
        if (typeof sg === 'function') {
            try { sg(1); } catch(e) { console.error('TutorialMode: startGame() threw:', e); }
        } else {
            console.error('TutorialMode: startGame() not found — cannot launch tutorial.');
        }
        // Give the game a moment to finish rendering before showing step 0
        setTimeout(setupBoard, 400);
    }

    function setupBoard() {
        try {
            // Prime earth deck so the player always draws Earth V from the earth shrine
            primeEarthDeck(window.spellSystem);
            if (typeof fitBoardToView === 'function') fitBoardToView();
        } catch (err) {
            console.error('TutorialMode: board setup error (non-fatal):', err);
        }
        // Ensure End Turn button is visible — it starts as display:none in HTML
        // and may have been re-hidden by lobby reset flows before the tutorial launched.
        const etBtn = document.getElementById('end-turn');
        if (etBtn) etBtn.style.display = '';
        showExitButton();
        showStep(0);
    }

    function showExitButton() {
        if (exitBtnEl) return;
        const btn = document.createElement('button');
        btn.className = 'tmode-exit-persistent';
        btn.textContent = 'Exit Tutorial';
        btn.addEventListener('click', finish);
        document.body.appendChild(btn);
        exitBtnEl = btn;
    }

    function hideExitButton() {
        if (exitBtnEl) { exitBtnEl.remove(); exitBtnEl = null; }
    }

    /** Called from game-core.js placeTile() when the local player drops their tile. */
    function onPlayerTilePlaced() {
        if (currentStep !== 1) return;   // step 1 = 'tile-placed'
        setTimeout(() => showStep(2), 600);
    }

    function primeEarthDeck(ss) {
        if (!ss?.scrollDecks?.earth) return;
        const deck = ss.scrollDecks.earth;
        const idx  = deck.indexOf('EARTH_SCROLL_5');
        if (idx > 0)  deck.splice(idx, 1);
        if (deck[0] !== 'EARTH_SCROLL_5') deck.unshift('EARTH_SCROLL_5');
    }

    // ── Spotlight system ──────────────────────────────────────────────────────

    /**
     * Highlight a UI element.
     * blocking=true  → also add a full-screen dim overlay that eats all clicks
     *                  (use for action:'click' steps so only the target is interactive)
     * blocking=false → just glow the element; board + pawns stay fully interactive
     *                  (use for action:'move' and action:'place-tile' steps)
     */
    function showSpotlight(selector, blocking) {
        clearSpotlight();
        const el = selector ? document.querySelector(selector) : null;
        if (!el) return;

        if (blocking) {
            // The overlay sits at z-index 8600 at the document root.
            // If the spotlit element lives inside a positioned ancestor that has its
            // own stacking context (e.g. .dock-bar at z-index 50), the element's own
            // z-index:8620 is scoped inside that context and stays visually beneath
            // the overlay.  Fix: walk up the ancestor chain and temporarily lift any
            // stacking-context ancestor above the overlay.
            liftedAncestors = [];
            let node = el.parentElement;
            while (node && node !== document.body) {
                const zi = window.getComputedStyle(node).zIndex;
                if (zi !== 'auto' && parseInt(zi, 10) < 8650) {
                    liftedAncestors.push({ node, original: node.style.zIndex });
                    node.style.zIndex = '8650';
                }
                node = node.parentElement;
            }

            const ov = document.createElement('div');
            ov.id        = 'tutorial-blocking-overlay';
            ov.className = 'tutorial-blocking-overlay';
            ov.addEventListener('click', () => {
                if (typeof updateStatus === 'function')
                    updateStatus('Click the highlighted element to continue the tutorial.');
            });
            document.body.appendChild(ov);
            overlayEl = ov;
        }

        el.classList.add('tutorial-spotlight');
        spotlightEl = el;
    }

    function clearSpotlight() {
        if (spotlightEl) {
            spotlightEl.classList.remove('tutorial-spotlight');
            spotlightEl = null;
        }
        if (overlayEl) { overlayEl.remove(); overlayEl = null; }

        // Restore any ancestors whose z-index was temporarily raised
        liftedAncestors.forEach(({ node, original }) => { node.style.zIndex = original; });
        liftedAncestors = [];

        // Remove any leftover click listener
        if (spotlightHandler) {
            spotlightHandler.el.removeEventListener('click', spotlightHandler.fn);
            spotlightHandler = null;
        }
    }

    function attachClickAdvance(selector) {
        const el = selector ? document.querySelector(selector) : null;
        if (!el) return;
        const fn = () => { advance(); };
        el.addEventListener('click', fn, { once: true });
        spotlightHandler = { el, fn };
    }

    // ── Board ring ────────────────────────────────────────────────────────────

    function showBoardRing(x, y) {
        removeBoardRing();
        const svg = document.getElementById('board');
        if (!svg) return;
        const vp = svg.querySelector('#viewport') || svg;

        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', x);
        c.setAttribute('cy', y);
        c.setAttribute('r',  58);
        c.setAttribute('fill',         'none');
        c.setAttribute('stroke',       '#69d83a');
        c.setAttribute('stroke-width', '4');
        c.setAttribute('class',        'tutorial-highlight-ring');
        c.style.pointerEvents = 'none';
        vp.appendChild(c);
        boardRingEl = c;
    }

    function removeBoardRing() {
        if (boardRingEl) { boardRingEl.remove(); boardRingEl = null; }
    }

    // ── Modal ─────────────────────────────────────────────────────────────────

    function showModal(step) {
        closeModal();

        const isCorner  = step.modalPos === 'corner';
        const posStyle  = isCorner
            ? 'align-items:flex-end; justify-content:flex-end; padding:16px; background:none; pointer-events:none;'
            : '';
        const boxStyle  = isCorner
            ? 'pointer-events:all; max-width:380px; border:2px solid var(--accent-gold,#d9b08c);'
            : 'max-width:460px;';

        const actionHints = {
            'move':          'Drag your pawn to the glowing tile to continue…',
            'explore':       'Drag your pawn onto any face-down tile to flip it…',
            'click':         'Click the highlighted element to continue…',
            'place-tile':    'Drag your player tile onto the board to continue…',
            'end-turn':      'Walk to the glowing shrine center, then click End Turn…',
            'scroll-moved':  'Open your Hand panel and click "Move to Active Area" on the Avalanche scroll…',
            'stone-placed':  'Drag an Earth stone from the stone pool and drop it adjacent to your pawn…',
            'pattern-built': 'Build the Avalanche pattern (4 Earth stones) around your pawn — see the scroll card for the layout…',
            'spell-cast':    'Click "Cast Spell" in the dock (or the Cast ✦ button on the scroll card) to cast Avalanche…',
            'stone-broken':  'Right-click an Earth stone to break it (costs 5 AP)…',
            'stone-placed-wind': 'Drag a Wind stone (yellow) from the pool and place it near the trap ring…',
            'stone-placed-fire': 'Drag a Fire stone (red) from the pool and place it adjacent to an Earth stone…',
            'scripted-ai':       'Watch the opponent\'s move…',
        };
        const footerHTML = (step.nextLabel && !actionHints[step.action])
            ? `<button class="tmode-next">${step.nextLabel}</button>`
            : step.action in actionHints
                ? `<span style="color:#aaa;font-size:13px;font-style:italic;">${actionHints[step.action]}</span>`
                : `<span style="color:#aaa;font-size:13px;font-style:italic;">Complete the action above to continue…</span>`;

        const overlay = document.createElement('div');
        overlay.className = `tutorial-modal tutorial-tmode${isCorner ? ' tutorial-corner' : ''}`;
        if (isCorner) overlay.style.cssText = posStyle;

        overlay.innerHTML = `
            <div class="tutorial-content" style="${boxStyle}">
                <div class="tutorial-header">
                    <span class="tutorial-step-label">Step ${currentStep + 1} of ${STEPS.length}</span>
                    <h3 class="tutorial-title">${step.title}</h3>
                </div>
                <div class="tutorial-body">${step.content}</div>
                <div class="tutorial-footer"
                     style="display:flex;justify-content:flex-end;margin-top:14px;gap:8px;">
                    ${footerHTML}
                </div>
            </div>`;

        document.body.appendChild(overlay);
        modalEl = overlay;
        // Force opacity to 1 immediately; also add the class for the CSS transition
        overlay.style.opacity = '1';
        requestAnimationFrame(() => overlay.classList.add('tutorial-visible'));

        const btn = overlay.querySelector('.tmode-next');
        if (btn) btn.addEventListener('click', advance);
    }

    function closeModal() {
        if (!modalEl) return;
        modalEl.classList.add('tutorial-fade-out');
        const el = modalEl;
        setTimeout(() => el.remove(), 220);
        modalEl = null;
    }

    // ── Step machine ──────────────────────────────────────────────────────────

    /**
     * Per-step resource grants for the trap sequence. Called from showStep BEFORE
     * the modal renders so the modal text is accurate when the player reads it.
     */
    function prepareStepEntry(stepId) {
        const ss = window.spellSystem;
        if (stepId === 'break-trap') {
            // Top up to 5 AP so player can afford one Earth break (cost 5).
            if (typeof window.addAP === 'function') window.addAP(5);
        } else if (stepId === 'opponent-retrap') {
            if (typeof window.addAP === 'function') window.addAP(3);
        } else if (stepId === 'wind-escape') {
            if (ss?.playerPool && (ss.playerPool.wind || 0) < 1) {
                ss.playerPool.wind = (ss.playerPool.wind || 0) + 2;
                if (typeof updateHUD === 'function') updateHUD();
                if (typeof updateStonePoolDisplay === 'function') updateStonePoolDisplay();
            }
        } else if (stepId === 'fire-counter') {
            if (ss?.playerPool && (ss.playerPool.fire || 0) < 1) {
                ss.playerPool.fire = (ss.playerPool.fire || 0) + 2;
                if (typeof updateHUD === 'function') updateHUD();
                if (typeof updateStonePoolDisplay === 'function') updateStonePoolDisplay();
            }
            // Safety net: ensure at least one earth stone remains on board
            const hasEarth = Array.isArray(window.placedStones)
                && window.placedStones.some(s => s.type === 'earth');
            if (!hasEarth && typeof window.placeStoneVisually === 'function' && window.playerPosition) {
                // Place an earth stone east of the player at hp(3, 0) to avoid pixel-grid issues
                const { x: nx, y: ny } = hp(3, 0);
                window.placeStoneVisually(nx, ny, 'earth');
            }
        }
    }

    function showStep(index) {
        const step = STEPS[index];
        if (!step) return;
        currentStep = index;
        prepareStepEntry(step.id);

        // Clear previous decorations
        clearSpotlight();
        clearPatternPoll();
        clearHintTimer();
        removeOpponentSpeechBubble();
        removeBoardRing();
        window.tutorialAllowedHexes = null;

        // Board ring on move step. freeMove:true shows the ring without
        // restricting the pawn — used for the shrine step where the player
        // may need to navigate back from wherever they ended up.
        if (step.boardRing) {
            const _ringTarget = step.boardRingTarget || EARTH_POS;
            showBoardRing(_ringTarget.x, _ringTarget.y);
            if (!step.freeMove) {
                window.tutorialAllowedHexes = new Set([
                    `${Math.round(EARTH_POS.x)},${Math.round(EARTH_POS.y)}`
                ]);
            }
        }

        // Spotlight an HTML element.
        // Only block all other interaction for 'click' steps — move/place-tile steps
        // need the board to stay interactive so the player can drag pawns/tiles.
        if (step.spotlight) {
            const blocking = (step.action === 'click');
            showSpotlight(step.spotlight, blocking);
            if (step.action === 'click') {
                attachClickAdvance(step.spotlight);
            }
        }

        showModal(step);

        // Start pattern polling for 'pattern-built' steps
        if (step.action === 'pattern-built') {
            patternPollInterval = setInterval(() => {
                const ss = window.spellSystem;
                if (ss && typeof ss.checkPattern === 'function' && ss.checkPattern('EARTH_SCROLL_5')) {
                    clearPatternPoll();
                    clearHintTimer();
                    advance();
                }
            }, 500);
            startHintTimer('Build the Avalanche pattern (4 Earth stones) around your pawn — see the scroll card for the layout…');
        }
        // Start hint timers for other action-gated steps
        const hintMessages = {
            'scroll-moved':  'Open your Hand panel and click "Move to Active Area" on the Avalanche scroll…',
            'stone-placed':  'Drag an Earth stone from the stone pool and drop it adjacent to your pawn…',
            'spell-cast':    'Click "Cast Spell" in the dock after placing the pattern…',
            'stone-broken':  'Right-click an Earth stone to break it (costs 5 AP)…',
            'stone-placed-wind': 'Drag a Wind stone from the pool and drop it near the trap ring…',
            'stone-placed-fire': 'Drag a Fire stone from the pool adjacent to an Earth stone…',
        };
        if (hintMessages[step.action]) {
            startHintTimer(hintMessages[step.action]);
        }

        // Scripted AI trigger for trap steps
        if (step.action === 'scripted-ai') {
            const pos = window.playerPosition || PLAYER_POS;
            if (step.id === 'opponent-trap') {
                showOpponentSpeechBubble('Hah! Trapped!');
                setTimeout(() => {
                    runScriptedOpponentTrap(pos.x, pos.y, () => {
                        setTimeout(advance, 800);
                    });
                }, 1200);   // delay so player sees the modal before stones drop
            } else if (step.id === 'opponent-retrap') {
                showOpponentSpeechBubble("Can't escape twice!");
                setTimeout(() => {
                    runScriptedOpponentRetrap(pos.x, pos.y, () => {
                        setTimeout(advance, 800);
                    });
                }, 1200);
            }
        }
    }

    function advance() {
        const nextIdx = currentStep + 1;
        if (nextIdx < STEPS.length) {
            showStep(nextIdx);
        } else {
            finish();
        }
    }

    function finish() {
        closeModal();
        clearSpotlight();
        removeBoardRing();
        hideExitButton();
        window.isTutorialMode       = false;
        window.tutorialAllowedHexes = null;
        // Reload returns the player to the auth/lobby screen cleanly.
        // The tutorial dirtied the game state so there's nothing to preserve.
        window.location.reload();
    }

    // ── Hooks called from game code ───────────────────────────────────────────

    /**
     * Called from game-core.js BEFORE tile visuals are built.
     * We can override tile.shrineType here and the visual + scroll will both reflect it.
     */
    function onTilePreReveal(tile) {
        if (currentStep !== 3 || earthRevealed) return;
        // Force the first tile the player steps on to be Earth — regardless of
        // where they placed their player tile or which direction they moved.
        tile.shrineType = 'earth';
        primeEarthDeck(window.spellSystem);
    }

    /**
     * Called from game-core.js AFTER tile visuals are built and the scroll is drawn.
     * We advance the tutorial here so the scroll is already in the player's hand.
     */
    function onTileRevealed(tile, spellSystem) {
        if (currentStep !== 3 || earthRevealed) return;
        earthRevealed = true;
        setTimeout(() => showStep(4), 900); // let the flip animation finish
    }

    /** Called from game-ui.js after a successful pawn move. */
    function onPlayerMoved(toX, toY) {
        // During the shrine step, hint the player when they reach the Earth center.
        const SHRINE_STEP = STEPS.findIndex(s => s.id === 'earth-shrine');
        if (currentStep === SHRINE_STEP) {
            const atShrine = Math.round(toX) === Math.round(EARTH_POS.x) &&
                             Math.round(toY) === Math.round(EARTH_POS.y);
            if (atShrine && typeof updateStatus === 'function') {
                updateStatus("You're at the Earth shrine center! Click End Turn to collect 5 stones.");
            }
        }
    }

    /**
     * Called from game-ui.js after shrine stone replenishment when the player
     * clicks End Turn. pos is the player's current {x, y} position.
     */
    function onEndTurn(pos) {
        const SHRINE_STEP = STEPS.findIndex(s => s.id === 'earth-shrine');
        if (currentStep !== SHRINE_STEP) return;
        // Use a distance check — pawn positions have floating-point pixel values,
        // so an exact coordinate match (===) reliably fails even when the player
        // is visually standing on the shrine center.
        const dist = pos
            ? Math.sqrt(Math.pow(pos.x - EARTH_POS.x, 2) + Math.pow(pos.y - EARTH_POS.y, 2))
            : Infinity;
        if (dist < 20) {
            // Give the stone animation a moment to play before advancing
            setTimeout(() => showStep(SHRINE_STEP + 1), 900);
        } else {
            if (typeof updateStatus === 'function')
                updateStatus('Walk to the glowing Earth shrine center first, then click End Turn.');
        }
    }

    /** Called from game-ui.js when tutorial blocks an out-of-bounds drop. */
    function showMovementHint() {
        if (typeof updateStatus === 'function')
            updateStatus('Tutorial: drag your pawn onto a face-down tile to continue!');
    }

    function clearHintTimer() {
        if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
    }

    function startHintTimer(message) {
        clearHintTimer();
        hintTimer = setTimeout(() => {
            if (typeof updateStatus === 'function') updateStatus(message);
        }, 15000);
    }

    function clearPatternPoll() {
        if (patternPollInterval) { clearInterval(patternPollInterval); patternPollInterval = null; }
    }

    /** Called from game-core.js after a stone is placed on the board. */
    function onStonePlaced(stoneType, x, y) {
        const step = STEPS[currentStep];
        if (!step) return;
        if (step.action === 'stone-placed' && (!step.stoneType || step.stoneType === stoneType)) {
            clearHintTimer();
            clearPatternPoll();
            setTimeout(advance, 400);
        } else if (step.action === 'stone-placed-wind' && stoneType === 'wind') {
            clearHintTimer();
            setTimeout(advance, 400);
        } else if (step.action === 'stone-placed-fire' && stoneType === 'fire') {
            clearHintTimer();
            setTimeout(advance, 400);
        }
    }

    /** Called from game-core.js after a stone is broken/removed from the board. */
    function onStoneBroken(stoneType, x, y) {
        const step = STEPS[currentStep];
        if (!step) return;
        if (step.action === 'stone-broken') {
            clearHintTimer();
            clearPatternPoll();
            setTimeout(advance, 400);
        }
    }

    /** Called from scroll-panels.js when player moves a scroll between areas. */
    function onScrollMoved(scrollName, fromArea, toArea) {
        const step = STEPS[currentStep];
        if (!step) return;
        if (step.action === 'scroll-moved') {
            // Gate: must be moving TO active area to satisfy this step
            if (toArea === 'active') {
                clearHintTimer();
                setTimeout(advance, 400);
            }
        }
    }

    /** Called from game-core.js when a spell is successfully cast. */
    function onSpellCast(scrollName) {
        const step = STEPS[currentStep];
        if (!step) return;
        if (step.action === 'spell-cast') {
            clearHintTimer();
            clearPatternPoll();
            setTimeout(advance, 600);
        }
    }

    // ── Scripted opponent AI ──────────────────────────────────────────────────

    /**
     * Scripted opponent trap — narrative pause, then auto-advance.
     * Stone placement removed: coordinate-scale mismatch (S=80 vs TILE_SIZE=20)
     * caused stones to land far off-board. Player's own Avalanche stones serve
     * as the earth stones to break in the break-trap step.
     */
    function runScriptedOpponentTrap(centerX, centerY, callback) {
        // Scripted stone placement removed — coordinate-scale mismatch between
        // tutorial's S=80 pixel grid and game's TILE_SIZE=20 grid means computed
        // positions land far off-board. The player's own Avalanche stones already
        // provide earth stones to break in the break-trap step.
        // Just pause briefly (opponent "thinking") then call callback.
        setTimeout(callback, 1200);
    }

    /**
     * Scripted opponent retrap — narrative pause, then auto-advance.
     * Stone placement removed for same reason as runScriptedOpponentTrap.
     */
    function runScriptedOpponentRetrap(centerX, centerY, callback) {
        // Same as runScriptedOpponentTrap — scripted stone placement removed.
        // Narrative text describes what the opponent "does", but no stones are
        // dropped visually. Player must place their own Wind stone to advance.
        setTimeout(callback, 1200);
    }

    /**
     * Show a speech bubble SVG text element above ENEMY_POS.
     * Removes any existing bubble first.
     * text: the string to display.
     */
    function showOpponentSpeechBubble(text) {
        removeOpponentSpeechBubble();
        const svg = document.getElementById('board');
        if (!svg) return;
        const vp = svg.querySelector('#viewport') || svg;

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.id = 'tutorial-opponent-bubble';
        g.setAttribute('transform', `translate(${ENEMY_POS.x}, ${ENEMY_POS.y - 55})`);

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', '-60');
        rect.setAttribute('y', '-22');
        rect.setAttribute('width', '120');
        rect.setAttribute('height', '26');
        rect.setAttribute('rx', '6');
        rect.setAttribute('fill', '#2c1a3e');
        rect.setAttribute('stroke', '#ed1b43');
        rect.setAttribute('stroke-width', '1.5');
        rect.style.pointerEvents = 'none';

        const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('dominant-baseline', 'middle');
        t.setAttribute('fill', '#f3ecd8');
        t.setAttribute('font-size', '11');
        t.style.pointerEvents = 'none';
        t.textContent = text;

        g.appendChild(rect);
        g.appendChild(t);
        vp.appendChild(g);
    }

    function removeOpponentSpeechBubble() {
        const el = document.getElementById('tutorial-opponent-bubble');
        if (el) el.remove();
    }

    // ── Public API ────────────────────────────────────────────────────────────
    return {
        start, advance, finish,
        onTilePreReveal, onTileRevealed, onPlayerMoved, onPlayerTilePlaced, onEndTurn, showMovementHint,
        onStonePlaced, onStoneBroken, onScrollMoved, onSpellCast,
        get currentStep() { return currentStep; }
    };
})();

window.TutorialMode = TutorialMode;
