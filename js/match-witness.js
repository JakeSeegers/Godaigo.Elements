// match-witness.js: board fingerprints + win witnesses (Phase 2).
//
// Runs in every human player's browser during an online game:
//   * The moment the turn number changes, it hashes the PUBLIC board (tiles,
//     stones, pawns, activated elements; face-down tiles stay hidden) and
//     reports it (report_fingerprint). Browsers that disagree get the match
//     flagged as out of sync, for review only.
//   * At game over it checks the winner against its OWN board (5 elements
//     activated + standing on their own shrine) and reports the result
//     (report_game_result). The server only pays a win when another human
//     player confirms it (claim_game_win, sql/match-witness.sql).
//
// Reads game-core.js globals (placedTiles, placedStones, playerPositions,
// spellSystem, isPlayerAtOwnShrine) and multiplayer-state.js globals
// (isMultiplayer, currentGameId, currentTurnNumber) at call time. Never
// changes gameplay; every failure is only logged.
(function () {
    const WATCH_MS = 100;         // turn-number check; fast so the next player hasn't acted yet
    const RESULT_DELAY_MS = 1500; // let the winner's last messages land first
    const RESULT_TRIES = 3;

    let lastTurn = null;
    let lastRoom = null;
    let reportedRoom = null;

    function inOnlineGame() {
        try {
            return !!(isMultiplayer && currentGameId &&
                document.getElementById('game-layout')?.classList.contains('active'));
        } catch (e) { return false; }
    }

    // FNV-1a, run twice with different seeds for a 64-bit (16 hex) result.
    function hash(text) {
        let a = 0x811c9dc5, b = 0x01000193 ^ 0x9e3779b9;
        for (let i = 0; i < text.length; i++) {
            const c = text.charCodeAt(i);
            a = Math.imul(a ^ c, 0x01000193);
            b = Math.imul(b ^ c, 0x01000193);
        }
        return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
    }

    function activatedOf(index) {
        try {
            const set = spellSystem?.playerScrolls?.[index]?.activated;
            return set ? [...set].sort() : [];
        } catch (e) { return []; }
    }

    // Only what every player can see, in a fixed order.
    function publicState() {
        const r = v => Math.round(v);
        const tiles = (placedTiles || []).map(t =>
            `${r(t.x)},${r(t.y)},${t.flipped ? '?' : (t.element || '')},${t.isPlayerTile ? 'p' + t.playerIndex : ''}`
        ).sort();
        const stones = (placedStones || []).map(s => `${r(s.x)},${r(s.y)},${s.type}`).sort();
        const pawns = (playerPositions || []).map((p, i) => p ? `${i}:${r(p.x)},${r(p.y)}` : `${i}:-`);
        const scrolls = spellSystem?.playerScrolls || [];
        const activated = scrolls.map((_, i) => `${i}:${activatedOf(i).join('+')}`);
        return tiles.join(';') + '|' + stones.join(';') + '|' + pawns.join(';') + '|' + activated.join(';');
    }

    function fingerprint() {
        try { return hash(publicState()); } catch (e) { return null; }
    }

    // ── Turn fingerprints ────────────────────────────────────────
    setInterval(() => {
        if (!inOnlineGame()) { lastTurn = null; lastRoom = null; return; }
        let turn;
        try { turn = currentTurnNumber; } catch (e) { return; }
        if (lastRoom !== currentGameId) { lastRoom = currentGameId; lastTurn = turn; return; }
        if (turn === lastTurn || !(turn > 0)) { lastTurn = turn; return; }
        lastTurn = turn;
        const fp = fingerprint();
        if (!fp) return;
        supabase.rpc('report_fingerprint', { p_room_id: currentGameId, p_turn: turn, p_fingerprint: fp })
            .then(({ error }) => { if (error) console.warn('[witness] fingerprint failed:', error.message); });
    }, WATCH_MS);

    // ── Game over witness ────────────────────────────────────────
    function onGameOver(winnerIndex, winType) {
        let roomId;
        try { roomId = currentGameId; } catch (e) { return; }
        if (!roomId || reportedRoom === roomId || typeof winnerIndex !== 'number') return;
        // Only a scroll win has conditions to check. Last player standing
        // wins have no other players left to witness.
        if (winType && winType !== 'scrolls') return;
        reportedRoom = roomId;

        let tries = 0;
        const check = () => {
            tries++;
            const activated = activatedOf(winnerIndex);
            let atShrine = false;
            try { atShrine = !!isPlayerAtOwnShrine(winnerIndex); } catch (e) {}
            const confirms = activated.length >= 5 && atShrine;
            if (!confirms && tries < RESULT_TRIES) { setTimeout(check, RESULT_DELAY_MS); return; }
            supabase.rpc('report_game_result', {
                p_room_id: roomId,
                p_winner_index: winnerIndex,
                p_confirms: confirms,
                p_activated: activated,
                p_at_shrine: atShrine,
                p_fingerprint: fingerprint(),
            }).then(({ error }) => {
                if (error) console.warn('[witness] result report failed:', error.message);
                else console.log(`[witness] reported winner ${winnerIndex}: ${confirms ? 'confirmed' : 'NOT confirmed'}`);
            });
        };
        setTimeout(check, RESULT_DELAY_MS);
    }

    window.MatchWitness = { onGameOver, fingerprint, publicState };
})();
