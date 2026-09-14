/**
 * Tutorial Mode for Godaigo — Interactive Guided Tutorial
 *
 * Features:
 *  - Auto-builds a scripted board (earth tile at center, player + enemy pawns placed)
 *  - 27-step walkthrough using the official voice-recorded transcript (steps 0-4 are a
 *    paginated designer's note, added before the original 14-step game-intro walkthrough;
 *    later additions cover Water's ability-copying mechanic, Water+Wind synergy, and Void)
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
    let windRevealed       = false;  // tracks whether the wind-escape step's forced tile has been processed
    let exitBtnEl         = null;   // persistent exit button shown for the whole tutorial
    let liftedAncestors   = [];     // ancestors temporarily raised above the overlay
    let cornerResizeFn    = null;   // window 'resize'/'scroll' listener kept while a corner modal is open

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
        // ── 0  designer's note, part 1/5 (read — plays before the game intro) ──
        {
            id: 'designer-note-1',
            title: "A Note From the Designer",
            content: `Welcome to Godaigo! I've been working on this game since 2014, making many changes over the years based on feedback from players like you.`,
            action: 'read',
            nextLabel: 'Continue',
            modalPos: 'center',
            skipTo: 'welcome'
        },
        // ── 1  designer's note, part 2/5 ────────────────────────────────────────
        {
            id: 'designer-note-2',
            title: 'Where It Started',
            content: `It started with one question: <em>what if we could play Magic: The Gathering, but our players and mana physically affected the board?</em> (And we didn't have to pay for booster packs.)`,
            action: 'read',
            nextLabel: 'Continue',
            modalPos: 'center',
            skipTo: 'welcome'
        },
        // ── 2  designer's note, part 3/5 ────────────────────────────────────────
        {
            id: 'designer-note-3',
            title: 'The Five Elements',
            content: `The game also draws from Japanese Five Element theory, an interpretation of traditional Buddhist philosophy about personal growth.
            <div style="margin-top:12px;">
                I know it's a common trope for board game designers to lean too heavily on orientalism, and I've thought hard about that. My connection to this framework is personal: it comes from many years of practice in martial arts.
            </div>
            <div style="margin-top:12px;">
                The five elements serve as a lens for pursuing emotional stability and harmony, and I've tried to express that idea in this game.
            </div>`,
            action: 'read',
            nextLabel: 'Continue',
            modalPos: 'center',
            skipTo: 'welcome'
        },
        // ── 3  designer's note, part 4/5 ────────────────────────────────────────
        {
            id: 'designer-note-4',
            title: 'About the AI',
            content: `I also want to be clear about one thing: while this game's online version was built with the help of AI, no gameplay decisions were influenced by AI.
            <div style="margin-top:12px;">
                The core of the game was developed and refined based on my own tastes and the feedback of players who tested the physical copy, which you can find here: <a href="https://www.thegamecrafter.com/games/godaigo:-secret-of-the-five-elements" target="_blank" rel="noopener" style="color:var(--accent-gold);">The Game Crafter</a>.
            </div>`,
            action: 'read',
            nextLabel: 'Continue',
            modalPos: 'center',
            skipTo: 'welcome'
        },
        // ── 4  designer's note, part 5/5 ────────────────────────────────────────
        {
            id: 'designer-note-5',
            title: 'Join the Community',
            content: `Thank you so much for taking the time to learn this game and join the community.
            <div style="margin-top:12px;">
                My dream is to build a group of players who want to refine our gameplay together, and to turn this game into something that stands the test of time.
            </div>
            <div style="margin-top:12px; color:#bbb; font-size:16px;">
                If you have questions or want to play a match, reach out to me on Discord in the <a href="https://discord.gg/6Tg6Y9EgN" target="_blank" rel="noopener" style="color:var(--accent-gold);">Godaigo channel</a>.
            </div>`,
            action: 'read',
            nextLabel: 'Continue',
            modalPos: 'center'
            // No skipTo here — this is the last preamble page, so Continue
            // already lands on 'welcome' next; a Skip button would be redundant.
        },
        // ── 5  welcome (read — only intro step permitted as read-only) ─────────
        {
            id: 'welcome',
            title: 'Welcome to Godaigo!',
            content: `Let's get started!
            <div style="margin-top:12px;">
                Your goal is to <strong>master all 5 elements</strong> by finding and activating one scroll of each type.
            </div>
            <div style="margin-top:14px; display:flex; justify-content:center; gap:18px; font-size:18px; flex-wrap:wrap; align-items:center; line-height:1.6;">
                <span style="color:#69d83a;"><img src="images/mountainsymbol.png" alt="" style="width:26px;height:26px;vertical-align:middle;margin-right:5px;">Earth</span>
                <span style="color:#5894f4;"><img src="images/watersymbol.png" alt="" style="width:26px;height:26px;vertical-align:middle;margin-right:5px;">Water</span>
                <span style="color:#ed1b43;"><img src="images/firesymbol.png" alt="" style="width:26px;height:26px;vertical-align:middle;margin-right:5px;">Fire</span>
                <span style="color:#ffce00;"><img src="images/windsymbol.png" alt="" style="width:26px;height:26px;vertical-align:middle;margin-right:5px;">Wind</span>
                <span style="color:#9458f4;"><img src="images/voidsymbol.png" alt="" style="width:26px;height:26px;vertical-align:middle;margin-right:5px;">Void</span>
            </div>
            <div style="margin-top:10px; color:#bbb; font-size:17px;">
                Be the first player to activate all five and return to your player shrine to win. You'll escape the mystical island too!
            </div>`,
            action: 'read',
            nextLabel: "Let's Go!",
            modalPos: 'center'
        },
        // ── 6  place tile (action-gated: onPlayerTilePlaced) ──────────────────
        {
            id: 'tile-placed',
            title: 'Place Your Starting Tile',
            content: `See the <strong>hexagonal tile in the panel above?</strong> That's your Player Tile.
            <div style="margin-top:10px;">
                <strong>Drag it onto the board</strong> and snap it next to the edge of two existing tiles. You'll see a ghost tile showing where it'll land.
            </div>`,
            action: 'place-tile',
            nextLabel: null,
            spotlight: '#new-player-tile-deck',
            modalPos: 'corner'
        },
        // ── 7  camera (brief read — no sensible action gate for controls intro) ─
        {
            id: 'camera',
            title: 'Camera Controls',
            content: `A few handy controls before you start moving:
            <ul style="margin:10px 0; padding-left:18px; line-height:1.6;">
                <li><strong>Scroll wheel</strong>: zoom in / out</li>
                <li><strong>Right-click drag</strong>: pan the board</li>
                <li><strong>Right-click drag outside tiles</strong>: rotate the board</li>
            </ul>
            <div style="color:#bbb; font-size:17px;">
                Try it now to get a feel for the controls.
            </div>`,
            action: 'read',
            nextLabel: 'Got it'
        },
        // ── 8  explore / flip tile (action-gated: onTileRevealed) ────────────
        {
            id: 'move-pawn',
            title: 'Explore the Board',
            content: `<strong>Drag your pawn</strong> to move it across the board.
            <div style="margin-top:10px;">
                Each hex costs <strong>1 Action Point</strong>. You start every turn with 5 AP.
            </div>
            <div style="margin-top:10px;">
                All the tiles are hidden. <strong>Step onto any face-down tile to flip it</strong> and reveal the shrine underneath!
            </div>`,
            action: 'explore',
            nextLabel: null,
            spotlight: '#hud-ap-value',
            modalPos: 'corner'
        },
        // ── 9  scroll found (read-only) ───────────────────────────────────────
        {
            id: 'scroll-found',
            title: 'You Found a Scroll!',
            content: `When you flip a tile, a scroll is added to your <strong>hand</strong>. You got an <strong style="color:#69d83a;">Avalanche (Earth V)</strong> scroll, a powerful earth scroll.
            <div style="margin-top:10px;">
                Hover your cursor over the name of the scroll to reveal its ability.
            </div>`,
            action: 'scroll-hover',
            // Targets the scroll's own card/row, not the #fsp-hand panel itself —
            // the panel is position:fixed, and .tutorial-spotlight forces
            // position:relative, which would knock a fixed-position element off
            // its actual on-screen spot. Both selectors are listed because the
            // Hand panel can default to either its collapsed compact-row view or
            // the full card view; only one is ever actually in the DOM.
            spotlight: '#fsp-hand .fsp-card, #fsp-hand .fsp-compact-row',
            nextLabel: null,
            modalPos: 'corner'
        },
        // ── 10  earth shrine (action-gated: onEndTurn at EARTH_POS) ───────────
        {
            id: 'earth-shrine',
            title: 'Collect Earth Stones',
            content: `You flipped an <strong style="color:#69d83a;">Earth tile</strong>! The center is the <strong>Earth shrine</strong>.
            <div style="margin-top:10px;">
                <strong>Walk your pawn to the center</strong>, then click <strong>End Turn</strong> to collect <strong style="color:#69d83a;">5 Earth stones</strong>.
            </div>
            <div style="margin-top:10px; color:#bbb; font-size:17px;">
                Stones come from shared <strong>Source Pools</strong> (25 of each type max).
            </div>`,
            action: 'end-turn',
            nextLabel: null,
            boardRing: true,
            freeMove: true,
            spotlight: '#end-turn',
            modalPos: 'corner'
        },
        // ── 11  open scrolls hand panel (action-gated: click) ─────────────────
        {
            id: 'open-scrolls',
            title: 'Open Your Hand',
            content: `Click the <strong>Hand</strong> button in the dock to open your scroll hand panel.`,
            action: 'click',
            spotlight: '#panel-btn-hand',
            nextLabel: null,
            modalPos: 'corner'
        },
        // ── 12  move scroll to active area (action-gated: onScrollMoved hand→active) ─
        {
            id: 'scrolls-explained',
            title: 'Move Scroll to Active Area',
            content: `Your scrolls are split across three panels:
            <ul style="margin:10px 0; padding-left:18px; line-height:1.6;">
                <li><strong>Hand</strong>: private, max 2 scrolls</li>
                <li><strong>Active</strong>: face-up, visible to all; scrolls here can be activated</li>
                <li><strong>Common Area</strong>: shared pool any player can activate from</li>
            </ul>
            <div style="margin-top:8px;">
                <strong>Click "Move to Active Area"</strong> on a scroll to get it ready to activate.
            </div>`,
            action: 'scroll-moved',
            nextLabel: null,
            modalPos: 'corner'
        },
        // ── 13  how to win (brief read then action-gated into pattern step) ────
        {
            id: 'how-to-win',
            title: 'How to Win',
            content: `To win, <strong>activate a scroll of each element</strong> (Earth, Water, Fire, Wind, Void), then <strong>return to the center of your player shrine</strong> (your starting tile).
            <div style="margin-top:10px;">
                To activate a scroll you need to:
                <ol style="margin:8px 0; padding-left:18px; line-height:1.6;">
                    <li>Have it in your <strong>Active Area</strong> or <strong>Common Area</strong></li>
                    <li>Stand in the <strong>center</strong> of the pattern</li>
                    <li>Build the pattern with <strong>stones</strong> on the board</li>
                    <li>Spend <strong>2 AP</strong> and click <strong>Activate Scroll</strong></li>
                </ol>
            </div>`,
            action: 'read',
            nextLabel: "Let's try it!"
        },
        // ── 14  place earth stone (action-gated: onStonePlaced('earth')) ───────
        {
            id: 'place-stone',
            title: 'Place an Earth Stone',
            content: `You have <strong style="color:#69d83a;">5 Earth stones</strong> in your pool (bottom dock).
            <div style="margin-top:10px;">
                <strong>Drag an Earth stone</strong> from the dock and drop it on a hex <em>adjacent</em> to your pawn.
                Placing stones is free, with no AP cost.
            </div>`,
            action: 'stone-placed',
            stoneType: 'earth',
            nextLabel: null,
            modalPos: 'corner'
        },
        // ── 15  build the avalanche pattern (action-gated: checkPattern polling) ─
        {
            id: 'build-pattern',
            title: 'Build the Avalanche Pattern',
            content: `The Avalanche scroll requires a pattern of <strong>4 Earth stones</strong> around your pawn.
            <div style="margin-top:10px;">
                Open the scroll card in your Active or Common Area. You'll see the exact pattern layout.
                <strong>Place the remaining stones</strong> to complete it.
            </div>
            <div style="margin-top:8px; color:#bbb; font-size:17px;">
                Once the pattern is complete, the "Activate ✦" button on the scroll card will glow.
            </div>`,
            action: 'pattern-built',
            nextLabel: null,
            modalPos: 'corner'
        },
        // ── 16  cast avalanche (action-gated: onSpellCast) ────────────────────
        {
            id: 'cast-avalanche',
            title: 'Activate Avalanche!',
            content: `The pattern is complete! Now activate the scroll.
            <div style="margin-top:10px;">
                Click <strong>Activate Scroll</strong> in the dock, or the glowing <strong>Activate ✦</strong> button on the Avalanche scroll card.
            </div>
            <div style="margin-top:8px; color:#bbb; font-size:17px;">
                Activating costs 2 AP. You may need to end your turn to regain AP before you can activate the scroll.
            </div>
            <div style="margin-top:8px; color:#bbb; font-size:17px;">
                After activating, your Earth win-condition is fulfilled!
            </div>`,
            action: 'spell-cast',
            nextLabel: null,
            spotlight: '#cast-spell',
            modalPos: 'corner'
        },
        // ── break-trap: player must break one earth stone ─────────────────────────
        {
            id: 'break-trap',
            title: 'Stone Breaker',
            content: `Sometimes you need to break a stone: to open a path, disrupt an opponent's pattern, or return it to the source pool.
                <div style="margin-top:10px;">
                    <strong>Right-click any Earth stone</strong> on the board to break it.
                    Breaking costs <strong>AP equal to the stone's rank</strong>. Earth is rank 5, so it costs <strong style="color:#69d83a;">5 AP</strong>.
                </div>
                <div style="margin-top:8px; color:#bbb; font-size:17px;">
                    As before, you will need to end your turn to regain the AP necessary to break an Earth Stone.
                </div>
                <div style="margin-top:8px; color:#bbb; font-size:17px;">
                    On touch devices: long-press the stone instead.
                </div>`,
            action: 'stone-broken',
            nextLabel: null,
            boardRing: true,
            boardRingTarget: PLAYER_POS,
            freeMove: true,
            modalPos: 'corner'
        },
        // ── water-basics: player copies an Earth stone's ability with Water ────────
        {
            id: 'water-basics',
            title: 'Water Copies Its Neighbor',
            content: `<strong style="color:#5894f4;">Water stones</strong> are unique: they copy the ability of whichever stone is placed next to them.
                <div style="margin-top:10px;">
                    <strong>Drag a Water stone</strong> from the pool and drop it <em>adjacent to an Earth stone</em>.
                    It will copy Earth's ability and become impassable too.
                </div>
                <div style="margin-top:8px; color:#bbb; font-size:17px;">
                    Placing stones is free, with no AP cost.
                </div>`,
            action: 'stone-placed-water-earth',
            nextLabel: null,
            modalPos: 'corner'
        },
        // ── wind-escape: player places a wind stone ───────────────────────────────
        {
            id: 'wind-escape',
            title: 'Find a Wind Shrine',
            content: `Explore the board and <strong>end your turn on a Wind shrine</strong> to collect <strong style="color:#ffce00;">Wind stones</strong>.
                <div style="margin-top:8px; color:#bbb; font-size:17px;">
                    Flip a hidden tile to find one, then walk to its center and click <strong>End Turn</strong>.
                </div>`,
            action: 'wind-shrine',
            nextLabel: null,
            freeMove: true,
            modalPos: 'corner'
        },
        // ── use wind stone: player places a wind stone and walks onto it ──────────
        {
            id: 'use-wind-stone',
            title: 'Wind Stone: Free Move!',
            content: `You collected <strong style="color:#ffce00;">Wind stones</strong>! These give you free movement. Moving <em>through</em> a hex with a Wind stone costs <strong>0 AP</strong> instead of 1.
                <div style="margin-top:10px;">
                    <strong>Drag a Wind stone</strong> from your pool onto any hex, then <strong>move your pawn through or past it</strong> to feel the difference.
                </div>`,
            action: 'wind-move',
            nextLabel: null,
            modalPos: 'corner'
        },
        // ── water-wind-synergy: player copies a Wind stone's ability with Water ────
        {
            id: 'water-wind-synergy',
            title: 'Water + Wind: Easy Movement',
            content: `Placing a <strong style="color:#5894f4;">Water stone</strong> next to a <strong style="color:#ffce00;">Wind stone</strong> is especially powerful: water copies Wind's ability too, so that hex also costs <strong>0 AP</strong> to walk through.
                <div style="margin-top:10px;">
                    <strong>Drag a Water stone</strong> from the pool and drop it <em>adjacent to a Wind stone</em> to open up an easy-movement path.
                </div>`,
            action: 'stone-placed-water-wind',
            nextLabel: null,
            modalPos: 'corner'
        },
        // ── fire-counter: player places a fire stone adjacent to earth ────────────
        {
            id: 'fire-counter',
            title: 'Fire Destroys Stones!',
            content: `<strong style="color:#ed1b43;">Fire stones</strong> destroy adjacent stones when placed!
                <div style="margin-top:10px;">
                    <strong>Drag a Fire stone</strong> from the pool and drop it <em>adjacent to an Earth, Water, or Wind stone</em> to destroy them.
                    Watch the stone disappear.
                </div>
                <div style="margin-top:8px; color:#bbb; font-size:17px;">
                    This is how Fire counters Earth, Water, and Wind. It's perfect for breaking traps without spending AP.
                </div>`,
            action: 'stone-placed-fire',
            nextLabel: null,
            modalPos: 'corner'
        },
        // ── void-stones: player places a void stone to cancel a neighbor's ability ─
        {
            id: 'void-stones',
            title: 'Void: Cancel and Empower',
            content: `<strong style="color:#9458f4;">Void stones</strong> do two things. While they sit in your pool, each one raises your max AP by 1, giving you extra Action Points beyond the usual 5.
                <div style="margin-top:10px;">
                    Placed on the board, a Void stone <strong>cancels the ability</strong> of any stone next to it.
                </div>
                <div style="margin-top:10px;">
                    <strong>Drag a Void stone</strong> from the pool and drop it <em>adjacent to another stone</em> to nullify it.
                </div>`,
            action: 'stone-placed-void',
            nextLabel: null,
            modalPos: 'corner'
        },
        // ── react-scrolls: explanation-only, no player action required ──────────
        {
            id: 'react-scrolls',
            title: 'Reaction Scrolls',
            content: `Some scrolls are <strong>Reaction scrolls</strong>. They activate on your <em>opponent's</em> turn, not yours.
                <div style="margin-top:10px;">
                    <strong>Level 1 reactions</strong> are the easiest to build and require the fewest stones. When multiple players try to react on the same turn, reactions resolve by <strong>element rank</strong>. For example, Wind outranks Earth.
                </div>
                <div style="margin-top:10px;">
                    Only <strong>one reaction fires per turn</strong>. You cannot react to a reaction. Once one resolves, the window closes.
                </div>
                <div style="margin-top:10px;">
                    You just picked up a <strong style="color:#5894f4;">Water I</strong> reaction scroll. Hover your cursor over its name in your Hand panel to reveal its ability.
                </div>
                <div style="margin-top:8px; color:#bbb; font-size:17px;">
                    Build a reaction scroll pattern in your Active Area before your opponent's turn to surprise them!
                </div>`,
            action: 'scroll-hover',
            spotlight: '#fsp-hand .fsp-card, #fsp-hand .fsp-compact-row',
            nextLabel: null,
            modalPos: 'corner'
        },
        // ── 22  HUD reference (brief read) ───────────────────────────────────
        {
            id: 'hud',
            title: 'The HUD & Dock',
            content: `Quick reference for the on-screen controls:
            <ul style="margin:10px 0; padding-left:18px; line-height:1.6;">
                <li><strong>AP pips</strong>: five orange squares; each = 1 remaining AP</li>
                <li><strong>Shrine dots</strong>: light up as you activate scrolls</li>
                <li><strong>Activate Scroll</strong>: activates the best matching scroll from Active or Common Area</li>
                <li><strong>End Turn</strong>: ends your turn; AP resets to 5 next turn</li>
            </ul>`,
            action: 'read',
            nextLabel: "I'm ready!",
            spotlight: '#hud-ap-pips',
            modalPos: 'corner'
        },
        // ── 18  finish ───────────────────────────────────────────────────────
        {
            id: 'finish',
            title: "You're Ready!",
            content: `That's the basics of Godaigo!
            <div style="margin-top:12px;">
                Keep exploring: flip hidden tiles, collect scrolls, build stone patterns, activate one scroll of each element, then return to your player shrine to win.
            </div>
            <div style="margin-top:10px; color:#bbb; font-size:17px;">
                Good luck, adventurer. The mystical island awaits.
            </div>`,
            action: 'read',
            nextLabel: 'Start Playing'
        }
    ];

    // Looks a step up by id instead of a hardcoded array position, so inserting
    // or reordering STEPS (e.g. the designer's note pages) never desyncs the
    // game-code hooks below that need to check/advance to a specific step.
    function stepIndexOf(id) {
        return STEPS.findIndex(s => s.id === id);
    }

    // Space bar advances any 'read' step (the designer's note pages, the
    // rules-only steps like Camera Controls, etc.) — same effect as clicking
    // that step's Next/Continue button, so a plain-text page can be read
    // through with just the keyboard.
    document.addEventListener('keydown', (e) => {
        if (!window.isTutorialMode) return;
        if (e.code !== 'Space' && e.key !== ' ') return;
        const step = STEPS[currentStep];
        if (!step || step.action !== 'read') return;
        // Don't hijack Space if focus is on a real text field somewhere else on the page.
        const tag = document.activeElement && document.activeElement.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        advance();
    });

    // ── Board setup ───────────────────────────────────────────────────────────

    function start() {
        window.isTutorialMode       = true;
        window.tutorialDeckOverride = [...TUTORIAL_DECK];
        earthRevealed = false;
        windRevealed  = false;
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
        // Force Hand/Active/Common/Elemental Stones/Opponent Status/Game Log back
        // to their default positions for the walkthrough, regardless of how a
        // player previously dragged/resized them in a real game — not persisted,
        // so their own customized layout is untouched for their next real game.
        try {
            window.ScrollPanelSystem?.resetToDefaults?.();
        } catch (err) {
            console.error('TutorialMode: panel position reset error (non-fatal):', err);
        }
        // Ensure End Turn button is visible — it starts as display:none in HTML
        // and may have been re-hidden by lobby reset flows before the tutorial launched.
        const etBtn = document.getElementById('end-turn');
        if (etBtn) etBtn.style.display = '';
        showExitButton();
        showStep(0);
    }

    // Reuses the real multiplayer #leave-game button (top-left HUD bar) instead
    // of a separate fixed-position button — that button used to float over
    // other UI (Elemental Stones panel / dock bar depending on layout). Same
    // spot, same styling, just repointed at the tutorial's own exit instead
    // of the multiplayer leaveGame() flow.
    function showExitButton() {
        if (exitBtnEl) return;
        const btn = document.getElementById('leave-game');
        if (!btn) return;
        btn.textContent  = 'Exit Tutorial';
        btn.style.display = 'inline-block';
        // The old dedicated exit button sat at z-index:8650 specifically so
        // it stayed clickable above a blocking spotlight overlay (z-index
        // 8600 — see showSpotlight()). #leave-game normally sits at the
        // HUD bar's much lower z-index, so it needs the same lift here or
        // it'd become unclickable the moment a blocking step starts.
        btn.style.position = 'relative';
        btn.style.zIndex   = '8650';
        btn.onclick = finish;
        exitBtnEl = btn;
    }

    function hideExitButton() {
        if (!exitBtnEl) return;
        exitBtnEl.style.display  = 'none';
        exitBtnEl.style.position = '';
        exitBtnEl.style.zIndex   = '';
        exitBtnEl.onclick = null;
        exitBtnEl.textContent = 'Leave';
        exitBtnEl = null;
    }

    /** Called from game-core.js placeTile() when the local player drops their tile. */
    function onPlayerTilePlaced() {
        if (currentStep !== stepIndexOf('tile-placed')) return;
        setTimeout(() => showStep(stepIndexOf('camera')), 600);
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
     * blocking=true  → also add a full-screen dim overlay that eats all clicks/hovers
     *                  (use for action:'click' and action:'scroll-hover' steps so
     *                  only the target is interactive)
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
                    updateStatus('Interact with the highlighted element to continue the tutorial.');
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
        // Positioning/sizing for the corner case (bottom padding to clear the
        // dock bar, max-height + scroll so it can never grow past that) all
        // lives in css/styles.css's .tutorial-modal.tutorial-corner rules now
        // — no inline JS sizing to get out of sync or fail to run.
        const boxStyle  = isCorner ? '' : 'max-width:460px;';

        const actionHints = {
            'move':          'Drag your pawn to the glowing tile to continue…',
            'explore':       'Drag your pawn onto any face-down tile to flip it…',
            'click':         'Click the highlighted element to continue…',
            'place-tile':    'Drag your player tile onto the board to continue…',
            'end-turn':      'Walk to the glowing shrine center, then click End Turn…',
            'scroll-hover':  'Hover the Avalanche scroll in your Hand panel to continue…',
            'scroll-moved':  'Open your Hand panel and click "Move to Active Area" on the Avalanche scroll…',
            'stone-placed':  'Drag an Earth stone from the stone pool and drop it adjacent to your pawn…',
            'pattern-built': 'Build the Avalanche pattern (4 Earth stones) around your pawn. See the scroll card for the layout…',
            'spell-cast':    'Click "Activate Scroll" in the dock (or the Activate ✦ button on the scroll card) to activate Avalanche…',
            'stone-broken':  'Right-click an Earth stone to break it (costs 5 AP)…',
            'wind-shrine':       'Explore the board, find a Wind shrine, walk to its center and click End Turn…',
            'wind-move':         'Drag a Wind stone, drop it on any hex, then move your pawn through or past it…',
            'stone-placed-fire': 'Drag a Fire stone (red) from the pool and place it adjacent to an Earth stone…',
            'stone-placed-water-earth': 'Drag a Water stone from the pool and place it adjacent to an Earth stone…',
            'stone-placed-water-wind':  'Drag a Water stone from the pool and place it adjacent to a Wind stone…',
            'stone-placed-void':        'Drag a Void stone from the pool and place it adjacent to another stone…',
            'scripted-ai':       'Watch the opponent\'s move…',
        };
        const footerHTML = (step.nextLabel && !actionHints[step.action])
            ? `<button class="tmode-next">${step.nextLabel}</button>`
            : step.action in actionHints
                ? `<span style="color:#bbb;font-size:17px;font-style:italic;">${actionHints[step.action]}</span>`
                : `<span style="color:#bbb;font-size:17px;font-style:italic;">Complete the action above to continue…</span>`;

        // Lets a step (currently the designer's-note pages) offer a muted "Skip"
        // button that jumps straight to another step by id, bypassing the rest
        // of its own sequence, without touching the normal Next/Continue flow.
        const skipHTML = step.skipTo
            ? `<button class="tmode-skip" style="background:none;border:none;color:#888;font-size:14px;cursor:pointer;padding:4px 2px;text-decoration:underline;transition:color 0.15s;">Skip Preamble</button>`
            : '';
        const footerJustify = step.skipTo ? 'space-between' : 'flex-end';

        const overlay = document.createElement('div');
        overlay.className = `tutorial-modal tutorial-tmode${isCorner ? ' tutorial-corner' : ''}`;

        overlay.innerHTML = `
            <div class="tutorial-content" style="${boxStyle}">
                <div class="tutorial-header">
                    <span class="tutorial-step-label">Step ${currentStep + 1} of ${STEPS.length}</span>
                    <h3 class="tutorial-title">${step.title}</h3>
                </div>
                <div class="tutorial-body">${step.content}</div>
                <div class="tutorial-footer"
                     style="display:flex;justify-content:${footerJustify};align-items:center;margin-top:14px;gap:8px;">
                    ${skipHTML}
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

        const skipBtn = overlay.querySelector('.tmode-skip');
        if (skipBtn) {
            skipBtn.addEventListener('mouseenter', () => { skipBtn.style.color = '#ddd'; });
            skipBtn.addEventListener('mouseleave', () => { skipBtn.style.color = '#888'; });
            skipBtn.addEventListener('click', () => showStep(stepIndexOf(step.skipTo)));
        }

        if (isCorner) {
            pinCornerModalAboveDock(overlay);
            cornerResizeFn = () => pinCornerModalAboveDock(overlay);
            window.addEventListener('resize', cornerResizeFn);
        }
    }

    // Belt-and-suspenders positioning for the corner popup: measures the real,
    // on-screen (getBoundingClientRect — always true viewport pixels, unlike
    // vh/percentage math) top edge of .dock-bar and the popup's own rendered
    // bottom edge, then nudges the popup up with a transform if it's still
    // sitting on/over the dock bar. This doesn't assume the CSS box-model
    // math lines up with the visible viewport — it checks the actual
    // rendered result and corrects it directly, so it holds regardless of
    // window size, zoom, or any ancestor (e.g. body's CRT `filter` in
    // base.css, which makes body the containing block for every
    // position:fixed element on the page instead of the true viewport) that
    // could otherwise throw off plain CSS positioning.
    function pinCornerModalAboveDock(overlay) {
        const content = overlay.querySelector('.tutorial-content');
        const dock    = document.querySelector('.dock-bar');
        if (!content || !dock) return;
        const margin  = 16;
        const dockTop = dock.getBoundingClientRect().top;

        // Cap how tall the box can ever be, so long step text scrolls
        // internally instead of pushing the bottom edge down past the dock.
        content.style.maxHeight = Math.max(120, dockTop - margin * 2) + 'px';
        content.style.overflowY = 'auto';
        content.style.transform = 'none';

        const overlap = content.getBoundingClientRect().bottom - (dockTop - margin);
        if (overlap > 0) {
            content.style.transform = `translateY(${-overlap}px)`;
        }
    }

    function closeModal() {
        if (cornerResizeFn) {
            window.removeEventListener('resize', cornerResizeFn);
            cornerResizeFn = null;
        }
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
        if (stepId === 'open-scrolls') {
            // If the Hand panel is already open (player opened it during free exploration),
            // force-close it so the spotlight click action opens it fresh as intended.
            document.querySelectorAll('.fsp-close-btn').forEach(btn => btn.click());
        } else if (stepId === 'cast-avalanche') {
            // Guarantee at least 2 AP so the player can cast without having to End Turn.
            if (ss && ss.actionPoints < 2) {
                ss.actionPoints = 2;
                if (typeof updateHUD === 'function') updateHUD();
            }
            // Keep at least 1 earth stone in the pool as a spare in case a pattern stone
            // gets broken and needs to be replaced before casting.
            const pool = window.playerPool;
            if (pool && (pool.earth || 0) < 1) {
                pool.earth = 1;
                if (typeof updateStonePoolDisplay === 'function') updateStonePoolDisplay();
            }
        } else if (stepId === 'break-trap') {
            // Set AP to exactly 5 so player can afford one Earth break (cost 5).
            if (ss) { ss.actionPoints = 5; if (typeof updateHUD === 'function') updateHUD(); }
            // Safety net: ensure at least one earth stone is on the board to break.
            const hasEarth = Array.isArray(window.placedStones)
                && window.placedStones.some(s => s.type === 'earth');
            if (!hasEarth && typeof window.placeStoneVisually === 'function') {
                const { x: nx, y: ny } = hp(3, 0);
                window.placeStoneVisually(nx, ny, 'earth');
            }
        } else if (stepId === 'fire-counter') {
            const pool = window.playerPool;
            if (pool && (pool.fire || 0) < 1) {
                pool.fire = (pool.fire || 0) + 2;
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
        } else if (stepId === 'water-basics') {
            const pool = window.playerPool;
            if (pool && (pool.water || 0) < 1) {
                pool.water = (pool.water || 0) + 2;
                if (typeof updateHUD === 'function') updateHUD();
                if (typeof updateStonePoolDisplay === 'function') updateStonePoolDisplay();
            }
            // Safety net: ensure at least one earth stone is on the board for Water to copy.
            const hasEarth = Array.isArray(window.placedStones)
                && window.placedStones.some(s => s.type === 'earth');
            if (!hasEarth && typeof window.placeStoneVisually === 'function') {
                const { x: nx, y: ny } = hp(3, 0);
                window.placeStoneVisually(nx, ny, 'earth');
            }
        } else if (stepId === 'water-wind-synergy') {
            const pool = window.playerPool;
            if (pool && (pool.water || 0) < 1) {
                pool.water = (pool.water || 0) + 1;
                if (typeof updateHUD === 'function') updateHUD();
                if (typeof updateStonePoolDisplay === 'function') updateStonePoolDisplay();
            }
            // Safety net: ensure at least one wind stone is on the board for Water to copy.
            const hasWind = Array.isArray(window.placedStones)
                && window.placedStones.some(s => s.type === 'wind');
            if (!hasWind && typeof window.placeStoneVisually === 'function') {
                const { x: nx, y: ny } = hp(3, 0);
                window.placeStoneVisually(nx, ny, 'wind');
            }
        } else if (stepId === 'void-stones') {
            const pool = window.playerPool;
            if (pool && (pool.void || 0) < 1) {
                pool.void = (pool.void || 0) + 2;
                if (typeof updateHUD === 'function') updateHUD();
                if (typeof updateStonePoolDisplay === 'function') updateStonePoolDisplay();
            }
            // Safety net: ensure at least one other stone is on the board for Void to nullify.
            const hasOther = Array.isArray(window.placedStones)
                && window.placedStones.some(s => s.type !== 'void');
            if (!hasOther && typeof window.placeStoneVisually === 'function') {
                const { x: nx, y: ny } = hp(3, 0);
                window.placeStoneVisually(nx, ny, 'earth');
            }
        } else if (stepId === 'react-scrolls') {
            // Force a Water I "Reflect" scroll into the player's hand — a real
            // Level 1 response scroll — so this step has an actual scroll to
            // hover and reveal, instead of just a Continue button.
            const ss = window.spellSystem;
            if (ss && typeof ss.getPlayerScrolls === 'function') {
                const scrolls = ss.getPlayerScrolls(false);
                const already = scrolls.hand.has('WATER_SCROLL_1') || scrolls.active?.has('WATER_SCROLL_1');
                if (!already) {
                    // Remove it from the water deck first so it can never be drawn a second time.
                    const deck = ss.scrollDecks?.water;
                    if (Array.isArray(deck)) {
                        const idx = deck.indexOf('WATER_SCROLL_1');
                        if (idx >= 0) deck.splice(idx, 1);
                    }
                    scrolls.hand.add('WATER_SCROLL_1');
                    if (typeof ss.updateScrollCount === 'function') ss.updateScrollCount();
                }
            }
            if (window.ScrollPanelSystem) {
                window.ScrollPanelSystem.openPanel('hand');
                window.ScrollPanelSystem.refresh();
            }
        }
    }

    /** Returns 'hand' | 'active' | 'common' based on where Avalanche is.
     *  Uses the spellSystem data model (not DOM) so closed panels don't fool it.
     *  Anything not in hand or active is treated as 'common' — the deck case is
     *  not a concern since the tutorial no longer generates a second Earth tile. */
    function getAvalancheLocation() {
        const ss = window.spellSystem;
        if (ss && typeof ss.getPlayerScrolls === 'function') {
            const scrolls = ss.getPlayerScrolls(false);
            if (scrolls?.hand?.has('EARTH_SCROLL_5'))   return 'hand';
            if (scrolls?.active?.has('EARTH_SCROLL_5')) return 'active';
        }
        return 'common';
    }

    function showStep(index) {
        const step = STEPS[index];
        if (!step) return;
        currentStep = index;
        console.log('[Tutorial] showStep', index, '→', step.id, '| action:', step.action);
        prepareStepEntry(step.id);

        // If a scroll is already in active, skip the 'scroll-moved' gate automatically
        if (step.action === 'scroll-moved') {
            const ss = window.spellSystem;
            if (ss && typeof ss.getPlayerScrolls === 'function') {
                const scrolls = ss.getPlayerScrolls(false);
                if (scrolls && scrolls.active && scrolls.active.size > 0) {
                    setTimeout(advance, 400);
                    return;
                }
            }
        }

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
        // Block all other interaction for 'click' and 'scroll-hover' steps —
        // both require the player to interact with the exact spotlit element
        // to advance, so everything else dims and stops accepting clicks/hovers.
        // move/place-tile steps don't block: the board itself needs to stay
        // interactive so the player can drag pawns/tiles.
        // step.noDim is an escape hatch for a 'click' or 'scroll-hover' step
        // that should keep its highlight ring and advance-gate but NOT dim/
        // block the rest of the screen.
        if (step.spotlight) {
            const blocks = step.action === 'click' || step.action === 'scroll-hover';
            const blocking = blocks && !step.noDim;
            showSpotlight(step.spotlight, blocking);
            if (step.action === 'click') {
                attachClickAdvance(step.spotlight);
            }
        }

        // For how-to-win, check Avalanche location and modify what we show BEFORE rendering.
        let stepToShow = step;
        if (step.id === 'how-to-win') {
            const loc = getAvalancheLocation();
            console.log('[Tutorial] how-to-win entry — Avalanche location:', loc);
            if (loc === 'common') {
                const notice = `<div style="margin-bottom:12px;padding:8px 10px;background:rgba(148,88,244,0.15);border-left:3px solid #9458f4;border-radius:4px;font-size:17px;">Normally we'd show you how to move <strong>Avalanche</strong> from your Hand to your <strong>Active Area</strong>, but you moved it to the <strong>Common Area</strong>, where anyone can play it unless it gets replaced by a scroll of the same type.</div>`;
                stepToShow = { ...step, content: notice + step.content };
            }
        }
        showModal(stepToShow);

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
            startHintTimer('Build the Avalanche pattern (4 Earth stones) around your pawn. See the scroll card for the layout…');
        }
        // During cast step, monitor for a broken pattern so the player gets actionable feedback.
        if (step.action === 'spell-cast') {
            patternPollInterval = setInterval(() => {
                const ss = window.spellSystem;
                if (ss && typeof ss.checkPattern === 'function' && !ss.checkPattern('EARTH_SCROLL_5')) {
                    if (typeof updateStatus === 'function')
                        updateStatus('Pattern broken. Replace the Earth stone, then Activate Scroll.');
                }
            }, 1000);
        }
        // Start hint timers for other action-gated steps
        const hintMessages = {
            'scroll-hover':  'Hover the Avalanche scroll in your Hand panel to continue…',
            'scroll-moved':  'Open your Hand panel and click "Move to Active Area" on the Avalanche scroll…',
            'stone-placed':  'Drag an Earth stone from the stone pool and drop it adjacent to your pawn…',
            'spell-cast':    'Click "Activate Scroll" in the dock after placing the pattern…',
            'stone-broken':  'Right-click an Earth stone to break it (costs 5 AP)…',
            'wind-shrine':       'Explore the board, find a Wind shrine, walk to its center and click End Turn…',
            'wind-move':         'Drag a Wind stone from the pool, drop it on any hex, then move your pawn through or past it…',
            'stone-placed-fire': 'Drag a Fire stone from the pool adjacent to an Earth stone…',
            'stone-placed-water-earth': 'Drag a Water stone from the pool adjacent to an Earth stone…',
            'stone-placed-water-wind':  'Drag a Water stone from the pool adjacent to a Wind stone…',
            'stone-placed-void':        'Drag a Void stone from the pool adjacent to another stone…',
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
        if (currentStep === stepIndexOf('move-pawn') && !earthRevealed) {
            // Force the first tile the player steps on to be Earth — regardless of
            // where they placed their player tile or which direction they moved.
            tile.shrineType = 'earth';
            primeEarthDeck(window.spellSystem);
        } else if (currentStep === stepIndexOf('wind-escape') && !windRevealed) {
            // Same trick for Wind — the next tile flipped during wind-escape is
            // forced to be a Wind shrine, so the player doesn't have to hunt for
            // one by chance.
            tile.shrineType = 'wind';
        }
    }

    /**
     * Called from game-core.js AFTER tile visuals are built and the scroll is drawn.
     * We advance the tutorial here so the scroll is already in the player's hand.
     */
    function onTileRevealed(tile, spellSystem) {
        if (currentStep === stepIndexOf('move-pawn') && !earthRevealed) {
            earthRevealed = true;
            setTimeout(() => showStep(stepIndexOf('scroll-found')), 900); // let the flip animation finish
        } else if (currentStep === stepIndexOf('wind-escape') && !windRevealed) {
            // No step-advance here — wind-escape's own onEndTurn gate (below)
            // already advances once the player ends their turn on the shrine
            // and actually collects Wind stones. Just stop forcing further
            // reveals during this step.
            windRevealed = true;
        }
    }

    /** Called from game-ui.js after a successful pawn move. */
    function onPlayerMoved(toX, toY) {
        const step = STEPS[currentStep];
        if (!step) return;

        // Earth-shrine: hint when player reaches shrine center.
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
     * Called from game-ui.js when any step in the player's path had cost 0
     * (i.e. the player moved through or past a wind stone).
     */
    function onWindStoneUsed() {
        const step = STEPS[currentStep];
        if (!step || step.action !== 'wind-move') return;
        clearHintTimer();
        setTimeout(advance, 400);
    }

    /**
     * Called from game-ui.js after shrine stone replenishment when the player
     * clicks End Turn. pos is the player's current {x, y} position.
     */
    function onEndTurn(pos) {
        const step = STEPS[currentStep];
        if (!step) return;

        // ── Earth shrine gate ────────────────────────────────────────────────
        if (step.id === 'earth-shrine') {
            const dist = pos
                ? Math.sqrt(Math.pow(pos.x - EARTH_POS.x, 2) + Math.pow(pos.y - EARTH_POS.y, 2))
                : Infinity;
            if (dist < 20) {
                setTimeout(() => showStep(currentStep + 1), 900);
            } else {
                if (typeof updateStatus === 'function')
                    updateStatus('Walk to the glowing Earth shrine center first, then click End Turn.');
            }
            return;
        }

        // ── Wind shrine gate ─────────────────────────────────────────────────
        // Fires after shrine replenishment, so playerPool.wind is already updated.
        if (step.action === 'wind-shrine') {
            const windNow = window.playerPool?.wind || 0;
            if (windNow > 0) {
                clearHintTimer();
                setTimeout(() => showStep(currentStep + 1), 900);
            } else {
                if (typeof updateStatus === 'function')
                    updateStatus('End your turn on the Wind shrine center to collect Wind stones.');
            }
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

    // "Adjacent" here mirrors game-core.js's own stone-adjacency threshold
    // (TILE_SIZE=20 * 2.5 = 50px) — the small ring of hex stone-slots around
    // a tile — so it means the same thing the real game means by it.
    function isAdjacentToStoneType(x, y, type) {
        const stones = window.placedStones;
        if (!Array.isArray(stones)) return false;
        return stones.some(s => {
            if (s.type !== type) return false;
            const dist = Math.sqrt((s.x - x) ** 2 + (s.y - y) ** 2);
            return dist > 5 && dist < 50;
        });
    }

    // Same as above, but true for ANY neighboring stone other than the given type
    // (used for the Void step — any adjacent stone demonstrates nullification).
    function isAdjacentToOtherStone(x, y, excludeType) {
        const stones = window.placedStones;
        if (!Array.isArray(stones)) return false;
        return stones.some(s => {
            if (s.type === excludeType) return false;
            const dist = Math.sqrt((s.x - x) ** 2 + (s.y - y) ** 2);
            return dist > 5 && dist < 50;
        });
    }

    /** Called from game-core.js after a stone is placed on the board. */
    function onStonePlaced(stoneType, x, y) {
        const step = STEPS[currentStep];
        if (!step) return;
        if (step.action === 'stone-placed' && (!step.stoneType || step.stoneType === stoneType)) {
            clearHintTimer();
            clearPatternPoll();
            setTimeout(advance, 400);
        } else if (step.action === 'wind-move' && stoneType === 'wind') {
            // Stone placed — update hint to tell player to move through it.
            clearHintTimer();
            if (typeof updateStatus === 'function')
                updateStatus('Wind stone placed! Now move your pawn through or past it to feel the free movement.');
        } else if (step.action === 'stone-placed-fire' && stoneType === 'fire') {
            clearHintTimer();
            setTimeout(advance, 400);
        } else if (step.action === 'stone-placed-water-earth' && stoneType === 'water') {
            if (isAdjacentToStoneType(x, y, 'earth')) {
                clearHintTimer();
                setTimeout(advance, 400);
            } else if (typeof updateStatus === 'function') {
                updateStatus('Place the Water stone adjacent to an Earth stone to copy its ability.');
            }
        } else if (step.action === 'stone-placed-water-wind' && stoneType === 'water') {
            if (isAdjacentToStoneType(x, y, 'wind')) {
                clearHintTimer();
                setTimeout(advance, 400);
            } else if (typeof updateStatus === 'function') {
                updateStatus('Place the Water stone adjacent to a Wind stone to copy its free-movement ability.');
            }
        } else if (step.action === 'stone-placed-void' && stoneType === 'void') {
            if (isAdjacentToOtherStone(x, y, 'void')) {
                clearHintTimer();
                setTimeout(advance, 400);
            } else if (typeof updateStatus === 'function') {
                updateStatus('Place the Void stone adjacent to another stone to cancel its ability.');
            }
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

    /** Called from scroll-panels.js when the player hovers any scroll card/row to preview it. */
    function onScrollHovered(scrollName) {
        const step = STEPS[currentStep];
        if (!step || step.action !== 'scroll-hover') return;
        clearHintTimer();
        advance();
    }

    /** Called from scroll-panels.js when player moves a scroll between areas. */
    function onScrollMoved(scrollName, fromArea, toArea) {
        const step = STEPS[currentStep];
        console.log('[Tutorial] onScrollMoved', scrollName, fromArea, '→', toArea, '| step:', step?.id, 'action:', step?.action);
        if (!step) return;
        if (step.action === 'scroll-moved') {
            if (toArea === 'active') {
                clearHintTimer();
                setTimeout(advance, 400);
            } else if (toArea === 'common') {
                clearHintTimer();
                // Mutate the existing modal in place — avoids close/reopen race with the
                // panel's own 60ms refresh setTimeout.
                if (modalEl) {
                    const titleEl  = modalEl.querySelector('.tutorial-title');
                    const bodyEl   = modalEl.querySelector('.tutorial-body');
                    const footerEl = modalEl.querySelector('.tutorial-footer');
                    if (titleEl)  titleEl.textContent = 'Common Area';
                    if (bodyEl)   bodyEl.innerHTML = `Normally we'd show you how to move <strong>Avalanche</strong> from your Hand to your <strong>Active Area</strong>, but you moved it to the <strong>Common Area</strong>, where anyone can play it unless it gets replaced by a scroll of the same type.`;
                    if (footerEl) {
                        footerEl.innerHTML = `<button class="tmode-next">Ok!</button>`;
                        footerEl.querySelector('.tmode-next').addEventListener('click', advance);
                    }
                }
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
        onTilePreReveal, onTileRevealed, onPlayerMoved, onWindStoneUsed, onPlayerTilePlaced, onEndTurn, showMovementHint,
        onStonePlaced, onStoneBroken, onScrollMoved, onScrollHovered, onSpellCast,
        get currentStep() { return currentStep; }
    };
})();

window.TutorialMode = TutorialMode;
