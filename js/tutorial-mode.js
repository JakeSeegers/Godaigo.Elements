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
        // ── 0 ─────────────────────────────────────────────────────────────────
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

        // ── 1 ─────────────────────────────────────────────────────────────────
        {
            id: 'tile-placed',
            title: 'Place Your Starting Tile',
            content: `See the <strong>hexagonal tile in the left panel?</strong> That's your Player Tile.
                <div style="margin-top:10px;">
                    <strong>Drag it onto the board</strong> and snap it next to the edge of two existing tiles. You'll see a ghost tile showing where it'll land.
                </div>
                <div style="margin-top:10px; color:#aaa; font-size:13px;">
                    In multiplayer, turn order is randomly assigned — you may have to wait for others first.
                </div>`,
            action: 'place-tile',   // advance fires via onPlayerTilePlaced() hook
            nextLabel: null,
            spotlight: '#new-player-tile-deck',
            modalPos: 'corner'
        },

        // ── 2 ─────────────────────────────────────────────────────────────────
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
                    You can always zoom and pan during your turn — it never costs AP.
                </div>`,
            action: 'read',
            nextLabel: 'Got it'
        },

        // ── 3 ─────────────────────────────────────────────────────────────────
        {
            id: 'move-pawn',
            title: 'Explore the Board',
            content: `<strong>Drag your pawn</strong> to move it across the board.
                <div style="margin-top:10px;">
                    Each hex you travel costs <strong>1 Action Point</strong> (see the counter top-right). You start every turn with 5 AP.
                </div>
                <div style="margin-top:10px;">
                    All the tiles are hidden right now — <strong>step onto any face-down tile to flip it</strong> and reveal what elemental shrine is underneath!
                </div>`,
            action: 'explore',  // advances via onTilePreReveal / onTileRevealed hooks
            nextLabel: null,
            spotlight: '#hud-ap-value',   // glows the AP counter as a hint, no blocking
            modalPos: 'corner'
        },

        // ── 4 ─────────────────────────────────────────────────────────────────
        {
            id: 'scroll-found',
            title: 'You Found a Scroll!',
            content: `When you flip a tile, a scroll is revealed and added to your <strong>hand</strong>. You got an <strong style="color:#69d83a;">Avalanche (Earth V)</strong> scroll — one of the most powerful.
                <div style="margin-top:10px;">
                    This is the <strong>primary way to get scrolls</strong>. Other methods exist, but flipping hidden tiles is the main one.
                </div>
                <div style="margin-top:10px; color:#aaa; font-size:13px;">
                    Your hand holds up to <strong>2 scrolls</strong>. Your active area also holds up to 2 — and scrolls are a <em>one-way street</em> (active → common only, never back to hand).
                </div>`,
            action: 'read',
            nextLabel: 'Got it'
        },

        // ── 5 ────────────────────────────────────────────────────────────────
        {
            id: 'earth-shrine',
            title: 'Collect Earth Stones',
            content: `You flipped an <strong style="color:#69d83a;">Earth tile</strong>! The glowing center hex is the <strong>Earth shrine</strong>.
                <div style="margin-top:10px;">
                    <strong>Walk your pawn to the center of the tile</strong>, then click <strong>End Turn</strong> to collect <strong style="color:#69d83a;">5 Earth stones</strong>. You'll use these to build the casting pattern for your scroll.
                </div>
                <div style="margin-top:10px; color:#aaa; font-size:13px;">
                    Elemental stones come from shared <strong>Source Pools</strong>. There are 25 of each stone type available across all players — once they're gone, no one can draw more of that type.
                </div>`,
            action: 'end-turn',   // advances via onEndTurn() hook
            nextLabel: null,
            boardRing: true,
            freeMove: true,       // show ring but don't restrict pawn movement
            spotlight: '#end-turn',
            modalPos: 'corner'
        },

        // ── 6 ─────────────────────────────────────────────────────────────────
        {
            id: 'open-scrolls',
            title: 'Open Your Hand',
            content: `Click the <strong>Hand</strong> button in the dock to open your scroll hand panel.`,
            action: 'click',
            spotlight: '#panel-btn-hand',
            nextLabel: null,   // auto-advances on click
            modalPos: 'corner'
        },

        // ── 7 ─────────────────────────────────────────────────────────────────
        {
            id: 'scrolls-explained',
            title: 'Three Scroll Panels',
            content: `Your scrolls are split across <strong>three floating panels</strong> — open each one from the dock buttons:
                <ul style="margin:10px 0; padding-left:18px; line-height:2.1;">
                    <li><strong>Hand</strong> — private; opponents only see the element type</li>
                    <li><strong>Active</strong> — face-up, visible to all; scrolls here can be cast</li>
                    <li><strong>Common Area</strong> — shared pool any player can cast from</li>
                </ul>
                <div style="margin-top:8px;">
                    Each area holds <strong>max 2 scrolls</strong>. Hand cards can be sent to the <strong>Active Area</strong> or directly to the <strong>Common Area</strong>. Active Area cards can only move to the <strong>Common Area</strong>.
                    Scrolls are a <em>one-way street</em> — never back to Hand.
                </div>
                <div style="margin-top:8px; color:#aaa; font-size:13px;">
                    A scroll in the <strong>Common Area</strong> can be cast by <em>any player</em>. If another player drops a scroll of the same element there, the old one returns to the bottom of that deck.
                </div>`,
            action: 'read',
            nextLabel: 'Continue'
        },

        // ── 7 ─────────────────────────────────────────────────────────────────
        {
            id: 'how-to-win',
            title: 'How to Win',
            content: `To win you must <strong>activate a scroll of each elemental type</strong> (Earth, Water, Fire, Wind, and Void).
                <div style="margin-top:10px;">
                    To activate a scroll you need to:
                    <ol style="margin:8px 0; padding-left:18px; line-height:2;">
                        <li>Have the scroll in your <strong>Active Area</strong> or the Common Area</li>
                        <li>Stand in the <strong>center of the pattern</strong> shown on the scroll</li>
                        <li>Build that pattern with <strong>elemental stones</strong> on the board</li>
                        <li>Spend <strong>2 AP</strong> and click <strong>Cast Spell</strong></li>
                    </ol>
                </div>`,
            action: 'read',
            nextLabel: 'How do I get stones?'
        },

        // ── 8 ─────────────────────────────────────────────────────────────────
        {
            id: 'getting-stones',
            title: 'Getting Elemental Stones',
            content: `You get stones by <strong>ending your turn</strong> on the <em>center</em> of an elemental shrine.
                <div style="margin-top:10px;">
                    Stone yield by shrine rank:
                    <div style="margin:8px 0; line-height:2.2;">
                        <span style="color:#69d83a;">⬡ Earth → 5 stones</span> &nbsp;
                        <span style="color:#5894f4;">⬡ Water → 4</span> &nbsp;
                        <span style="color:#ed1b43;">⬡ Fire → 3</span> &nbsp;
                        <span style="color:#ffce00;">⬡ Wind → 2</span> &nbsp;
                        <span style="color:#9458f4;">⬡ Void → 1</span>
                    </div>
                </div>
                <div style="color:#aaa; font-size:13px;">
                    Stone counts can't exceed <strong>25 per type</strong> across all players — the pool is shared.
                    Stones are placed for free adjacent to your pawn (no AP cost).
                </div>`,
            action: 'read',
            nextLabel: 'Got it',
            spotlight: '#end-turn',
            modalPos: 'corner'
        },

        // ── 9 ─────────────────────────────────────────────────────────────────
        {
            id: 'stone-abilities',
            title: 'Stone Abilities',
            content: `Each stone type affects the board differently:
                <ul style="margin:10px 0; padding-left:18px; line-height:2.1;">
                    <li><strong style="color:#69d83a;">Earth</strong> — blocks movement entirely; you can't walk through it</li>
                    <li><strong style="color:#5894f4;">Water</strong> — costs 2 AP to move through; adjacent to Earth it blocks, adjacent to Wind it flows freely</li>
                    <li><strong style="color:#ed1b43;">Fire</strong> — destroys any adjacent stone (except Void and other Fire) when placed</li>
                    <li><strong style="color:#ffce00;">Wind</strong> — movement costs 0 AP (free!)</li>
                    <li><strong style="color:#9458f4;">Void</strong> — raises your AP maximum; nullifies all adjacent stones' effects</li>
                </ul>
                <div style="color:#aaa; font-size:13px;">
                    <strong>Conflict by rank:</strong> Void &gt; Wind &gt; Fire &gt; Water &gt; Earth. Higher rank wins ties.
                </div>`,
            action: 'read',
            nextLabel: 'Breaking stones'
        },

        // ── 10 ────────────────────────────────────────────────────────────────
        {
            id: 'break-stones',
            title: 'Breaking Stones',
            content: `You can <strong>remove</strong> any stone from the board by <strong>right-clicking</strong> it.
                <div style="margin-top:10px;">
                    Breaking a stone costs <strong>AP equal to that stone's rank:</strong>
                    <div style="margin:8px 0; line-height:2.2;">
                        <span style="color:#69d83a;">Earth = 5 AP</span> &nbsp;·&nbsp;
                        <span style="color:#5894f4;">Water = 4 AP</span> &nbsp;·&nbsp;
                        <span style="color:#ed1b43;">Fire = 3 AP</span> &nbsp;·&nbsp;
                        <span style="color:#ffce00;">Wind = 2 AP</span> &nbsp;·&nbsp;
                        <span style="color:#9458f4;">Void = 1 AP</span>
                    </div>
                </div>
                <div style="color:#aaa; font-size:13px;">
                    Breaking is strategic — clear a path through Earth stones, dismantle an enemy's pattern, or destroy a Fire stone before it wrecks your setup.
                </div>`,
            action: 'read',
            nextLabel: 'Noted!'
        },

        // ── 11 ────────────────────────────────────────────────────────────────
        {
            id: 'casting',
            title: 'Casting a Scroll',
            content: `Once you've built the stone pattern and you're standing in its <strong>center</strong>:
                <ol style="margin:8px 0; padding-left:18px; line-height:2;">
                    <li>Have the scroll in your <strong>Active Area</strong> (or the Common Area)</li>
                    <li>Press <strong>Cast Spell</strong> in the dock — or click the glowing <strong>Cast ✦</strong> button on the scroll card when its pattern matches</li>
                </ol>
                <div style="margin-top:8px;">
                    Casting costs <strong>2 AP</strong>. After casting, opponents get a brief <strong>response window</strong> — they can spend 2 AP to play a counter or reaction scroll if they have one ready.
                </div>
                <div style="margin-top:8px; color:#aaa; font-size:13px;">
                    The <strong>Level 1</strong> scroll of each element is a <em>Response Scroll</em> — you can only play it in response to another player's action, on their turn.
                </div>`,
            action: 'read',
            nextLabel: 'Continue',
            spotlight: '#cast-spell',
            modalPos: 'corner'
        },

        // ── 12 ────────────────────────────────────────────────────────────────
        {
            id: 'catacomb',
            title: 'Catacomb Tiles',
            content: `Catacomb tiles are <strong>non-elemental</strong>. Flipping one gives you <strong>+1 AP</strong> and a <strong>Catacomb scroll</strong>.
                <div style="margin-top:10px;">
                    Catacomb scrolls are <strong>dual-type</strong> — activating one counts toward <em>two</em> of your win conditions at once.
                    They also let you <strong>move for free</strong> between the centers of other catacomb tiles.
                </div>
                <div style="margin-top:10px; color:#aaa; font-size:13px;">
                    Note: ending your turn <em>on</em> a catacomb tile gives no elemental stones — only the AP and scroll from flipping it.
                </div>`,
            action: 'read',
            nextLabel: 'Continue'
        },

        // ── 13 ────────────────────────────────────────────────────────────────
        {
            id: 'hud',
            title: 'The HUD & Dock',
            content: `Quick reference for the on-screen controls:
                <ul style="margin:10px 0; padding-left:18px; line-height:2.1;">
                    <li><strong>AP pips</strong> (top bar, right) — five orange squares; each one = 1 remaining action point</li>
                    <li><strong>Shrine dots</strong> (top bar, center) — five coloured dots that light up as you activate scrolls toward your win condition</li>
                    <li><strong>Players panel</strong> (right) — see opponents' scroll types, stones, active scrolls, and win progress</li>
                    <li><strong>Hand / Active / Common Area</strong> (dock) — open each scroll panel independently; counts show how many scrolls you hold</li>
                    <li><strong>Cast Spell</strong> (dock) — casts the best matching scroll from your Active Area or the Common Area</li>
                    <li><strong>Undo Step</strong> — undoes your last single movement step</li>
                    <li><strong>End Turn</strong> (top bar) — ends your turn; AP resets to 5 next turn</li>
                </ul>
                <div style="color:#aaa; font-size:13px;">
                    Save some AP before ending your turn — you can spend it on <strong>Response Scrolls</strong> during opponents' turns!
                </div>`,
            action: 'read',
            nextLabel: "I'm ready!",
            spotlight: '#hud-ap-pips',
            modalPos: 'corner'
        },

        // ── 14 ────────────────────────────────────────────────────────────────
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
            'move':       'Drag your pawn to the glowing tile to continue…',
            'explore':    'Drag your pawn onto any face-down tile to flip it…',
            'click':      'Click the highlighted element to continue…',
            'place-tile': 'Drag your player tile onto the board to continue…',
            'end-turn':   'Walk to the glowing shrine center, then click End Turn…',
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

    function showStep(index) {
        const step = STEPS[index];
        if (!step) return;
        currentStep = index;

        // Clear previous decorations
        clearSpotlight();
        clearPatternPoll();
        clearHintTimer();
        removeBoardRing();
        window.tutorialAllowedHexes = null;

        // Board ring on move step. freeMove:true shows the ring without
        // restricting the pawn — used for the shrine step where the player
        // may need to navigate back from wherever they ended up.
        if (step.boardRing) {
            showBoardRing(EARTH_POS.x, EARTH_POS.y);
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

    // ── Public API ────────────────────────────────────────────────────────────
    return {
        start, advance, finish,
        onTilePreReveal, onTileRevealed, onPlayerMoved, onPlayerTilePlaced, onEndTurn, showMovementHint,
        onStonePlaced, onStoneBroken, onScrollMoved, onSpellCast,
        get currentStep() { return currentStep; }
    };
})();

window.TutorialMode = TutorialMode;
