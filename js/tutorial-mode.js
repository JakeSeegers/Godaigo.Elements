/**
 * Tutorial Mode for Godaigo
 *
 * Interactive, scripted tutorial that auto-builds the board, places tokens,
 * and walks the player through core mechanics step by step.
 *
 * Entry point: TutorialMode.start()   (called from the auth screen button)
 */

window.isTutorialMode = false;

// When set, the movement handler only allows drops within ~60px of one of
// these 'x,y' keys. null = no restriction.
window.tutorialAllowedHexes = null;

const TutorialMode = (function () {

    // ── Board geometry ────────────────────────────────────────────────────────
    // TILE_SIZE=20 → largeHexSize = TILE_SIZE*4 = 80
    const S = 80;
    const SQ3 = Math.sqrt(3);

    function hp(q, r) {          // axial → pixel (matches game-core hexToPixel)
        return { x: S * SQ3 * (q + r / 2), y: S * 1.5 * r };
    }

    // Spiral position 0 = center (q=0,r=0) → this will hold the Earth tile
    const EARTH_POS  = hp(0,  0);   // {x: 0,      y:   0}
    const PLAYER_POS = hp(1,  0);   // {x: ~138.6, y:   0}  — east of earth
    const ENEMY_POS  = hp(-1, 2);   // {x: 0,      y: 240}  — south, valid placement

    // Tutorial deck: earth first so it lands at spiral position 0 (center)
    const TUTORIAL_DECK = ['earth', 'catacomb', 'water', 'fire', 'wind', 'void'];

    // ── State ─────────────────────────────────────────────────────────────────
    let currentStep   = -1;
    let highlightEl   = null;
    let modalEl       = null;
    let earthRevealed = false;

    // ── Step definitions ──────────────────────────────────────────────────────
    // action: 'read'  → Next/Continue button advances the step
    // action: 'move'  → modal waits; game code calls onPlayerMoved() to advance
    const STEPS = [
        {
            id: 'welcome',
            title: 'Welcome to Godaigo!',
            content: `Your goal is to <strong>master all 5 elements</strong> by finding and activating
                one scroll of each type.
                <div style="margin-top:14px; display:flex; justify-content:center; gap:14px;
                            font-size:18px; flex-wrap:wrap; line-height:2;">
                    <span style="color:#69d83a;">⬡ Earth</span>
                    <span style="color:#5894f4;">⬡ Water</span>
                    <span style="color:#ed1b43;">⬡ Fire</span>
                    <span style="color:#ffce00;">⬡ Wind</span>
                    <span style="color:#9458f4;">⬡ Void</span>
                </div>
                <div style="margin-top:10px; color:#aaa; font-size:13px;">
                    Be the first player to activate all five to win!
                </div>`,
            action: 'read',
            nextLabel: "Let's Go!"
        },
        {
            id: 'board-intro',
            title: 'The Board',
            content: `The board is built from <strong>hidden shrine tiles</strong>. Move your pawn
                onto them to flip them over and discover which element they hide.
                <div style="margin-top:12px;">
                    An <strong style="color:#69d83a;">Earth Shrine</strong> is glowing right next
                    to you. Let's head there first!
                </div>
                <div style="margin-top:10px; color:#aaa; font-size:13px;">
                    The purple pawn is you. The yellow pawn is your opponent.
                </div>`,
            action: 'read',
            nextLabel: 'Got it'
        },
        {
            id: 'move-to-earth',
            title: 'Move to the Earth Shrine',
            content: `<strong>Drag your purple pawn</strong> onto the glowing
                <strong style="color:#69d83a;">Earth tile</strong> to reveal it.
                <div style="margin-top:12px; color:#aaa; font-size:13px;">
                    Each hex you move costs <strong>1 Action Point (AP)</strong>.
                    You start each turn with 5 AP.
                </div>`,
            action: 'move',
            nextLabel: null   // auto-advances when onPlayerMoved fires
        },
        {
            id: 'earth-scroll',
            title: 'You Found an Earth Scroll!',
            content: `Landing on a shrine <strong>reveals it</strong> and draws a
                <strong>scroll</strong> from that element's deck into your hand.
                <div style="margin-top:12px;">
                    You received <strong style="color:#69d83a;">Avalanche (Earth V)</strong>
                    — one of the most powerful earth scrolls.
                </div>
                <div style="margin-top:10px; color:#aaa; font-size:13px;">
                    Open the <strong>Scrolls</strong> panel on the right to see it.
                    Move it from your <em>Hand</em> to your <em>Active Area</em> to
                    prepare it for casting.
                </div>`,
            action: 'read',
            nextLabel: 'Tell me more'
        },
        {
            id: 'elements',
            title: 'The Five Elements',
            content: `Each element plays differently on the board:
                <ul style="margin:12px 0; padding-left:20px; line-height:2;">
                    <li><strong style="color:#69d83a;">Earth</strong> — stones <em>block</em> movement entirely</li>
                    <li><strong style="color:#5894f4;">Water</strong> — stones <em>slow</em> movement (costs 2 AP)</li>
                    <li><strong style="color:#ed1b43;">Fire</strong> — aggressive power scrolls</li>
                    <li><strong style="color:#ffce00;">Wind</strong> — stones grant <em>free</em> movement (0 AP)</li>
                    <li><strong style="color:#9458f4;">Void</strong> — arcane; <em>nullifies</em> adjacent stones</li>
                </ul>`,
            action: 'read',
            nextLabel: 'Continue'
        },
        {
            id: 'end',
            title: "You're Ready!",
            content: `Keep exploring, collect scrolls from each shrine type, and place
                <strong>elemental stones</strong> in patterns on the board to cast spells.
                <div style="margin-top:12px;">
                    Press <strong>End Turn</strong> when you're done. Your AP refreshes at
                    the start of your next turn — save some for response scrolls during
                    your opponent's moves!
                </div>
                <div style="margin-top:10px; color:#aaa; font-size:13px;">
                    Good luck, adventurer!
                </div>`,
            action: 'read',
            nextLabel: 'Start Playing'
        }
    ];

    // ── Board setup ───────────────────────────────────────────────────────────

    function start() {
        window.isTutorialMode = true;
        earthRevealed = false;
        currentStep   = -1;

        // Signal initializeDeck to use our fixed order (earth first)
        window.tutorialDeckOverride = [...TUTORIAL_DECK];

        // startGame handles hiding the lobby and building the board
        if (typeof startGame === 'function') {
            startGame(1);
        } else {
            console.error('TutorialMode: startGame() not found');
            return;
        }

        // Auto-place tokens and start step sequence after the board renders
        setTimeout(setupBoard, 200);
    }

    function setupBoard() {
        if (typeof window.placeTile !== 'function') {
            console.error('TutorialMode: window.placeTile not exposed — add window.placeTile = placeTile in game-core.js');
            return;
        }

        // Auto-place the player pawn at E position (adjacent to earth at center)
        window.placeTile(PLAYER_POS.x, PLAYER_POS.y, 0, false, 'player', true, true);

        // Auto-place enemy pawn to give context (visual only — no AI)
        window.placeTile(ENEMY_POS.x, ENEMY_POS.y, 0, false, 'player', true, true);

        // Hide the player tile panel — placement is already done
        const deck = document.getElementById('new-player-tile-deck') || document.getElementById('player-tile-deck');
        if (deck) deck.closest('.panel-section, section, .tile-section, div')?.style && (deck.style.display = 'none');

        // Prime the earth scroll deck so the player always draws Earth V first
        const ss = window.spellSystem;
        if (ss && ss.scrollDecks && ss.scrollDecks.earth) {
            const earthDeck = ss.scrollDecks.earth;
            const idx = earthDeck.indexOf('EARTH_SCROLL_5');
            if (idx > 0) earthDeck.splice(idx, 1);
            if (!earthDeck.length || earthDeck[0] !== 'EARTH_SCROLL_5') {
                earthDeck.unshift('EARTH_SCROLL_5');
            }
        }

        if (typeof fitBoardToView === 'function') fitBoardToView();
        showStep(0);
    }

    // ── Highlight ring ────────────────────────────────────────────────────────

    function addHighlight(x, y) {
        removeHighlight();
        const svg = document.getElementById('board');
        if (!svg) return;
        const vp = svg.querySelector('#viewport') || svg;

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', 58);
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke', '#69d83a');
        circle.setAttribute('stroke-width', '4');
        circle.setAttribute('class', 'tutorial-highlight-ring');
        circle.style.pointerEvents = 'none';
        vp.appendChild(circle);
        highlightEl = circle;
    }

    function removeHighlight() {
        if (highlightEl) { highlightEl.remove(); highlightEl = null; }
    }

    // ── Modal ─────────────────────────────────────────────────────────────────

    function showModal(step) {
        closeModal();

        const overlay = document.createElement('div');
        overlay.className = 'tutorial-modal tutorial-tmode';

        const footerHTML = (step.action !== 'move' && step.nextLabel)
            ? `<button class="tmode-next">${step.nextLabel}</button>`
            : `<span style="color:#aaa; font-size:13px; font-style:italic;">
                   Complete the action above to continue…
               </span>`;

        overlay.innerHTML = `
            <div class="tutorial-content" style="max-width:440px;">
                <div class="tutorial-header">
                    <span class="tutorial-step-label">Step ${currentStep + 1} of ${STEPS.length}</span>
                    <h3 class="tutorial-title">${step.title}</h3>
                </div>
                <div class="tutorial-body">${step.content}</div>
                <div class="tutorial-footer"
                     style="display:flex; justify-content:flex-end; margin-top:16px; gap:8px;">
                    ${footerHTML}
                </div>
            </div>`;

        document.body.appendChild(overlay);
        modalEl = overlay;
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

        // Highlight earth tile during movement step and the step before it
        if (step.id === 'move-to-earth' || step.id === 'board-intro') {
            addHighlight(EARTH_POS.x, EARTH_POS.y);
            window.tutorialAllowedHexes = new Set([
                `${Math.round(EARTH_POS.x)},${Math.round(EARTH_POS.y)}`
            ]);
        } else {
            removeHighlight();
            window.tutorialAllowedHexes = null;
        }

        showModal(step);
    }

    function advance() {
        if (currentStep < STEPS.length - 1) {
            showStep(currentStep + 1);
        } else {
            finish();
        }
    }

    function finish() {
        closeModal();
        removeHighlight();
        window.isTutorialMode      = false;
        window.tutorialAllowedHexes = null;
        if (typeof updateStatus === 'function') {
            updateStatus('Tutorial complete! Enjoy the game!');
        }
    }

    // ── Hooks called from game code ───────────────────────────────────────────

    // Called from game-core.js revealTile() before the scroll is drawn.
    // Ensures Earth V is at the front of the earth deck.
    function onTileRevealed(tile, spellSystem) {
        if (tile.shrineType !== 'earth' || earthRevealed) return;
        earthRevealed = true;

        if (spellSystem && spellSystem.scrollDecks && spellSystem.scrollDecks.earth) {
            const deck = spellSystem.scrollDecks.earth;
            const idx  = deck.indexOf('EARTH_SCROLL_5');
            if (idx > 0) deck.splice(idx, 1);
            if (!deck.length || deck[0] !== 'EARTH_SCROLL_5') deck.unshift('EARTH_SCROLL_5');
        }
    }

    // Called from game-ui.js after a successful player move.
    // Advances from the 'move-to-earth' step when the player reaches the earth tile.
    function onPlayerMoved(toX, toY) {
        if (currentStep !== 2) return; // step 2 = 'move-to-earth'
        const dist = Math.hypot(toX - EARTH_POS.x, toY - EARTH_POS.y);
        if (dist < 70) {
            // Give the tile-reveal animation a moment before showing the next popup
            setTimeout(() => showStep(3), 900);
        }
    }

    // Called from game-ui.js when the tutorial blocks an illegal move.
    function showMovementHint() {
        if (currentStep === 2 && typeof updateStatus === 'function') {
            updateStatus('Tutorial: move your pawn to the glowing Earth tile to continue!');
        }
    }

    // ── Public API ────────────────────────────────────────────────────────────

    return { start, advance, finish, onTileRevealed, onPlayerMoved, showMovementHint,
             get currentStep() { return currentStep; } };
})();

window.TutorialMode = TutorialMode;
