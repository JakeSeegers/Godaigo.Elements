/**
 * Tutorial System for Godaigo
 *
 * Lightweight modal with multiple pages.
 * Dismissed per session (closing once hides it for the rest of the session).
 *
 * Type "tutorial" on keyboard during a game to re-enable tutorials.
 */

const tutorialSystem = (function() {
    const STEPS = [
        {
            id: 'welcome',
            title: 'Welcome to Godaigo!',
            content: `Your goal is to <strong>master all 5 elements</strong> by collecting and activating one scroll of each type.
                <div style="margin-top: 12px; display: flex; justify-content: center; gap: 16px; font-size: 22px;">
                    <span style="color: #69d83a;">Earth</span>
                    <span style="color: #5894f4;">Water</span>
                    <span style="color: #ed1b43;">Fire</span>
                    <span style="color: #ffce00;">Wind</span>
                    <span style="color: #9458f4;">Void</span>
                </div>
                <div style="margin-top: 8px; color: #aaa; font-size: 13px;">Be the first to activate all five to win!</div>`
        },
        {
            id: 'placement',
            title: 'Player Tile Placement',
            content: `Each player places their Player Tile to start the game.<strong>Drag your Player Tile (which appears as a hexagon) from the menu on the left </strong> and place it next to the edges of two hexagons on the board.
                <div style="margin-top: 8px; color: #aaa; font-size: 13px;">Each tile hides a shrine that will be revealed when a player lands on it.</div>`
        },
        {
            id: 'movement',
            title: 'Movement & Action Points',
            content: `You have <strong>5 Action Points (AP)</strong> each turn. <strong>Drag your pawn</strong> to move \u2014 each hex costs 1 AP.
                <div style="margin-top: 8px; color: #aaa; font-size: 13px;">Land on face-down tiles to flip them and discover shrines. Your AP resets at the start of your next turn.</div>`
        },
        {
            id: 'shrines',
            title: 'Shrines & Stones',
            content: `When you <strong>end your turn</strong> on a shrine, you gather <strong>elemental stones</strong> of that type and draw a <strong>scroll</strong>.
                <div style="margin-top: 8px;">Check the <strong>Scrolls</strong> menu to see what you found and interact with it.</div>
                <div style="margin-top: 8px; color: #aaa; font-size: 13px;">Drag stones from your pool onto the board to form patterns that match your scrolls.</div>`
        },
        {
            id: 'scrolls',
            title: 'Scrolls',
            content: `Scrolls go to your <strong>hand</strong> (max 3).
                <div style="margin-top: 8px;">Move a scroll to your <strong>Active area</strong> to prepare it. Match its stone pattern on the board, then press <strong>Cast Spell</strong> to activate it.</div>
                <div style="margin-top: 8px; color: #aaa; font-size: 13px;">Click the Scrolls button to view and manage your scrolls.</div>`
        },
        {
            id: 'casting',
            title: 'Casting & Responses',
            content: `After casting a spell, opponents get a brief window to <strong>respond</strong> with counter or reaction scrolls.
                <div style="margin-top: 8px; color: #aaa; font-size: 13px;">Once the response window closes, your scroll's effect activates! Some scrolls can block or counter enemy spells.</div>`
        },
        {
            id: 'endturn',
            title: 'Ending Your Turn',
            content: `Press <strong>End Turn</strong> when you're done. Your AP refreshes at the <strong>start of your next turn</strong>.
                <div style="margin-top: 8px;">Consider saving some AP \u2014 you can spend it on <strong>response scrolls</strong> during other players' turns!</div>
                <div style="margin-top: 8px; color: #aaa; font-size: 13px;">Before ending, make sure you've moved, placed stones, and cast any spells you want.</div>`
        }
    ];

    let dismissed = false;
    let activeModal = null;
    let currentIndex = 0;

    function showStep(stepId) {
        if (dismissed) return;
        const idx = STEPS.findIndex(s => s.id === stepId);
        if (idx < 0) return;
        openModal(idx);
    }

    function openModal(index) {
        ensureModal();
        render(index);
    }

    function ensureModal() {
        if (activeModal) return;

        const overlay = document.createElement('div');
        overlay.className = 'tutorial-modal';

        overlay.innerHTML = `
            <div class="tutorial-content">
                <div class="tutorial-header">
                    <span class="tutorial-step-label"></span>
                    <h3 class="tutorial-title"></h3>
                    <button class="tutorial-close">&times;</button>
                </div>
                <div class="tutorial-body"></div>
                <div class="tutorial-footer" style="display: flex; gap: 8px; justify-content: space-between;">
                    <button class="tutorial-prev">Back</button>
                    <div style="flex: 1"></div>
                    <button class="tutorial-next">Next</button>
                    <button class="tutorial-got-it">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        activeModal = overlay;

        const close = () => {
            dismissed = true;
            overlay.classList.add('tutorial-fade-out');
            setTimeout(() => {
                overlay.remove();
                activeModal = null;
            }, 200);
        };

        overlay.querySelector('.tutorial-close').addEventListener('click', close);
        overlay.querySelector('.tutorial-got-it').addEventListener('click', close);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        overlay.querySelector('.tutorial-prev').addEventListener('click', () => {
            if (currentIndex > 0) render(currentIndex - 1);
        });
        overlay.querySelector('.tutorial-next').addEventListener('click', () => {
            if (currentIndex < STEPS.length - 1) render(currentIndex + 1);
        });

        requestAnimationFrame(() => {
            overlay.classList.add('tutorial-visible');
        });
    }

    function render(index) {
        if (!activeModal) return;
        const step = STEPS[index];
        if (!step) return;
        currentIndex = index;

        const label = activeModal.querySelector('.tutorial-step-label');
        const title = activeModal.querySelector('.tutorial-title');
        const body = activeModal.querySelector('.tutorial-body');
        const prevBtn = activeModal.querySelector('.tutorial-prev');
        const nextBtn = activeModal.querySelector('.tutorial-next');

        if (label) label.textContent = `Page ${index + 1} of ${STEPS.length}`;
        if (title) title.textContent = step.title;
        if (body) body.innerHTML = step.content;
        if (prevBtn) prevBtn.disabled = index === 0;
        if (nextBtn) nextBtn.disabled = index === STEPS.length - 1;
    }

    function reset() {
        dismissed = false;
        console.log('Tutorial system re-enabled!');
    }

    // Secret keyboard sequence "tutorial" to re-enable tutorials
    (function() {
        const SECRET = 'tutorial';
        let buffer = '';
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            buffer += e.key.toLowerCase();
            if (buffer.length > SECRET.length) {
                buffer = buffer.slice(-SECRET.length);
            }
            if (buffer === SECRET) {
                reset();
                buffer = '';
                // Show a brief confirmation
                const msg = document.createElement('div');
                msg.textContent = 'Tutorials re-enabled!';
                Object.assign(msg.style, {
                    position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
                    background: '#d9b08c', color: '#1a1a1a', padding: '10px 24px',
                    borderRadius: '8px', fontWeight: 'bold', fontSize: '14px',
                    zIndex: '10001', transition: 'opacity 0.5s'
                });
                document.body.appendChild(msg);
                setTimeout(() => { msg.style.opacity = '0'; }, 1500);
                setTimeout(() => msg.remove(), 2000);
            }
        });
    })();

    return {
        showStep,
        reset,
        get dismissed() { return dismissed; }
    };
})();
