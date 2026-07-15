// ============================================================
// bot.js — Stage 1 utility bot for Godaigo (docs/bot-roadmap.md)
// ============================================================
// HOW TO USE:
//   Shift+R  → execute ONE bot action for the active player
//   Shift+B  → play out the WHOLE turn (loops actions until end of turn)
//   Console  → window.BotSystem.step() / .turn() / .rank() / .WEIGHTS
//
// HOW IT DECIDES (Stage 1 of the roadmap — no lookahead yet):
//   1. BotState.legalActions() enumerates every legal action
//   2. scoreAction() gives each a utility: Σ weight × feature
//   3. argmax wins. All strategy knobs live in WEIGHTS — tune the table,
//      not the code. Stage 3a evolution writes better weights to
//      localStorage['godaigo_bot_weights'], loaded over defaults at startup.
//
// Observation/actuation is bot-state.js (window.BotState). This file must
// never touch game internals directly except through BotState + snapshot.
//
// LOAD ORDER: after bot-state.js (which is after lobby.js)
// ============================================================

(function () {
    'use strict';

    function log(...args) { console.log('🤖 [Bot]', ...args); }

    const ELEMENTS = ['earth', 'water', 'fire', 'wind', 'void'];
    const POOL_CAP = 5;

    // ----------------------------------------------------------------
    // WEIGHTS — the single tuning surface. Stage 3a evolves this table.
    // Positive = more attractive. Rough scale: 100 ≈ "clearly best action".
    // ----------------------------------------------------------------
    const DEFAULT_WEIGHTS = {
        // casting
        castBase:          100,  // any satisfied pattern is usually worth firing
        castUnactivated:    80,  // scroll element not yet activated (win progress!)
        castDeadElement:   -60,  // source pool empty → effect fires but NO win credit
        castAlreadyWon:    -120, // element already activated — no win-condition value left;
                                 // without this the bot loops forever re-casting a satisfied
                                 // pattern instead of exploring for the elements it still needs
        castNoCredit:     -500,  // this exact scroll was cast before and its special effect
                                 // cancelled without granting win credit (e.g. Sacrificial
                                 // Pyre with an empty hand) — hard veto, same magnitude as
                                 // placeNoCredit, so a still-"unactivated" element can't lure
                                 // the bot into recasting a known no-op (see trackCastCredit())
        castLevel:           2,  // per scroll level — mild preference for big scrolls

        // stone placement toward a pattern
        placeBase:          20,
        placeProgress:      45,  // × fraction of the variant complete AFTER this stone
        placeUnactivated:   25,  // building toward an unactivated element
        placeNoCredit:    -500,  // this scroll can never grant win credit again (element
                                 // already activated, or its source pool is empty) — hard
                                 // veto, same magnitude/philosophy as placeDoomed below,
                                 // so it reliably beats out move/endTurn regardless of
                                 // weight evolution drift (see hasWinCredit())
        placeDoomed:      -500,  // the stone would be destroyed on placement (non-fire/
                                 // non-void next to an unvoided fire) — pure stone waste
        placeVoidSpendPenalty: -8, // placing a void stone spends it out of the pool,
                                 // forfeiting its standing AP bonus (voidAP = pool.void
                                 // at turn start, game-core.js) — only bites in greedy/
                                 // Dumb-brain mode; under Hybrid/search this same
                                 // opportunity cost falls naturally out of evalVoidHeld
                                 // scoring the resulting simulated snapshot lower (see
                                 // evaluateSnapshot() below), so this is a redundant but
                                 // harmless mirror for the non-search fallback path.
        // ── Stage 4: elemental stone tactics (terrain control) ──
        // bot-state.js also enumerates TACTICAL (scroll:null) placeStone
        // candidates — earth/wind/fire on empty hexes adjacent to the pawn,
        // the same freedom a human's drag-drop has. They score
        // placeTacticalBase (slightly negative: never attractive on their
        // own) plus whichever terms below fire; the same terms ALSO apply
        // to pattern-dictated placements (the roadmap's "tie-break between
        // options already on the table"). All membership checks hit sets
        // cached ONCE per decision in tacticalContext() — never per search
        // leaf (the roadmap's scoped design: root-only heuristic).
        placeTacticalBase:   -4,
        placeEarthBlock:     45, // × opponents whose cached cheapest path to their
                                 // next objective (needed shrine, or home when all
                                 // 5 are activated) crosses this hex — earth blocks
                                 // movement outright (canPlayerMoveToHex)
        placeSelfBlockPenalty: -40, // earth on the bot's OWN objective path — don't
                                 // wall yourself in while building or blocking
        placeWindPath:       12, // wind on the bot's OWN objective path — moving
                                 // over wind is free (cost 0), so a corridor stone
                                 // dropped ahead pays back AP on every traversal;
                                 // low enough that a directly useful move/cast
                                 // still wins, high enough to beat a do-nothing
                                 // endTurn with leftover stones (the "pave the
                                 // road before ending the turn" behavior)
        placeFireThreatBreak: 70, // × opponent-threat stones this fire placement
                                 // destroys on landing (threat = a stone inside a
                                 // currently-satisfied pattern an opponent could
                                 // cast RIGHT NOW: common-area scrolls or their
                                 // public active area, anchored at their standing
                                 // position). Complements evalCommonThreat: that
                                 // term only sees common-area scrolls and only
                                 // under search — this one also covers opponents'
                                 // active scrolls and the greedy/Dumb brain.
        placeTacticalStarvesPlan: -500, // hard veto (same magnitude as placeNoCredit):
                                 // a tactical spend that would leave the pool short
                                 // of what the active build plan still needs of
                                 // that stone type

        planDeficitPenalty:  -3, // × total stones still missing from pool when makePlan()/
                                 // findFixationTarget() pick a COLLECT-THEN-BUILD plan (one
                                 // whose pattern isn't fully in-pool yet, but every missing
                                 // type has a shrine somewhere reachable — see
                                 // deficitIsCollectible()). Small discount, not a veto: a
                                 // plan that needs a detour to collect is slower/riskier
                                 // than one buildable right now, but still far better than
                                 // no plan at all (the entire point of collect-then-build).

        // movement
        moveBase:            2,
        moveShrineValue:    30,  // × (target shrine value ÷ (1 + remaining path cost))
        moveApPenalty:      -1,  // × step cost — cheap steps preferred
        moveExplore:        18,  // step lands on an unrevealed tile (reveals it — draws a scroll)
        moveExploreGradient: 0.15, // × px closed toward the nearest unrevealed tile (euclidean fallback)
        moveExplorePath:    60,  // ÷ (1 + remaining path cost) when the step is the first hop of the
                                 // actual cheapest PATH to a hidden tile. The euclidean gradient alone
                                 // freezes the bot in cul-de-sacs: every legal move increases
                                 // straight-line distance even when it's the only way out (observed:
                                 // 100% draws in 2-player arena games — both bots parked forever)
        moveRevisitPenalty: -60,  // ÷ steps-since-visited (see revisitPenalty()) — breaks
                                  // ties that would otherwise oscillate forever (e.g. two
                                  // hexes exactly equidistant from the only remaining
                                  // unrevealed tile have IDENTICAL scores with nothing
                                  // else to prefer one over the other); weighted by
                                  // recency so undoing your immediately previous move is
                                  // penalized far more than a revisit from several steps back
        moveFixation:      150,  // ÷ (1 + remaining path cost) when the step is the first hop
                                 // toward a findFixationTarget() hex — a REVEALED tile
                                 // elsewhere on the board where an uncast-element pattern is
                                 // buildable. Only computed when the turn-repeat circuit
                                 // breaker is armed (see turnRepeatStreak) — stronger than
                                 // moveExplorePath so it reliably wins over a stale local
                                 // loop, but still just one term in normal scoring (not a
                                 // scripted override): a genuinely better action found by the
                                 // same scoring pass — a cast, a richer shrine — can still win.

        // catacomb/Freedom teleport — free (0 AP) hop between revealed
        // catacomb-like shrine centres (see bot-state.js's legalActions()).
        teleportBase:        5,  // small flat nudge so an otherwise-neutral hop still
                                 // gets picked over doing nothing when nothing else applies —
                                 // it's free, so there's rarely a reason to decline one
        teleportShrineValue: 1.0, // × shrineValue(destination) when the destination is an
                                 // ELEMENTAL shrine (Freedom-only case — plain catacomb
                                 // destinations have no shrineValue). No path-cost division
                                 // like moveShrineValue gets — the hop is free, so the full
                                 // value applies, not a discounted one
        teleportRevisitPenalty: -60, // ÷ steps-since-visited (same recency decay as
                                 // moveRevisitPenalty) on the teleport DESTINATION. Teleports
                                 // are free, so with no memory of them a bot can ping-pong
                                 // between two catacomb shrines forever at zero cost — and
                                 // teleportBase is only +5, so even the decayed penalty makes
                                 // "hop straight back to where I just was" strongly negative
                                 // while a hop somewhere NEW keeps the full base nudge.
                                 // Both ends of an applied hop are recorded (see botAct) so
                                 // the immediate reversal always draws the k=1 penalty

        // breaking a stone (attemptBreakStone) — costs AP by stone rank
        // (void 1 .. earth 5). Mostly matters for clearing a path an earth
        // stone would otherwise block outright (canPlayerMoveToHex treats
        // earth as impassable without an adjacent void) — a bot with no
        // other legal move but plenty of AP should take this over stalling
        // on endTurn every turn.
        breakStoneBase:      3,
        breakStoneApPenalty: -1,  // × AP cost — cheap breaks (void, wind) preferred over earth

        // returning home — with all 5 elements activated the win now requires
        // standing on the centre of the bot's own player tile (player shrine),
        // so walking home dominates everything else once the set is complete
        moveReturnHome:    400,  // × 1/(1 + remaining path cost to own shrine)

        // ending the turn
        endTurnBase:         1,  // always a legal fallback, never attractive by itself
        endTurnOnShrine:    55,  // standing on a collectible shrine centre: end = collect
        endTurnLowAp:        6,  // + when AP ≤ 1 — nothing useful left to do

        // discarding — offered forced (hand/active overflow) or voluntarily
        // (cycle a jammed slot to the common area)
        discardBase:        10,
        discardActivated:   40,  // element already won — this copy has less value
        discardDeadElement: 30,  // source pool empty — no win credit ever again
        discardLevel:       -5,  // × scroll level — prefer to KEEP higher-level scrolls
        discardVoluntary:  -20,  // extra penalty when NOT forced by overflow — only a
                                 // clearly dead scroll (already-won/dead-source) is worth
                                 // giving up a slot for; note the discard lands in the
                                 // COMMON area where opponents can cast it too
        discardResponseOnly: 25, // level-1 scrolls are response-only and the bot can't
                                 // play responses yet (Stage 2.5) — dead weight in a
                                 // 2-slot hand, cycle it out

        // Stage 2.5: Transmute (Fire IV) target — discard stones for AP
        // until currentTotalAP reaches this (capped at the real max, 5 +
        // void pool), preferring the stone type held in greatest excess.
        transmuteTargetAP:   7,

        // placement phase: where to put the bot's starting player tile
        placeTileBase:            10,
        placeTileCentroidPenalty: -0.05, // × distance to cluster centroid — prefer compact placement

        // shrine valuation (used inside move/endTurn features)
        shrineNeed:          1.0, // × (capacity − pool[element])
        shrineUnactivated:   2.5, // element not yet activated
        shrineDeadSource:  -3.0,  // source pool empty — collection yields nothing
        shrineVoidBonus:     1.5, // × need, void shrines only — void pool stones also
                                  // grant standing AP (voidAP = pool.void each turn,
                                  // game-core.js), a benefit no other element's pool
                                  // gives, on top of the generic material value every
                                  // element already gets from shrineNeed/shrineUnactivated

        // ── Stage 2: lookahead search (BotSim forward model) ──
        // searchDepth 0 = greedy Stage-1 argmax (no BotSim needed);
        // searchDepth N ≥ 1 = depth-N beam search over own-turn actions,
        // leaves valued by evaluateSnapshot() below.
        // DEFAULT = HYBRID, per arena evidence (BotArena, 2×10 games, seeds
        // 11/23): Hybrid beat greedy 12-3 with 5 draws (80% of decided),
        // while FULL search (searchHybrid 0) LOST its series 1-3 — lookahead
        // helps at tactical decision points but its movement choices fight
        // the plan/path logic. Cheat-panel "Bot Brain" still overrides.
        searchDepth:         3,
        searchBreadth:       5,   // children expanded per node (beam width)
        searchHybrid:        1,   // 1 = only search when a tactical choice exists
                                  // (cast/placeStone among the legal actions);
                                  // plain movement stays greedy.

        // evaluateSnapshot() — STATE value, only used when searchDepth > 0.
        // Rough scale: one activated element (400) ≫ anything else per turn.
        evalWin:        100000,   // terminal win (loss = −evalWin)
        evalActivated:     400,   // per element in the activated set
        evalStoneNeeded:    12,   // per pool stone of an unactivated, live-source element
        evalStone:           3,   // per other pool stone
        evalScrollHeld:     30,   // per scroll in hand/active
        evalAp:              2,   // per remaining AP (own turn only)
        evalUnsimCast:      90,   // flat value per unsimulated cast in the sim trace —
                                  // the whitelist-gated stand-in for effects the
                                  // forward model honestly doesn't know (≈ castBase)
        evalHiddenDist:  -0.08,   // × px to nearest hidden tile (exploration shaping)
        evalHomeDist:     -0.6,   // × px to own shrine once all 5 elements are activated
        evalVoidHeld:        8,   // per void stone in pool, ON TOP of evalStoneNeeded/
                                  // evalStone above — void pool stones grant standing
                                  // AP (voidAP = pool.void each turn, game-core.js),
                                  // a persistent multi-turn benefit no other element's
                                  // pool has, regardless of whether void is activated
                                  // yet. Makes search naturally discount any simulated
                                  // action that spends void stones (BotSim.simulate()
                                  // decrements pool on placeStone) without needing a
                                  // dedicated per-action penalty.

        // Opponent-threat terms — this game has exactly one winner, so an
        // opponent's progress toward THEIR win is symmetric danger to us.
        // Deliberately scaled well below our OWN equivalent terms (0.3× and
        // 0.2× evalActivated respectively) — threat-AWARE, not
        // threat-obsessed; our own progress should still dominate. See
        // opponentProgress()/commonAreaThreat() below.
        evalOpponentThreat: 0.3,  // × the MOST-advanced opponent's own progress
                                  // score (mirrors evalActivated + evalHomeDist)
        evalCommonThreat:   80,   // flat, per live common-area scroll ANY opponent's
                                  // current board could cast right now — a "loaded
                                  // gun" distinct from their activated count, since
                                  // a scroll they haven't gotten to yet doesn't show
                                  // up there
    };

    // Evolved weights (Stage 3a) override defaults without code edits
    let WEIGHTS = { ...DEFAULT_WEIGHTS };
    try {
        const saved = JSON.parse(localStorage.getItem('godaigo_bot_weights') || 'null');
        if (saved && typeof saved === 'object') {
            WEIGHTS = { ...DEFAULT_WEIGHTS, ...saved };
            log('Loaded evolved weights from localStorage');
        }
    } catch (e) { /* corrupt save — keep defaults */ }

    // Bot Brain preference (cheat panel: click the HUD "AP" label 5×) —
    // applied LAST so it wins over both defaults and evolved/community
    // weights. Factored into a function so the async community-champion
    // fetch below can re-apply it after overwriting WEIGHTS — otherwise a
    // fetched table's own searchDepth/searchHybrid (always equal to
    // whatever the trainer's Bot Brain happened to be set to, per
    // mutate()/crossover() excluding those keys) could silently override
    // the LOCAL player's own Bot Brain choice.
    //   'dumb'   → greedy Stage-1 scoring (searchDepth 0)
    //   'smart'  → 3-ply lookahead on every action
    //   'hybrid' → lookahead only at tactical decision points
    function applyBrainPreference() {
        try {
            const brain = localStorage.getItem('godaigo_bot_brain');
            if (brain === 'smart')       { WEIGHTS.searchDepth = 3; WEIGHTS.searchHybrid = 0; }
            else if (brain === 'hybrid') { WEIGHTS.searchDepth = 3; WEIGHTS.searchHybrid = 1; }
            else if (brain === 'dumb')   { WEIGHTS.searchDepth = 0; WEIGHTS.searchHybrid = 0; }
            if (brain) log(`Bot brain: ${brain}`);
        } catch (e) { /* keep whatever the weights said */ }
    }
    applyBrainPreference();

    // Best-known community champion (Supabase `bot_champion_weights`):
    // async and non-blocking — bots can act immediately with whatever
    // loaded synchronously above; if/when this resolves, it overwrites
    // WEIGHTS in place with the highest win-rate submitted champion and
    // caches it to localStorage, so a later offline load still has it.
    // Deliberately "always prefer community" (explicit design choice, see
    // planning/current.md) — this can supersede a LOCAL Start Training
    // result the moment the fetch resolves, including on the very run that
    // just produced it (which is fine: that run's own submission is very
    // likely the new best, so this just reflects it back). Silent no-op on
    // any failure (offline, RLS hiccup, table not reachable) — never blocks
    // or errors the bot on account of a background fetch.
    (async function loadCommunityChampion() {
        try {
            // The initialized client lives in the bare global `supabase`
            // (config.js: `const supabase = window.supabase.createClient(...)`)
            // — a top-level const does NOT attach itself to `window`, so
            // `window.supabase` stays the raw createClient factory forever.
            if (typeof supabase === 'undefined' || !supabase?.from) return;
            const { data, error } = await supabase
                .from('bot_champion_weights')
                .select('weights')
                .order('win_rate', { ascending: false })
                .limit(1);
            if (error || !data?.length || !data[0].weights || typeof data[0].weights !== 'object') return;
            Object.assign(WEIGHTS, data[0].weights);
            applyBrainPreference();
            try { localStorage.setItem('godaigo_bot_weights', JSON.stringify(WEIGHTS)); } catch (e) {}
            log('Loaded best community champion from Supabase');
        } catch (e) { /* offline / RLS / network hiccup — keep whatever loaded synchronously */ }
    })();

    // ----------------------------------------------------------------
    // Derived state helpers (read ONLY from the snapshot — never from
    // game internals, and never from hidden information)
    // ----------------------------------------------------------------
    function me(snap) { return snap.players[snap.turn.activePlayerIndex]; }

    function scrollElement(name) {
        return window.SCROLL_DEFINITIONS?.[name]?.element || null;
    }

    // Worth of collecting at a shrine of this element right now
    function shrineValue(snap, element) {
        const self = me(snap);
        if (!self) return 0;
        const need = Math.max(0, POOL_CAP - (self.pool[element] || 0));
        if (need === 0) return 0;                       // pool already full
        let v = WEIGHTS.shrineNeed * need;
        if (!self.activated.includes(element)) v += WEIGHTS.shrineUnactivated * need;
        if ((snap.sourcePool[element] || 0) <= 0) v += WEIGHTS.shrineDeadSource * need;
        if (element === 'void') v += WEIGHTS.shrineVoidBonus * need;
        return Math.max(0, v);
    }

    // Collectible shrine tiles: revealed, elemental, worth something — and
    // with a stone-free centre hex. Collection = ENDING the turn on the
    // centre, and resting on a stone is banned (isPlayerRestingOnStone), so
    // a paved centre cannot be collected from at all until the stone is
    // broken. Without this exclusion a plan's collect leg walks onto the
    // stone (transit is legal) and then retries the banned endTurn forever
    // — observed wedging arena games once Stage-4 wind paving made
    // stones-on-centres common.
    function collectibleShrines(snap) {
        return snap.tiles.filter(t =>
            t.revealed && !t.isPlayerTile &&
            ELEMENTS.includes(t.shrineType) &&
            shrineValue(snap, t.shrineType) > 0 &&
            !snap.stones.some(s => Math.hypot(s.x - t.x, s.y - t.y) < 5));
    }

    function shrineUnderfoot(snap) {
        const self = me(snap);
        if (!self) return null;
        return collectibleShrines(snap).find(t => Math.hypot(t.x - self.x, t.y - self.y) < 5) || null;
    }

    // Would casting this scroll grant NEW win credit right now? Mirrors the
    // credit calc in makePlan() (catacomb credits each unactivated COMPONENT
    // element, no source-pool guard; a single-element scroll needs its
    // element unactivated AND its source pool non-empty). Used to VETO
    // placeStone actions that can never pay off — without this, piecemeal
    // placement (outside the anchored _plan system, which already skips
    // these via its own credit check) has no way to notice a pattern is
    // pointless and loops forever feeding it stones. Observed in a BotArena
    // game: 178 placeStone actions toward an already-won WIND_SCROLL_5 in a
    // single game, the exact same class of bug castAlreadyWon fixes for the
    // cast action — that fix just never covered placeStone.
    function hasWinCredit(snap, scrollName) {
        const self = me(snap);
        if (!self) return true;
        const el = scrollElement(scrollName);
        if (el === 'catacomb') {
            const def = window.SCROLL_DEFINITIONS?.[scrollName];
            const components = [...new Set((def?.patterns?.[0] || []).map(c => c.type))];
            return components.some(c => !self.activated.includes(c));
        }
        if (!el || !ELEMENTS.includes(el)) return true; // unknown/non-elemental — don't veto
        if (mem(snap.turn.activePlayerIndex).noCreditScrolls.has(scrollName)) return false;
        return !self.activated.includes(el) && (snap.sourcePool[el] || 0) > 0;
    }

    // Verify a cast actually earned win credit — some scrolls' special
    // effects can self-cancel on an unmet precondition (e.g. Sacrificial
    // Pyre needs scrolls in hand) without erroring, so applyAction() reports
    // success while self.activated never gains the element. The plan/scoring
    // credit model only checks activated+sourcePool (see hasWinCredit,
    // makePlan) so undetected this looks identical to "still worth casting"
    // and the bot recasts the same no-op forever. Observed in a BotArena
    // game: a player stuck at 0/5 elements for 200 turns, endlessly
    // recasting FIRE_SCROLL_3 (Sacrificial Pyre) with an empty hand.
    // preSnap must be taken BEFORE the cast so "expected" reflects what the
    // scroll could still credit; called right after a successful cast apply.
    function trackCastCredit(idx, preSnap, scrollName) {
        const preSelf = me(preSnap);
        if (!preSelf) return;
        const def = window.SCROLL_DEFINITIONS?.[scrollName];
        const el = def?.element;
        const expected = el === 'catacomb'
            ? [...new Set((def.patterns?.[0] || []).map(c => c.type))].filter(c => !preSelf.activated.includes(c))
            : (el && ELEMENTS.includes(el) && !preSelf.activated.includes(el)) ? [el] : [];
        if (!expected.length) return; // no credit was possible anyway — nothing to learn
        const postSelf = me(window.BotState.snapshot());
        if (!postSelf) return;
        if (!expected.some(e => postSelf.activated.includes(e))) {
            mem(idx).noCreditScrolls.add(scrollName);
            log(`Cast ${scrollName} granted no win credit (effect cancelled?) — blacklisting for this game`);
        }
    }

    // ----------------------------------------------------------------
    // Stage 4 — elemental stone tactics (terrain control).
    // tacticalContext() is built ONCE per real decision (rankActions /
    // searchPick root) and NEVER per search leaf — the roadmap's scoped
    // design: leaf call volume can't afford per-opponent Dijkstra, and a
    // root tie-break doesn't pretend to model how an opponent reroutes
    // around a wall afterwards. Returns:
    //   oppPathCount: Map<hexKey, n> — how many opponents' cheapest paths
    //     to their next objective cross this hex (earth-block targeting)
    //   ownPathHexes: Set<hexKey> — the bot's own objective paths (wind
    //     corridor value; earth self-block penalty)
    //   threatStones: Set<hexKey> — stones inside a currently-satisfied
    //     pattern an opponent could cast right now (fire-interference).
    //     Only PUBLIC information: common-area scrolls + opponents' active
    //     areas — hand scroll names are hidden by design and stay that way.
    // Documented approximation: findPath's step costs come from
    // canPlayerMoveToHex, which evaluates blocking (opponent tile centres,
    // pawn occupancy) from the ACTIVE player's perspective — an opponent's
    // modelled path can differ slightly from the one they'd really take.
    // ----------------------------------------------------------------
    const hexKey = (x, y) => `${x.toFixed(1)},${y.toFixed(1)}`;

    // Cheapest path to (tx,ty), or — when the target hex itself is
    // unreachable for the active player (an opponent's home centre is
    // blocked by isOpponentTileCenter) — to the cheapest reachable hex
    // adjacent to it. For blocking purposes the approach corridor is what
    // matters, and stones can't land on a player tile anyway.
    function pathToOrNear(sx, sy, tx, ty) {
        const direct = window.BotState.findPath(sx, sy, tx, ty);
        if (direct && direct.length) return direct;
        let best = null;
        for (const h of window.BotState.hexGrid()) {
            const d = Math.hypot(h.x - tx, h.y - ty);
            if (d <= 5 || d >= 40) continue;
            const p = window.BotState.findPath(sx, sy, h.x, h.y);
            if (!p || !p.length) continue;
            const cost = p.reduce((c, s) => c + s.cost, 0);
            if (!best || cost < best.cost) best = { p, cost };
        }
        return best ? best.p : null;
    }

    function tacticalContext(snap) {
        const ai = snap.turn.activePlayerIndex;
        const self = me(snap);
        if (!self) return null;

        // Each opponent's cheapest path to their next objective: the
        // nearest shrine of an element they still need (unactivated, live
        // source, room in their pool — all public), or their home tile once
        // all 5 are activated (mirrors opponentProgress()'s model).
        const oppPathCount = new Map();
        for (const opp of snap.players) {
            if (!opp || opp.index === ai) continue;
            let target = null;
            if (ELEMENTS.every(el => opp.activated.includes(el))) {
                target = snap.tiles.find(t => t.isPlayerTile && t.playerIndex === opp.index) || null;
            } else {
                let best = null;
                for (const t of snap.tiles) {
                    if (!t.revealed || t.isPlayerTile) continue;
                    if (!ELEMENTS.includes(t.shrineType)) continue;         // masked/catacomb — skip
                    if (opp.activated.includes(t.shrineType)) continue;
                    if ((snap.sourcePool[t.shrineType] || 0) <= 0) continue;
                    if ((opp.pool[t.shrineType] || 0) >= POOL_CAP) continue;
                    const d = Math.hypot(t.x - opp.x, t.y - opp.y);
                    if (!best || d < best.d) best = { t, d };
                }
                target = best ? best.t : null;
            }
            if (!target) continue;
            const path = pathToOrNear(opp.x, opp.y, target.x, target.y);
            if (!path) continue;
            const seenHexes = new Set();
            for (const step of path) {
                const k = hexKey(step.x, step.y);
                if (seenHexes.has(k)) continue;
                seenHexes.add(k);
                oppPathCount.set(k, (oppPathCount.get(k) || 0) + 1);
            }
        }

        // The bot's OWN objective paths: home once all 5 are activated;
        // otherwise the best-value collectible shrine (same worth-÷-cost
        // shape move scoring uses) plus the nearest hidden-tile route.
        const ownPathHexes = new Set();
        // Never include a revealed TILE CENTRE hex: those are hexes the bot
        // must eventually REST on (shrine collection, catacomb teleports,
        // the home win condition) and resting on a stone is banned — paving
        // one sabotages the very objective the path leads to (observed: a
        // wind stone on the target shrine's centre wedged the collect loop).
        // Corridor hexes are where wind pays; destinations never are.
        const isTileCentre = (x, y) => snap.tiles.some(t =>
            t.revealed && Math.hypot(t.x - x, t.y - y) < 5);
        const addPath = (path) => {
            if (!path) return;
            for (const s of path) {
                if (isTileCentre(s.x, s.y)) continue;
                ownPathHexes.add(hexKey(s.x, s.y));
            }
        };
        if (ELEMENTS.every(el => self.activated.includes(el))) {
            const home = snap.tiles.find(t => t.isPlayerTile && t.playerIndex === ai);
            if (home) addPath(pathToOrNear(self.x, self.y, home.x, home.y));
        } else {
            let best = null;
            for (const t of collectibleShrines(snap)) {
                const path = window.BotState.findPath(self.x, self.y, t.x, t.y);
                if (!path || !path.length) continue;
                const cost = path.reduce((c, s) => c + s.cost, 0);
                const v = shrineValue(snap, t.shrineType) / (1 + cost);
                if (!best || v > best.v) best = { v, path };
            }
            if (best) addPath(best.path);
            // Nearest hidden-tile ring hex (their outer rings are walkable —
            // same targeting rankActions' explorePath uses)
            const rings = window.BotState.hexGrid()
                .filter(h => h.tiles?.some(t => t.flipped && !t.isPlayerTile))
                .sort((a, b) => Math.hypot(a.x - self.x, a.y - self.y) - Math.hypot(b.x - self.x, b.y - self.y));
            for (const h of rings.slice(0, 3)) {
                const path = window.BotState.findPath(self.x, self.y, h.x, h.y);
                if (path && path.length) { addPath(path); break; }
            }
        }

        // Opponent "loaded guns": every stone participating in a pattern
        // variant an opponent could cast right now, anchored at their
        // current position (patterns are relative to the caster's hex).
        // Mirrors BotSim.checkPattern()'s math, but keeps the matched cells
        // instead of collapsing to a boolean.
        const threatStones = new Set();
        for (const opp of snap.players) {
            if (!opp || opp.index === ai) continue;
            const castable = new Set([...(opp.active || []), ...(snap.commonArea || [])]);
            for (const name of castable) {
                const def = window.SCROLL_DEFINITIONS?.[name];
                if (!def || def.level === 1 || !Array.isArray(def.patterns)) continue;
                for (const variant of def.patterns) {
                    const matched = [];
                    let ok = true;
                    for (const req of variant) {
                        const off = hexToPixel(req.q, req.r, TILE_SIZE);
                        const s = snap.stones.find(st =>
                            st.type === req.type &&
                            Math.hypot(st.x - (opp.x + off.x), st.y - (opp.y + off.y)) < 5);
                        if (!s) { ok = false; break; }
                        matched.push(s);
                    }
                    if (ok) for (const s of matched) threatStones.add(hexKey(s.x, s.y));
                }
            }
        }

        return { oppPathCount, ownPathHexes, threatStones };
    }

    // Tactical value of a placeStone — pattern-dictated OR tactical
    // (scroll:null) alike. Root-only, both brains: greedy scoreAction()
    // reads it via ctx.tac; searchPick() adds it to its root scores the
    // same way it folds in revisitPenalty.
    function tacticalPlaceBonus(a, snap, tac) {
        if (!tac || a.type !== 'placeStone') return 0;
        let b = 0;
        const k = hexKey(a.x, a.y);
        if (a.stoneType === 'earth') {
            const blocked = tac.oppPathCount.get(k) || 0;
            if (blocked) b += WEIGHTS.placeEarthBlock * blocked;
            if (tac.ownPathHexes.has(k)) b += WEIGHTS.placeSelfBlockPenalty;
        } else if (a.stoneType === 'wind') {
            if (tac.ownPathHexes.has(k)) b += WEIGHTS.placeWindPath;
        } else if (a.stoneType === 'fire') {
            // Mirrors BotSim's applyFireInteractions(): a placed fire only
            // burns when IT has no adjacent void; victims are adjacent
            // non-fire/non-void stones (5..50px stone-neighbor window).
            const guarded = snap.stones.some(s => {
                if (s.type !== 'void') return false;
                const d = Math.hypot(s.x - a.x, s.y - a.y);
                return d > 5 && d < 50;
            });
            if (!guarded) {
                for (const s of snap.stones) {
                    if (s.type === 'fire' || s.type === 'void') continue;
                    const d = Math.hypot(s.x - a.x, s.y - a.y);
                    if (d <= 5 || d >= 50) continue;
                    if (tac.threatStones.has(hexKey(s.x, s.y))) b += WEIGHTS.placeFireThreatBreak;
                }
            }
        }
        // Never spend a stone the active build plan still needs of this
        // type — a wall/corridor isn't worth stalling the win-credit plan.
        if (a.tactical) {
            const plan = mem(snap.turn.activePlayerIndex).plan;
            const self = me(snap);
            if (plan && self) {
                const stillNeeded = plan.cells.filter(c => c.type === a.stoneType &&
                    !snap.stones.some(st => st.type === c.type && Math.hypot(st.x - c.x, st.y - c.y) < 5)).length;
                if (stillNeeded > 0 && ((self.pool[a.stoneType] || 0) - 1) < stillNeeded) {
                    b += WEIGHTS.placeTacticalStarvesPlan;
                }
            }
        }
        return b;
    }

    // ----------------------------------------------------------------
    // scoreAction — the Stage-1 utility function. Tune WEIGHTS, not this.
    // ----------------------------------------------------------------
    function scoreAction(a, snap, ctx) {
        const self = me(snap);
        switch (a.type) {

            case 'placeTile': {
                return WEIGHTS.placeTileBase + WEIGHTS.placeTileCentroidPenalty * (a.distToCentroid || 0);
            }

            case 'cast': {
                const el = scrollElement(a.scroll);
                const def = window.SCROLL_DEFINITIONS?.[a.scroll];
                let s = WEIGHTS.castBase + WEIGHTS.castLevel * (def?.level || 0);
                if (mem(snap.turn.activePlayerIndex).noCreditScrolls.has(a.scroll)) {
                    s += WEIGHTS.castNoCredit; // effect cancelled before — hard veto, don't recast
                } else if (el && ELEMENTS.includes(el)) {
                    const dead = (snap.sourcePool[el] || 0) <= 0;
                    if (self.activated.includes(el)) s += WEIGHTS.castAlreadyWon; // no more win credit here
                    else if (dead) s += WEIGHTS.castDeadElement;                  // no win credit
                    else s += WEIGHTS.castUnactivated;
                }
                return s;
            }

            case 'placeStone': {
                let s;
                if (a.scroll) {
                    s = WEIGHTS.placeBase + WEIGHTS.placeProgress * (a.progress || 0);
                    s += hasWinCredit(snap, a.scroll) ? WEIGHTS.placeUnactivated : WEIGHTS.placeNoCredit;
                } else {
                    // Tactical placement (Stage 4, scroll:null — see
                    // bot-state.js): no pattern value at all; only worth
                    // taking when a tacticalPlaceBonus() term fires.
                    s = WEIGHTS.placeTacticalBase;
                }
                // The bot KNOWS the fire rule — don't pay stones to relearn it
                if (window.BotSim && !window.BotSim.stoneWouldSurvive(snap, a.x, a.y, a.stoneType)) {
                    s += WEIGHTS.placeDoomed;
                }
                if (a.stoneType === 'void') s += WEIGHTS.placeVoidSpendPenalty;
                s += tacticalPlaceBonus(a, snap, ctx.tac);
                return s;
            }

            case 'move': {
                // Value = best shrine reachable via this step: worth ÷ remaining cost.
                // ctx.paths caches Dijkstra results per target for this decision.
                let best = 0;
                for (const t of ctx.shrines) {
                    const path = ctx.paths.get(t.id);
                    if (!path || !path.length) continue;
                    const first = path[0];
                    if (Math.hypot(first.x - a.x, first.y - a.y) >= 5) continue; // step isn't on this path
                    const remaining = path.reduce((c, p) => c + p.cost, 0);
                    const v = shrineValue(snap, t.shrineType) / (1 + remaining);
                    if (v > best) best = v;
                }
                // Exploration: landing on an unrevealed tile flips it (scroll draw!).
                // Primary signal is the real cheapest PATH to a hidden tile
                // (ctx.explorePath) — the euclidean gradient is only a fallback,
                // because it freezes the bot whenever escaping a cul-de-sac
                // requires temporarily increasing straight-line distance.
                let explore = 0;
                if (ctx.hiddenTiles.length) {
                    const onHidden = ctx.hiddenTiles.some(t => Math.hypot(t.x - a.x, t.y - a.y) < 70);
                    if (onHidden) explore += WEIGHTS.moveExplore;
                    if (ctx.explorePath && ctx.explorePath.length) {
                        const first = ctx.explorePath[0];
                        if (Math.hypot(first.x - a.x, first.y - a.y) < 5) {
                            const remaining = ctx.explorePath.reduce((c, p) => c + p.cost, 0);
                            explore += WEIGHTS.moveExplorePath / (1 + remaining);
                        }
                    } else if (!onHidden) {
                        const distFrom = p => Math.min(...ctx.hiddenTiles.map(t => Math.hypot(t.x - p.x, t.y - p.y)));
                        explore += WEIGHTS.moveExploreGradient * (distFrom(self) - distFrom(a));
                    }
                }
                // Going home: all 5 elements activated → the only thing that
                // still wins is standing on the bot's own shrine centre.
                let home = 0;
                if (ctx.homePath && ctx.homePath.length) {
                    const first = ctx.homePath[0];
                    if (Math.hypot(first.x - a.x, first.y - a.y) < 5) {
                        const remaining = ctx.homePath.reduce((c, p) => c + p.cost, 0);
                        home = WEIGHTS.moveReturnHome / (1 + remaining);
                    }
                }
                // Fixation: only set (see findFixationTarget()) when the
                // turn-repeat circuit breaker is armed — pulls toward a
                // REVEALED hex elsewhere on the board that still has an
                // uncast-element pattern buildable, instead of just
                // suppressing movement on a stuck turn.
                let fixation = 0;
                if (ctx.fixationPath && ctx.fixationPath.length) {
                    const first = ctx.fixationPath[0];
                    if (Math.hypot(first.x - a.x, first.y - a.y) < 5) {
                        const remaining = ctx.fixationPath.reduce((c, p) => c + p.cost, 0);
                        fixation = WEIGHTS.moveFixation / (1 + remaining);
                    }
                }
                const revisit = revisitPenalty(ctx.recentPositions || [], a, WEIGHTS.moveRevisitPenalty);
                return WEIGHTS.moveBase + WEIGHTS.moveShrineValue * best
                     + WEIGHTS.moveApPenalty * a.cost + explore + revisit + home + fixation;
            }

            case 'teleport': {
                let s = WEIGHTS.teleportBase;
                if (ELEMENTS.includes(a.shrineType)) {
                    s += WEIGHTS.teleportShrineValue * shrineValue(snap, a.shrineType);
                }
                // Same anti-oscillation memory movement uses — without it,
                // free hops between two catacombs ping-pong forever.
                s += revisitPenalty(ctx.recentPositions || [], a, WEIGHTS.teleportRevisitPenalty);
                return s;
            }

            case 'breakStone': {
                return WEIGHTS.breakStoneBase + WEIGHTS.breakStoneApPenalty * a.cost;
            }

            case 'endTurn': {
                let s = WEIGHTS.endTurnBase;
                if (ctx.onShrine) {
                    s += WEIGHTS.endTurnOnShrine
                       + shrineValue(snap, ctx.onShrine.shrineType);
                }
                if (snap.turn.ap <= 1) s += WEIGHTS.endTurnLowAp;
                return s;
            }

            case 'discardScroll': {
                const el = scrollElement(a.scroll);
                const def = window.SCROLL_DEFINITIONS?.[a.scroll];
                let s = WEIGHTS.discardBase + WEIGHTS.discardLevel * (def?.level || 0);
                if (a.voluntary) s += WEIGHTS.discardVoluntary;
                if (def?.level === 1) s += WEIGHTS.discardResponseOnly;
                if (el && ELEMENTS.includes(el)) {
                    if (self.activated.includes(el)) s += WEIGHTS.discardActivated;
                    if ((snap.sourcePool[el] || 0) <= 0) s += WEIGHTS.discardDeadElement;
                }
                // Never discard the scroll the current build plan needs
                const activePlan = mem(snap.turn.activePlayerIndex).plan;
                if (activePlan && a.scroll === activePlan.scroll) s -= 1000;
                return s;
            }

            default: return -Infinity;
        }
    }

    // ----------------------------------------------------------------
    // Per-bot memory, keyed by player index.
    //
    // Why keyed at all: bot-arena.js's local hot-seat and spectate matches
    // drive MULTIPLE bot players through this SAME module instance, one
    // turn at a time, alternating. Every piece of state below used to be a
    // single shared module-level variable — so Player A's plan, recent
    // positions, and cursed-cell blacklist silently bled into Player B's
    // decisions the moment turns alternated, and vice versa. Found via a
    // real bot-vs-bot game log: an identical 6-hex movement cycle repeated
    // turn after turn forever, immune to the anti-oscillation fix below —
    // traced to _recentPositions being one ring buffer BOTH bots wrote
    // into, so a player's own "don't reverse your last move" signal was
    // getting overwritten by the OTHER player's positions every time turns
    // switched, corrupting the tie-breaker into noise. bot-driver.js (real
    // multiplayer) only ever drives one bot identity per browser tab, so
    // this bug never surfaced there — only in same-page multi-bot modes.
    // ----------------------------------------------------------------
    const _mem = {};
    function mem(idx) {
        if (!_mem[idx]) {
            _mem[idx] = {
                plan: null,             // { scroll, anchor:{q,r}, cells:[{q,r,x,y,type}] }
                recentPositions: [],    // ring buffer of {x,y}, oldest first
                cellFailCount: new Map(),
                cursedCells: new Set(),
                lastTurnMoveKey: null,
                turnRepeatStreak: 0,
                unproductiveStreak: 0,  // consecutive own turns with no cast/placeStone — see botTurn()
                noCreditScrolls: new Set(), // scrolls whose special effect cancelled without granting win credit — see trackCastCredit()
            };
        }
        return _mem[idx];
    }
    function resetAllMemory() {
        for (const k of Object.keys(_mem)) delete _mem[k];
    }

    // Recent-move history — anti-oscillation tie-breaker. Two hexes can be
    // EXACTLY equidistant from the only reachable unrevealed tile (or shrine),
    // giving move-there and move-back identical scores with nothing else to
    // prefer one over the other; without this the bot alternates between them
    // forever, even across turn boundaries. Persists across turns deliberately
    // (that's exactly where the oscillation was observed in practice).
    //
    // v1 used a flat penalty for "anywhere in the last N positions," which
    // fails for a clean 2-hex cycle: once both A and B are simultaneously
    // inside the window, EVERY candidate move gets the same penalty, so the
    // tie comes right back and the bot still oscillates (observed: 5 A<->B
    // round-trips burning a whole turn's AP). Fixed by weighting the penalty
    // by recency instead of applying it flat — "undo the move I just made"
    // (1 step ago) is penalized far more than "revisit somewhere from 3+
    // steps ago," so a 2-cycle can no longer look equally bad in both
    // directions and the tie actually breaks.
    // Monotonic count of successfully APPLIED main-phase casts, any player.
    // Never reset — consumers (bot-arena.js's no-cast stall cap) read deltas,
    // so a fresh game just remembers its own starting value.
    let _castsApplied = 0;

    const RECENT_POS_LIMIT = 6;
    function recordVisited(idx, x, y) {
        const rp = mem(idx).recentPositions;
        rp.push({ x, y });
        if (rp.length > RECENT_POS_LIMIT) rp.shift();
    }

    // Whole-turn repeat detector — a second, coarser safety net above.
    // recentPositions/revisitPenalty only ever break a clean 2-hex tie; a
    // larger stable N-hex cycle (N <= RECENT_POS_LIMIT) can rotate in
    // lockstep with the recency-decay penalty and never actually create the
    // asymmetry needed to escape. botTurn() records each turn's move
    // sequence and compares it to that SAME PLAYER's previous turn; botAct()
    // consults turnRepeatStreak to short-circuit movement for one turn once
    // a repeat is detected — see both sites.
    // Recency-weighted revisit penalty for a candidate move target `a`.
    // k=1 means "this is exactly where I was one move ago" (an immediate
    // reversal); k=2 means two moves ago, etc. — penalty decays as 1/k.
    function revisitPenalty(recent, a, weight) {
        for (let k = 1; k < recent.length; k++) {
            const p = recent[recent.length - 1 - k]; // skip the last entry (current position)
            if (Math.hypot(p.x - a.x, p.y - a.y) < 5) return weight / k;
        }
        return 0;
    }

    // Some cells never accept a stone no matter how many times we place one —
    // e.g. an adjacent active fire stone destroys whatever non-fire/non-void
    // stone lands next to it (game-core.js processStoneInteractions). The bot
    // doesn't model that rule directly (DO-NOT: no game-rules duplication in
    // bot.js) — instead it notices the cell stays empty after repeated
    // attempts and blacklists it, both for the current plan and future ones.
    // Without this the bot loops forever: place → destroyed → still missing →
    // place again, burning its whole pool and every turn's AP for zero progress.
    const cellKey = c => `${c.x.toFixed(1)},${c.y.toFixed(1)},${c.type}`;
    const CELL_FAIL_LIMIT = 2;
    // How many consecutive own turns with no cast/placeStone before botAct()
    // tries findFixationTarget() unconditionally (not just on an exact move
    // repeat) — see unproductiveStreak in mem()/botTurn().
    const UNPRODUCTIVE_LIMIT = 3;

    // Scrolls worth planning around right now: hand + ACTIVE AREA + COMMON
    // AREA (hand-only planning dead-ends games — a catacomb scroll parked in
    // the active area, or an opponent's discard in the common area, is often
    // the ONLY remaining source of an unactivated element), each paired with
    // the win credit casting it would actually grant. Zero credit ⇒ excluded
    // — an already-won scroll with its pattern still on the board would
    // otherwise become an infinite recast loop (the plan-level twin of the
    // castAlreadyWon bug). Catacomb scrolls credit each unactivated
    // COMPONENT element (no source-pool guard, matching applyScrollEffects).
    // Shared by makePlan() (anchored at the bot's current hex) and
    // findFixationTarget() (anchored at candidate hexes elsewhere).
    function creditableSources(snap, self, noCreditScrolls) {
        const sources = new Set([...self.hand, ...self.active, ...(snap.commonArea || [])]);
        const out = [];
        for (const name of sources) {
            if (noCreditScrolls.has(name)) continue; // cast before, effect cancelled — don't replan it
            const def = window.SCROLL_DEFINITIONS?.[name];
            if (!def || def.level === 1 || !Array.isArray(def.patterns)) continue;
            const el = def.element;
            let credit = 0;
            if (el === 'catacomb') {
                for (const c of new Set((def.patterns[0] || []).map(cell => cell.type))) {
                    if (!self.activated.includes(c)) credit++;
                }
            } else if (!self.activated.includes(el) && (snap.sourcePool[el] || 0) > 0) {
                credit = 1;
            }
            if (credit > 0) out.push({ name, def, credit });
        }
        return out;
    }

    // Is `variant` (one pattern shape from a scroll's def.patterns) buildable
    // anchored at `anchorHex`? Cells on face-down tiles or any player tile
    // (incl. bridge hexes) are illegal to place on, and a non-fire/non-void
    // stone next to an unvoided fire dies on placement — don't plan shapes
    // that can't exist. Returns null if not viable at all; otherwise
    // {cells, placed, deficit} — placed = how many cells already hold the
    // right stone, deficit = {type: shortfall} for any type the pool
    // doesn't yet cover (empty object when the shape is buildable RIGHT
    // NOW). Callers decide what a non-empty deficit means: makePlan() and
    // findFixationTarget() only accept it as a collect-then-build plan when
    // every short type has a shrine to collect it from somewhere on the
    // board (see collectibleShrines() below) — otherwise it's just a shape
    // that will never be finishable, not a real plan. Shared by makePlan()
    // and findFixationTarget() — the only difference between them is which
    // hex `anchorHex` is.
    function viablePatternAt(snap, self, variant, anchorHex, grid, cursedCells) {
        const cells = variant.map(req => {
            const px = hexToPixel(anchorHex.q + req.q, anchorHex.r + req.r, TILE_SIZE);
            return { q: anchorHex.q + req.q, r: anchorHex.r + req.r, x: px.x, y: px.y, type: req.type };
        });
        if (!cells.every(c => grid.some(h => Math.hypot(h.x - c.x, h.y - c.y) < 5))) return null;
        if (cells.some(c => cursedCells.has(cellKey(c)))) return null; // known-doomed cell — skip this variant
        if (typeof isPositionOnFlippedTile === 'function' &&
            cells.some(c => isPositionOnFlippedTile(c.x, c.y, grid))) return null;
        if (typeof isPositionOnPlayerTile === 'function' &&
            cells.some(c => isPositionOnPlayerTile(c.x, c.y, grid))) return null;
        if (window.BotSim &&
            cells.some(c => !window.BotSim.stoneWouldSurvive(snap, c.x, c.y, c.type))) return null;
        let placed = 0, blocked = false;
        const need = {};
        for (const c of cells) {
            const s = placedStones.find(st => Math.hypot(st.x - c.x, st.y - c.y) < 5);
            if (s && s.type === c.type) placed++;
            else if (s) { blocked = true; break; }
            else need[c.type] = (need[c.type] || 0) + 1;
        }
        if (blocked) return null;
        const deficit = {};
        for (const [t, n] of Object.entries(need)) {
            const short = n - (self.pool[t] || 0);
            if (short > 0) deficit[t] = short;
        }
        return { cells, placed, deficit };
    }

    // Every deficit type must have a shrine somewhere on the revealed board
    // (collectibleShrines() — value>0 already factors in pool room/dead
    // source), or this is a shape that can never be finished, not a real
    // collect-then-build plan.
    function deficitIsCollectible(deficit, collectible) {
        return Object.keys(deficit).every(t => collectible.some(s => s.shrineType === t));
    }

    function makePlan(snap) {
        const self = me(snap);
        if (!self || !self.hand) return null;
        const { cursedCells, noCreditScrolls } = mem(snap.turn.activePlayerIndex);
        // All 5 elements activated — no cast adds win credit anymore; don't
        // start new builds, let move-scoring's homePath term walk the bot home
        if (ELEMENTS.every(el => self.activated.includes(el))) return null;
        const pHex = pixelToHex(self.x, self.y, TILE_SIZE);
        const grid = window.BotState.hexGrid();
        const collectible = collectibleShrines(snap);
        let best = null;
        for (const { name, def, credit } of creditableSources(snap, self, noCreditScrolls)) {
            for (const variant of def.patterns) {
                const v = viablePatternAt(snap, self, variant, pHex, grid, cursedCells);
                if (!v) continue;
                const totalDeficit = Object.values(v.deficit).reduce((a, b) => a + b, 0);
                // Missing stone types are fine — planNextAction() routes
                // through a collect leg (see stepTowardCollect()) — as long
                // as every missing type is actually obtainable somewhere on
                // the revealed board. Otherwise this shape can never finish;
                // it's not a real plan, just a dream.
                if (totalDeficit && !deficitIsCollectible(v.deficit, collectible)) continue;
                // catacombs can be worth 2 elements; a plan that still needs
                // collecting is discounted (slower, riskier) but still far
                // better than no plan at all — WEIGHTS.planDeficitPenalty is
                // negative, same sign convention as moveApPenalty etc.
                const score = v.placed * 10 + credit * 20 + WEIGHTS.planDeficitPenalty * totalDeficit;
                if (!best || score > best.score) best = { score, scroll: name, anchor: pHex, cells: v.cells };
            }
        }
        return best ? { scroll: best.scroll, anchor: best.anchor, cells: best.cells } : null;
    }

    // ----------------------------------------------------------------
    // Fixation target: when the turn-repeat circuit breaker fires (a stable
    // N-hex movement loop was detected — see turnRepeatStreak below), look
    // for a REVEALED hex ANYWHERE ELSE on the board where an uncast-element
    // pattern is buildable, and hand back its position. Deliberately NOT
    // anchored at the bot's current position like makePlan() — if the
    // current position had a viable pattern, makePlan() would already have
    // found it and the circuit breaker would never run (planAction takes
    // priority in botAct()). The point is finding an objective the bot's
    // purely-local plan search never considers.
    //
    // Only ever consulted by scoreAction() through ctx.fixationPath (a real
    // path, set in rankActions() only when turnRepeatStreak >= 1) via a
    // strong WEIGHTS.moveFixation term — NOT a scripted forced move. A
    // genuinely better action the same scoring pass finds (a cast, a
    // richer shrine) can still outscore walking there.
    // ----------------------------------------------------------------
    function findFixationTarget(snap) {
        const self = me(snap);
        if (!self || !self.hand) return null;
        const { cursedCells, noCreditScrolls } = mem(snap.turn.activePlayerIndex);
        if (ELEMENTS.every(el => self.activated.includes(el))) return null; // homePath covers this
        const grid = window.BotState.hexGrid();
        const sources = creditableSources(snap, self, noCreditScrolls);
        if (!sources.length) return null;
        const collectible = collectibleShrines(snap);

        let best = null;
        for (const h of grid) {
            // Only revealed ground, never a player tile (own or opponent's)
            if (typeof isPositionOnFlippedTile === 'function' && isPositionOnFlippedTile(h.x, h.y, grid)) continue;
            if (typeof isPositionOnPlayerTile === 'function' && isPositionOnPlayerTile(h.x, h.y, grid)) continue;
            const anchor = pixelToHex(h.x, h.y, TILE_SIZE);
            for (const { name, def, credit } of sources) {
                for (const variant of def.patterns) {
                    const v = viablePatternAt(snap, self, variant, anchor, grid, cursedCells);
                    if (!v) continue;
                    const totalDeficit = Object.values(v.deficit).reduce((a, b) => a + b, 0);
                    if (totalDeficit && !deficitIsCollectible(v.deficit, collectible)) continue;
                    const dist = Math.hypot(h.x - self.x, h.y - self.y);
                    // Same value shape as makePlan()'s score, lightly
                    // tie-broken toward the nearest viable option — the goal
                    // is escaping the local trap quickly, not finding the
                    // single best pattern on the whole board.
                    const score = v.placed * 10 + credit * 20 + WEIGHTS.planDeficitPenalty * totalDeficit - dist * 0.02;
                    if (!best || score > best.score) best = { score, x: h.x, y: h.y, scroll: name };
                }
            }
        }
        return best;
    }

    function planValid(snap) {
        const plan = mem(snap.turn.activePlayerIndex).plan;
        if (!plan) return false;
        const self = me(snap);
        if (!self) return false;
        const holding = (self.hand || []).includes(plan.scroll) || self.active.includes(plan.scroll) ||
                        (snap.commonArea || []).includes(plan.scroll); // common-area scrolls are castable too
        if (!holding) return false;
        // Cells were on the board when the plan was MADE (viablePatternAt
        // checks the grid) — but Telekinesis / Shifting Sands can move the
        // tile out from under an in-flight plan, leaving its cells floating
        // over empty space. Re-check every turn so the plan dies and the bot
        // replans, instead of trying to build a pattern in the void.
        const grid = window.BotState.hexGrid();
        for (const c of plan.cells) {
            if (!grid.some(h => Math.hypot(h.x - c.x, h.y - c.y) < 5)) return false;
        }
        for (const c of plan.cells) {
            const s = placedStones.find(st => Math.hypot(st.x - c.x, st.y - c.y) < 5);
            if (s && s.type !== c.type) return false;                       // cell corrupted
            // NOTE: deliberately no "pool[c.type] > 0" check here — a plan
            // may legitimately still be in its COLLECT leg for this cell's
            // type (see makePlan()'s deficit handling and
            // planNextAction()'s stepTowardCollect()). Rejecting a plan for
            // not yet having every stone in hand would defeat the entire
            // point of collect-then-build.
            // A fire stone may have appeared next to a still-missing cell
            // since the plan was made — the stone would die on placement
            if (!s && window.BotSim &&
                !window.BotSim.stoneWouldSurvive(snap, c.x, c.y, c.type)) return false;
        }
        return true;
    }

    // One walkable step toward any hex adjacent to `cell` (avoiding standing
    // on cells the plan still needs to fill). Returns a move action or null.
    function stepTowardCell(self, cell, missing, ap) {
        const grid = window.BotState.hexGrid();
        let bestPath = null;
        for (const h of grid) {
            const d = Math.hypot(h.x - cell.x, h.y - cell.y);
            if (d <= 5 || d >= 40) continue;                                 // must be adjacent to the cell
            if (missing.some(m => Math.hypot(m.x - h.x, m.y - h.y) < 5)) continue; // don't stand on an unfilled cell
            // Rule: placement requires the pawn on an UNOCCUPIED hex — don't
            // walk onto a stone to place from there, it would be blocked
            if (placedStones.some(s => Math.hypot(s.x - h.x, s.y - h.y) < 5)) continue;
            const path = window.BotState.findPath(self.x, self.y, h.x, h.y);
            if (!path || !path.length) continue;
            const cost = path.reduce((c, p) => c + p.cost, 0);
            if (!bestPath || cost < bestPath.cost) bestPath = { cost, step: path[0] };
        }
        if (bestPath && bestPath.step.cost <= ap) {
            return { type: 'move', x: bestPath.step.x, y: bestPath.step.y, cost: bestPath.step.cost };
        }
        return null;
    }

    // Collect leg of a plan: route toward a shrine that supplies a type the
    // plan is still short on. Shrine collection isn't a distinct action —
    // it's a side effect of ENDING YOUR TURN on the shrine's centre hex
    // (game-ui.js replenishShrineStones(), amount = stone rank, capped by
    // source pool + player pool room) — so once standing on a shrine that
    // covers a needed type, the right move IS to end the turn right there,
    // not linger. Returns a move/endTurn action, or null if nothing needed
    // is currently collectible (caller falls through to generic scoring).
    function stepTowardCollect(self, missing, snap) {
        const neededTypes = new Set(missing
            .filter(c => (self.pool[c.type] || 0) <= 0)
            .map(c => c.type));
        if (!neededTypes.size) return null;
        const onShrine = shrineUnderfoot(snap);
        if (onShrine && neededTypes.has(onShrine.shrineType)) return { type: 'endTurn' };
        const shrines = collectibleShrines(snap).filter(t => neededTypes.has(t.shrineType));
        if (!shrines.length) return null;
        let best = null;
        for (const t of shrines) {
            const path = window.BotState.findPath(self.x, self.y, t.x, t.y);
            if (!path || !path.length) continue;
            const cost = path.reduce((c, p) => c + p.cost, 0);
            if (!best || cost < best.cost) best = { path, cost };
        }
        if (!best) return null;
        if (snap.turn.ap > 0 && best.path[0].cost <= snap.turn.ap) {
            return { type: 'move', x: best.path[0].x, y: best.path[0].y, cost: best.path[0].cost };
        }
        return null;
    }

    // The next concrete action the plan dictates, or null (fall back to scoring)
    function planNextAction(snap) {
        const m = mem(snap.turn.activePlayerIndex);
        if (!m.plan || !planValid(snap)) { m.plan = null; return null; }
        const plan = m.plan;
        const self = me(snap);
        const missing = plan.cells.filter(c =>
            !placedStones.some(st => st.type === c.type && Math.hypot(st.x - c.x, st.y - c.y) < 5));

        // Did our last attempt actually stick? If the cell we just tried to
        // fill is still missing, something (e.g. an adjacent fire stone)
        // destroyed it on placement. Count the failure; past the limit,
        // blacklist the cell and abandon this plan rather than loop forever.
        if (plan._lastTargetKey) {
            const stillMissing = missing.some(c => cellKey(c) === plan._lastTargetKey);
            if (stillMissing) {
                const fails = (m.cellFailCount.get(plan._lastTargetKey) || 0) + 1;
                m.cellFailCount.set(plan._lastTargetKey, fails);
                if (fails >= CELL_FAIL_LIMIT) {
                    log(`Cell ${plan._lastTargetKey} failed to hold a stone ${fails}x — blacklisting and abandoning plan`);
                    m.cursedCells.add(plan._lastTargetKey);
                    m.plan = null;
                    return null;
                }
            } else {
                m.cellFailCount.delete(plan._lastTargetKey);
            }
            plan._lastTargetKey = null;
        }

        if (missing.length) {
            // Only ever attempt/target a cell whose type is ALREADY in pool —
            // applyAction('placeStone') rejects one that isn't (no stones of
            // that type), and a failed plan action wipes the WHOLE plan (see
            // botAct()), which would defeat collect-then-build the instant a
            // still-collecting cell got attempted early. Cells still short a
            // type fall through to stepTowardCollect() below instead.
            const fillableMissing = missing.filter(c => (self.pool[c.type] || 0) > 0);
            for (const c of fillableMissing) {
                if (m.cursedCells.has(cellKey(c))) continue;
                if (typeof isInPlacementRange === 'function' && isInPlacementRange(c.x, c.y, c.type)) {
                    plan._lastTargetKey = cellKey(c);
                    return { type: 'placeStone', x: c.x, y: c.y, stoneType: c.type, scroll: plan.scroll,
                             progress: (plan.cells.length - missing.length + 1) / plan.cells.length };
                }
            }
            if (snap.turn.ap > 0) {
                const fillableOrdered = fillableMissing.filter(c => !m.cursedCells.has(cellKey(c)));
                if (fillableOrdered.length) {
                    // fill the farthest-from-anchor cells first so placed stones
                    // (earth blocks movement!) don't wall off the rest of the shape
                    const aPx = hexToPixel(plan.anchor.q, plan.anchor.r, TILE_SIZE);
                    const ordered = [...fillableOrdered].sort((a, b) =>
                        Math.hypot(b.x - aPx.x, b.y - aPx.y) - Math.hypot(a.x - aPx.x, a.y - aPx.y));
                    for (const c of ordered) {
                        const mv = stepTowardCell(self, c, missing, snap.turn.ap);
                        if (mv) return mv;
                    }
                }
                // Nothing fillable with CURRENT pool — collect leg: route
                // toward (or end turn on) a shrine for a still-short type.
                const collect = stepTowardCollect(self, missing, snap);
                if (collect) return collect;
            }
            return null; // out of AP / unreachable / uncollectible — generic scoring takes over
        }

        // Shape complete → return to the anchor and cast
        const aPx = hexToPixel(plan.anchor.q, plan.anchor.r, TILE_SIZE);
        if (Math.hypot(self.x - aPx.x, self.y - aPx.y) >= 5) {
            if (snap.turn.ap > 0) {
                const path = window.BotState.findPath(self.x, self.y, aPx.x, aPx.y);
                if (path && path.length && path[0].cost <= snap.turn.ap) {
                    return { type: 'move', x: path[0].x, y: path[0].y, cost: path[0].cost };
                }
            }
            return null;
        }
        if (snap.turn.ap >= 2 && window.spellSystem.checkPattern(plan.scroll)) {
            return { type: 'cast', scroll: plan.scroll };
        }
        return null;
    }

    // ----------------------------------------------------------------
    // Stage 2 — depth-limited lookahead over BotSim's forward model.
    // Enabled via WEIGHTS.searchDepth > 0. Search stays WITHIN the bot's
    // own turn: an endTurn edge is a leaf (roadmap: multi-turn MCTS is a
    // separate, optional step).
    // ----------------------------------------------------------------

    // Explore field: cost-to-nearest-hidden-tile for every hex, computed once
    // per search decision (multi-source Dijkstra over the SIM grid). Leaf
    // evaluation uses it instead of euclidean distance — euclidean freezes
    // the search in cul-de-sacs exactly like it froze the greedy scorer.
    let _exploreField = null; // { dist: Map<hexKey, cost> } | null
    function buildExploreField(snap) {
        const grid = window.BotSim.grid(snap);
        const hiddenIds = new Set(snap.tiles.filter(t => !t.revealed && !t.isPlayerTile).map(t => t.id));
        if (!hiddenIds.size) return null;
        const dist = new Map();
        const frontier = [];
        for (const h of grid) {
            if (h.tileIds.some(id => hiddenIds.has(id))) { dist.set(h.key, 0); frontier.push(h); }
        }
        while (frontier.length) {
            let bi = 0;
            for (let i = 1; i < frontier.length; i++)
                if (dist.get(frontier[i].key) < dist.get(frontier[bi].key)) bi = i;
            const cur = frontier.splice(bi, 1)[0];
            for (const nb of grid) {
                const d = Math.hypot(nb.x - cur.x, nb.y - cur.y);
                if (d <= 5 || d >= 40) continue;
                const mv = window.BotSim.canMoveTo(snap, nb.x, nb.y);
                if (!mv.canMove) continue;
                const nd = dist.get(cur.key) + Math.max(0.5, mv.cost); // 0-cost wind still advances the field
                if (nd < (dist.get(nb.key) ?? Infinity)) { dist.set(nb.key, nd); frontier.push(nb); }
            }
        }
        return { dist };
    }

    // How close is `oppIndex` to winning, in the SAME currency evaluateSnapshot()
    // uses for our own progress — deliberately mirrors its activated+home-distance
    // terms so "how close are they" is directly comparable to "how close am I."
    function opponentProgress(snap, oppIndex) {
        const opp = snap.players[oppIndex];
        if (!opp) return 0;
        let v = opp.activated.length * WEIGHTS.evalActivated;
        if (ELEMENTS.every(el => opp.activated.includes(el))) {
            const home = snap.tiles.find(t => t.isPlayerTile && t.playerIndex === oppIndex);
            if (home) v += WEIGHTS.evalHomeDist * Math.hypot(home.x - opp.x, home.y - opp.y);
        }
        return v;
    }

    // Common-area scrolls are castable by ANYONE — if an opponent's CURRENT
    // board already satisfies one, that's a "loaded gun" distinct from their
    // activated count (a scroll they haven't gotten around to yet doesn't
    // show up there). Uses BotSim.checkPattern(snap, scroll, playerIndex) —
    // a pure function of the snapshot, safe to call on hypothetical/simulated
    // states, not the live board (unlike spellSystem.checkPatternForPlayer).
    // Discarding OUR OWN scroll of the threatened element replaces it
    // (discardToCommonArea sends the old one to the bottom of its deck — a
    // real denial, not just a swap) — search discovers this on its own: the
    // resulting snapshot's commonArea differs, so this term scores lower for
    // whichever opponent was threatening it. No special-casing needed.
    function commonAreaThreat(snap, forIndex) {
        let threat = 0;
        for (const name of snap.commonArea || []) {
            const def = window.SCROLL_DEFINITIONS?.[name];
            if (!def || def.level === 1) continue; // response-only scrolls aren't a main-phase threat
            for (let i = 0; i < snap.players.length; i++) {
                if (i === forIndex || !snap.players[i]) continue;
                if (window.BotSim.checkPattern(snap, name, i)) { threat += WEIGHTS.evalCommonThreat; break; }
            }
        }
        return threat;
    }

    // State value of a snapshot from player `forIndex`'s perspective.
    // This is the search leaf evaluator — tune via WEIGHTS.eval*, not here.
    function evaluateSnapshot(snap, forIndex) {
        const p = snap.players[forIndex];
        if (!p) return -Infinity;
        const win = window.BotSim.winner(snap);
        if (win === forIndex) return WEIGHTS.evalWin;
        if (win !== null) return -WEIGHTS.evalWin;

        let v = 0;
        v += p.activated.length * WEIGHTS.evalActivated;
        for (const el of ELEMENTS) {
            const n = p.pool[el] || 0;
            const useful = !p.activated.includes(el) && (snap.sourcePool[el] || 0) > 0;
            v += n * (useful ? WEIGHTS.evalStoneNeeded : WEIGHTS.evalStone);
        }
        v += (p.pool.void || 0) * WEIGHTS.evalVoidHeld;
        v += (p.handCount + p.activeCount) * WEIGHTS.evalScrollHeld;
        // AP only counts while still inside the original turn — after a
        // simulated endTurn the reset would otherwise make passing the turn
        // look like free value (single-player keeps the same activePlayerIndex)
        if (snap.turn.activePlayerIndex === forIndex && !(snap.sim?.turnsEnded > 0)) {
            v += snap.turn.ap * WEIGHTS.evalAp;
        }
        // Flat credit for effects the simulator honestly didn't model — but
        // only for casts that granted a new activation, or the search farms
        // the flat value by re-casting an already-won scroll forever
        for (const c of snap.sim?.unsimulatedCasts || []) {
            if (c.grantedNew) v += WEIGHTS.evalUnsimCast;
        }

        const allActivated = ELEMENTS.every(el => p.activated.includes(el));
        if (allActivated) {
            const home = snap.tiles.find(t => t.isPlayerTile && t.playerIndex === forIndex);
            if (home) v += WEIGHTS.evalHomeDist * Math.hypot(home.x - p.x, home.y - p.y);
        } else {
            const hidden = snap.tiles.filter(t => !t.revealed && !t.isPlayerTile);
            if (hidden.length) {
                // Prefer real path cost (explore field) over euclidean; ~35px/step
                // keeps the same weight scale as the euclidean fallback
                let d = null;
                const fieldCost = _exploreField?.dist.get(`${Math.round(p.x)},${Math.round(p.y)}`);
                if (fieldCost !== undefined) d = fieldCost * 35;
                if (d === null) d = Math.min(...hidden.map(t => Math.hypot(t.x - p.x, t.y - p.y)));
                v += WEIGHTS.evalHiddenDist * d;
            }
        }

        // Opponent threat — zero-sum: their progress toward winning is danger
        // to us. MAX across opponents (not sum) so this reacts to whoever is
        // most advanced without being diluted by player count in 3-5p games.
        let maxOppProgress = 0;
        for (let i = 0; i < snap.players.length; i++) {
            if (i === forIndex || !snap.players[i]) continue;
            maxOppProgress = Math.max(maxOppProgress, opponentProgress(snap, i));
        }
        v -= maxOppProgress * WEIGHTS.evalOpponentThreat;
        v -= commonAreaThreat(snap, forIndex);

        return v;
    }

    // Drop placeStone/cast actions that can never grant win credit (see
    // hasWinCredit()) — search has no other way to notice a pattern is
    // pointless, since evaluateSnapshot() only sees pool/activated counts,
    // not "is this scroll's pattern even completable." Applied at every
    // ply, not just the root, so the search tree never expands through one.
    // cast needs its own check (not hasWinCredit's element/pool logic):
    // BotSim's simCast() unconditionally activates the element on cast (it
    // doesn't model per-scroll special-effect preconditions like Sacrificial
    // Pyre cancelling on an empty hand — see trackCastCredit()), so a
    // blacklisted scroll would otherwise look like a guaranteed win-credit
    // step to the search and get picked every time despite really being a
    // no-op in the real game.
    function creditFilter(snap, acts) {
        const noCredit = mem(snap.turn.activePlayerIndex).noCreditScrolls;
        return acts.filter(a =>
            (a.type !== 'placeStone' || hasWinCredit(snap, a.scroll)) &&
            (a.type !== 'cast' || !noCredit.has(a.scroll)));
    }

    // Beam search: at every node, 1-ply-evaluate all children, expand only
    // the top `searchBreadth`. Root actions come from the REAL legalActions()
    // (game-validated); deeper plies use BotSim.legalActions (pure mirror).
    // Returns {action, score} or null when search can't run here.
    function searchPick() {
        const sim = window.BotSim;
        if (!sim) return null;
        const snap0 = window.BotState.snapshot();
        const meIdx = snap0.turn.activePlayerIndex;
        const legal = window.BotState.legalActions();
        if (!legal.length || legal[0].type === 'placeTile') return null;

        const depth = Math.max(1, WEIGHTS.searchDepth | 0);
        const breadth = Math.max(2, WEIGHTS.searchBreadth | 0);
        _exploreField = buildExploreField(snap0); // path-aware leaf evaluation
        // Stage 4 terrain-control sets — root-only by design (see
        // tacticalContext): evaluateSnapshot() never sees them, so leaves
        // stay cheap; the bonus is folded into the root scores below the
        // same way revisitPenalty already is.
        const tac = legal.some(a => a.type === 'placeStone') ? tacticalContext(snap0) : null;

        function value(snap, d) {
            // Leaf: depth exhausted, game over, or the turn passed (endTurn)
            if (d <= 0 || snap.turn.activePlayerIndex !== meIdx || sim.isTerminal(snap)) {
                return evaluateSnapshot(snap, meIdx);
            }
            const acts = creditFilter(snap, sim.legalActions(snap));
            if (!acts.length) return evaluateSnapshot(snap, meIdx);
            const children = acts
                .map(a => { const s1 = sim.simulate(snap, a); return { a, s1, v1: evaluateSnapshot(s1, meIdx) }; })
                .sort((x, y) => y.v1 - x.v1)
                .slice(0, breadth);
            let best = -Infinity;
            for (const c of children) {
                const v = value(c.s1, d - 1);
                if (v > best) best = v;
            }
            return best;
        }

        // Root: beam over the real legal actions, but move the bot's
        // anti-oscillation penalty into the root scores so search ties
        // break the same way greedy's do.
        const rootChildren = creditFilter(snap0, legal)
            .map(a => { const s1 = sim.simulate(snap0, a); return { a, s1, v1: evaluateSnapshot(s1, meIdx) }; })
            .sort((x, y) => y.v1 - x.v1)
            .slice(0, Math.max(breadth, 8)); // keep the root a little wider
        let best = null;
        for (const c of rootChildren) {
            let v = value(c.s1, depth - 1);
            if (c.a.type === 'move') v += revisitPenalty(mem(meIdx).recentPositions, c.a, WEIGHTS.moveRevisitPenalty);
            if (c.a.type === 'teleport') v += revisitPenalty(mem(meIdx).recentPositions, c.a, WEIGHTS.teleportRevisitPenalty);
            if (c.a.type === 'placeStone') {
                v += tacticalPlaceBonus(c.a, snap0, tac);
                // Tactical placements have no pattern value the eval could
                // see — keep the same idle-drop bias greedy scoring has.
                if (!c.a.scroll) v += WEIGHTS.placeTacticalBase;
            }
            if (!best || v > best.score) best = { action: c.a, score: v };
        }
        _exploreField = null; // valid only for this decision's root snapshot
        return best;
    }

    // Rank all legal actions for the current position (debug + decision core)
    // fixationTarget: optional {x,y} from findFixationTarget(), passed by
    // botAct()'s turn-repeat circuit breaker (see turnRepeatStreak below) —
    // turns into a real path in ctx.fixationPath for scoreAction()'s move
    // case. Omitted on every other call site, same as ctx.homePath being
    // conditional on all-5-activated.
    function rankActions(fixationTarget) {
        const snap = window.BotState.snapshot();
        const legal = window.BotState.legalActions();

        // Placement phase: no pawn placed yet, so me(snap) is null — the only
        // legal actions are placeTile candidates, scored without needing self.
        if (legal.length && legal[0].type === 'placeTile') {
            return legal
                .map(a => ({ action: a, score: scoreAction(a, snap, {}) }))
                .sort((x, y) => y.score - x.score);
        }

        const self = me(snap);
        if (!self) return [];

        const ctx = {
            shrines: collectibleShrines(snap),
            onShrine: shrineUnderfoot(snap),
            hiddenTiles: snap.tiles.filter(t => !t.revealed && !t.isPlayerTile),
            paths: new Map(),
            recentPositions: mem(snap.turn.activePlayerIndex).recentPositions,
            homePath: null,
        };
        for (const t of ctx.shrines) {
            ctx.paths.set(t.id, window.BotState.findPath(self.x, self.y, t.x, t.y));
        }
        // Cheapest real path to any walkable hex of a hidden tile (their outer
        // rings ARE walkable). Hidden tile CENTRES are not on the hex grid, so
        // findPath to the centre returns null — target the ring hexes instead.
        ctx.explorePath = null;
        if (ctx.hiddenTiles.length) {
            const targets = window.BotState.hexGrid()
                .filter(h => h.tiles?.some(t => t.flipped && !t.isPlayerTile))
                .sort((a, b) => Math.hypot(a.x - self.x, a.y - self.y) - Math.hypot(b.x - self.x, b.y - self.y));
            let best = null;
            for (const h of targets.slice(0, 10)) {
                if (Math.hypot(h.x - self.x, h.y - self.y) < 5) { best = null; break; } // already there
                const path = window.BotState.findPath(self.x, self.y, h.x, h.y);
                if (!path || !path.length) continue;
                const cost = path.reduce((c, p) => c + p.cost, 0);
                if (!best || cost < best.cost) best = { path, cost };
            }
            if (best) ctx.explorePath = best.path;
        }
        // All 5 elements activated → path back to the bot's own player shrine
        if (ELEMENTS.every(el => self.activated.includes(el))) {
            const homeTile = snap.tiles.find(t =>
                t.isPlayerTile && t.playerIndex === snap.turn.activePlayerIndex);
            if (homeTile) {
                const path = window.BotState.findPath(self.x, self.y, homeTile.x, homeTile.y);
                if (path && path.length) ctx.homePath = path;
            }
        }
        ctx.fixationPath = null;
        if (fixationTarget) {
            const path = window.BotState.findPath(self.x, self.y, fixationTarget.x, fixationTarget.y);
            if (path && path.length) ctx.fixationPath = path;
        }
        // Stage 4 terrain-control sets — only worth building when a stone
        // placement is actually on the table this decision.
        ctx.tac = legal.some(a => a.type === 'placeStone') ? tacticalContext(snap) : null;

        return legal
            .map(a => ({ action: a, score: scoreAction(a, snap, ctx) }))
            .sort((x, y) => y.score - x.score);
    }

    // ----------------------------------------------------------------
    // One bot step: pick argmax, apply it. Returns the applied action or null.
    // ----------------------------------------------------------------
    function botAct() {
        if (typeof isMultiplayer !== 'undefined' && isMultiplayer &&
            typeof myPlayerIndex !== 'undefined' && activePlayerIndex !== myPlayerIndex) {
            log('Not this client\'s turn — refusing to act (multiplayer guard)');
            return null;
        }

        const snap = window.BotState.snapshot();

        // Hand/active overflow must resolve before anything else — including
        // the pattern plan below, which calls applyAction() directly and would
        // otherwise bypass legalActions()'s discard-only gate while over
        // capacity (see bot-state.js legalActions() overflow gate).
        const self0 = me(snap);
        if (self0) {
            const maxHand = window.spellSystem?.MAX_HAND_SIZE ?? 2;
            const maxActive = window.spellSystem?.MAX_ACTIVE_SIZE ?? 2;
            if (self0.handCount > maxHand || self0.activeCount > maxActive) {
                const ranked = rankActions(); // legalActions() returns discards only right now
                if (ranked.length) {
                    const { action } = ranked[0];
                    log(`Resolving scroll overflow: discard ${action.scroll} (from ${action.from})`);
                    const r = window.BotState.applyAction(action);
                    if (r.ok) return action;
                    log(`Discard failed (${r.reason})`);
                }
                return null;
            }
        }

        // All per-bot memory (plan, recent positions, turn-repeat tracking)
        // is keyed by player index — see mem() above.
        const idx = snap.turn.activePlayerIndex;
        const m = mem(idx);

        // The pattern plan takes priority: it's the only way multi-hex
        // patterns ever complete under the adjacent-only placement rule
        if (!m.plan || !planValid(snap)) {
            m.plan = makePlan(snap);
            if (m.plan) log(`New plan: build ${m.plan.scroll} anchored at hex (${m.plan.anchor.q},${m.plan.anchor.r})`);
        }
        const planAction = m.plan ? planNextAction(snap) : null;
        if (planAction) {
            const label = planAction.type === 'cast' ? `cast ${planAction.scroll}`
                        : planAction.type === 'placeStone' ? `place ${planAction.stoneType} for ${planAction.scroll}`
                        : planAction.type === 'endTurn' ? 'end turn to collect shrine stones'
                        : `move to (${planAction.x.toFixed(0)},${planAction.y.toFixed(0)})`;
            log(`Plan action: ${label}`);
            const r = window.BotState.applyAction(planAction);
            if (r.ok) {
                if (planAction.type === 'cast') {
                    trackCastCredit(idx, snap, planAction.scroll);
                    _castsApplied++;
                    m.plan = null; // plan fulfilled
                }
                if (planAction.type === 'move') recordVisited(idx, planAction.x, planAction.y);
                return planAction;
            }
            log(`Plan action failed (${r.reason}) — falling back to scoring`);
            m.plan = null;
        }

        // Turn-repeat circuit breaker: if the last COMPLETED turn traced the
        // exact same move sequence as the one before it (bookkeeping in
        // botTurn() below), the scoring-driven fallback (search or greedy)
        // is stuck re-deriving an unproductive cycle — the anti-oscillation
        // recency-decay penalty is tuned for 2-hex ties and can get rotated
        // in lockstep by a larger stable N-hex cycle instead of breaking it
        // (RECENT_POS_LIMIT is 6 — any stable loop of 7+ hexes rotates the
        // whole window out from under the penalty before it ever returns to
        // a hex still in memory).
        //
        // That exact-repeat check is a NARROW trigger, though — a bot
        // orbiting a small home region rarely repeats the SAME move list
        // turn to turn (the revisit penalty perturbs lap order), so it can
        // stay at streak 0 for 100+ turns while accomplishing nothing.
        // Confirmed on a real 5-bot 300-turn game log: 4 of 5 bots produced
        // zero casts/placements for the entire second half, movement
        // collapsed from a 400+px exploration spread to a ~70px pocket, and
        // the exact-repeat check fired on almost none of it (different lap
        // order each time). unproductiveStreak (botTurn(), reset only by an
        // actual cast/placeStone) is a direct progress signal instead of a
        // movement-shape one, and triggers the SAME remedy independent of
        // whether the movement looks like a clean loop.
        //
        // Either way, first try findFixationTarget(): a REVEALED hex
        // elsewhere on the board with an uncast-element pattern still
        // buildable pulls the bot there via a strong (but not scripted)
        // scoring term instead of just marking time. If no target exists,
        // an exact-repeat (turnRepeatStreak) falls back to the older "skip
        // movement for one turn" safety net — a confirmed frozen loop
        // genuinely needs SOME intervention. A plain productivity stall
        // (unproductiveStreak alone, no exact repeat) does NOT force that
        // fallback: the bot isn't necessarily looping, just not finding
        // anything to build, and forcing it to stop moving would be actively
        // harmful if repositioning is the only thing left worth doing — it
        // just proceeds to normal scoring below with no fixation applied,
        // same as if this whole block didn't run. Both counters are
        // independent: turnRepeatStreak self-clears (a one-shot
        // intervention, reset by botTurn() regardless of outcome);
        // unproductiveStreak persists across fixation-driven turns and only
        // clears on an actual cast/placeStone — a genuinely dead position
        // (nothing anywhere still grants win credit) just means
        // findFixationTarget() keeps returning null every turn, which is
        // the correct outcome, not a bug to route around further.
        let choice = null;
        const stuckByRepeat = m.turnRepeatStreak >= 1;
        const stuckByStall = m.unproductiveStreak >= UNPRODUCTIVE_LIMIT;
        if (stuckByRepeat || stuckByStall) {
            const fixationTarget = findFixationTarget(snap);
            if (fixationTarget) {
                const ranked = rankActions(fixationTarget);
                if (ranked.length) {
                    choice = ranked[0];
                    log(`${stuckByRepeat ? `Turn-repeat circuit breaker (streak ${m.turnRepeatStreak})` : `Unproductive streak (${m.unproductiveStreak})`}: ` +
                        `fixating on ${fixationTarget.scroll} near (${fixationTarget.x.toFixed(0)},${fixationTarget.y.toFixed(0)})`);
                }
            }
            if (!choice && stuckByRepeat) {
                const ranked = rankActions().filter(r => r.action.type !== 'move');
                if (ranked.length) {
                    choice = ranked[0];
                    log(`Turn-repeat circuit breaker (streak ${m.turnRepeatStreak}): skipping movement, picked ${choice.action.type}`);
                } else {
                    const r = window.BotState.applyAction({ type: 'endTurn' });
                    if (r.ok) {
                        log('Turn-repeat circuit breaker: only movement was legal — ending turn');
                        return { type: 'endTurn' };
                    }
                }
            }
        }

        // Stage 2: lookahead search when enabled, greedy Stage-1 argmax otherwise.
        // Hybrid mode saves the lookahead for states where it can actually pay
        // off — a cast or stone placement is available — and stays greedy for
        // plain movement/exploration.
        if (!choice && (WEIGHTS.searchDepth | 0) > 0 && window.BotSim) {
            let useSearch = true;
            if (WEIGHTS.searchHybrid) {
                const legal = window.BotState.legalActions();
                // Tactical (scroll:null) placements are near-ALWAYS legal —
                // any held earth/wind/fire next to an empty hex — so they
                // must not count as a "tactical decision point" here, or
                // hybrid degenerates into always-on search, whose movement
                // choices are known to fight the plan/path logic (see the
                // Stage-2 acceptance measurements: FULL search lost 1-3).
                useSearch = legal.some(a => a.type === 'cast' || (a.type === 'placeStone' && a.scroll));
            }
            if (useSearch) {
                choice = searchPick();
                if (choice) log(`Search (depth ${WEIGHTS.searchDepth | 0}${WEIGHTS.searchHybrid ? ', hybrid' : ''}) picked ${choice.action.type}`);
            }
        }
        if (!choice) {
            const ranked = rankActions();
            if (!ranked.length) { log('No legal actions found'); return null; }
            choice = ranked[0];
        }

        // Anti-freeze: choosing endTurn with most of the turn's AP unspent
        // while moves exist almost always means stale revisit-penalty memory
        // has "walled in" the pawn (every escape route was recently visited).
        // Forget the movement grudges once and re-decide — if endTurn is
        // still the best with a clean slate, it's a genuine choice.
        // ONLY when endTurn scored as a do-nothing fallback (< 20): a high
        // endTurn score means shrine collection (or a win) — clearing the
        // memory there re-enables the exact oscillation it suppresses and
        // the bot steps OFF the shrine instead of collecting.
        if (choice.action.type === 'endTurn' && choice.score < 20 &&
            snap.turn.ap >= 3 && m.recentPositions.length) {
            m.recentPositions.length = 0;
            log('Anti-freeze: endTurn chosen with AP to spare — clearing move memory and re-deciding');
            const redo = ((WEIGHTS.searchDepth | 0) > 0 && window.BotSim) ? searchPick() : null;
            const rankedRedo = redo ? null : rankActions();
            choice = redo || (rankedRedo && rankedRedo.length ? rankedRedo[0] : choice);
        }

        const { action, score } = choice;
        const label = action.type === 'placeTile'      ? `place player tile at (${action.x.toFixed(0)},${action.y.toFixed(0)})`
                    : action.type === 'cast'           ? `cast ${action.scroll}`
                    : action.type === 'placeStone'     ? (action.scroll
                        ? `place ${action.stoneType} for ${action.scroll} (${Math.round((action.progress||0)*100)}%)`
                        : `place ${action.stoneType} for terrain control`)
                    : action.type === 'move'           ? `move to (${action.x.toFixed(0)},${action.y.toFixed(0)}) cost ${action.cost}`
                    : action.type === 'discardScroll'  ? `discard ${action.scroll} (from ${action.from})`
                    : 'end turn';
        log(`Best action [${score.toFixed(1)}]: ${label}`);

        const res = window.BotState.applyAction(action);
        if (!res.ok) { log(`Action failed: ${res.reason}`); return null; }
        if (action.type === 'move') recordVisited(idx, action.x, action.y);
        if (action.type === 'teleport') {
            // Record BOTH ends of the hop: the origin first, so "teleport
            // straight back to where I just was" draws the strongest (k=1)
            // revisit penalty on the next decision, then the destination as
            // the new current position.
            const self = snap.players[idx];
            if (self) recordVisited(idx, self.x, self.y);
            recordVisited(idx, action.x, action.y);
        }
        if (action.type === 'cast') { trackCastCredit(idx, snap, action.scroll); _castsApplied++; }
        return action;
    }

    // ----------------------------------------------------------------
    // Quiescence: after a cast, multiplayer opens a ~15s response window;
    // some scroll effects enter selection modes or cascade prompts that
    // wait for input. The bot must NOT take its next action (or end its
    // turn) until this machinery settles — otherwise the stack resolves
    // after the turn has passed, attributed to the wrong player.
    // Resolves what it can (cascade prompt), cancels what it can't drive
    // (selection modes), and waits out the rest.
    // ----------------------------------------------------------------
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // Arena fast mode: BotSystem.speedScale scales every between-action delay
    // (1 = normal live play; 0.1 = arena). Scaled sleeps still yield the event
    // loop so async effect machinery (fire destroys, cascades) can settle.
    const tick = ms => sleep(Math.max(0, ms * (window.BotSystem?.speedScale ?? 1)));

    async function waitForQuiescence() {
        const deadline = Date.now() + 25000;
        while (Date.now() < deadline) {
            // Cascade prompt (scroll drawn onto a full hand): choose like a
            // player would — keep the new scroll usable if possible
            const cascade = document.getElementById('cascade-popup');
            if (cascade) {
                const buttons = [...cascade.querySelectorAll('button')];
                const pick = buttons.find(b => b.textContent === 'To Active') ||
                             buttons.find(b => b.textContent === 'To Common');
                if (pick) { log(`Cascade prompt: choosing "${pick.textContent}"`); pick.click(); }
                await tick(250);
                continue;
            }
            // Stage 2.5: drive what BotEffects knows how to drive, before
            // falling through to cancelling everything else it can't yet.
            // Transmute has no selectionMode object (raw DOM modal), so it's
            // checked directly here rather than via se.selectionMode below.
            if (document.getElementById('transmute-modal') && window.BotEffects?.driveTransmute) {
                if (window.BotEffects.driveTransmute()) { await tick(150); continue; }
            }
            // Selection modes (Sacrificial Pyre, Telekinesis, Take Flight, …)
            // need input — Stage 2.5's BotEffects drives the ones it knows
            // (see js/bot-effects.js); anything else is cancelled so the turn
            // never wedges (Control the Current is the one exception — see
            // below). Modal-based effects (Scholar's Insight, Create,
            // Arson…) don't always register a selectionMode, so ALSO detect
            // their overlay elements directly — otherwise the modal lingers
            // on screen for the rest of the game, blocking the board view.
            const se = window.spellSystem?.scrollEffects;
            const openModal = (se?.EFFECT_MODAL_IDS || []).find(id => document.getElementById(id));
            if (se?.selectionMode || window.takeFlightState || openModal) {
                if (window.BotEffects?.driveSelection()) {
                    await tick(250);
                    continue;
                }
                // Control the Current (water-transform) is a persistent
                // whole-turn mode with no "Done" button — driveSelection()
                // returning false here just means no water stone is
                // adjacent RIGHT NOW, not that the bot is stuck. Cancelling
                // it like every other undriven selection would prematurely
                // end the effect's whole-turn duration the instant that's
                // true, denying any benefit from moving toward a water
                // stone later in the same turn. Treat it as quiescent
                // instead — botTurn()'s loop calls waitForQuiescence()
                // again after the bot's next real action (typically a
                // move), re-checking for a newly-adjacent stone then. The
                // scroll's own clearTurnBuffs() (game-core.js, called on
                // End Turn) is what actually ends this mode.
                if (se?.selectionMode?.type === 'water-transform') {
                    return;
                }
                log(`Cancelling a selection the bot cannot drive${openModal ? ` (${openModal})` : ''}`);
                se?.cancelSelectionMode?.();
                if (window.takeFlightState) window.takeFlightState = null;
                await tick(250);
                continue;
            }
            // Response window: in the arena (bot-vs-bot, no multiplayer),
            // actually decide respond/pass instead of just waiting out the
            // timer — see BotEffects.decideResponse for why this needs an
            // explicit responder index. Real multiplayer games still just
            // wait the stack out (response-window.js's existing "bots
            // cannot respond" path is untouched).
            if (window.spellSystem?.responseWindow?.isResponseWindowOpen) {
                const rw = window.spellSystem.responseWindow;
                const arenaActive = typeof window.BotArena?.isRunning === 'function' && window.BotArena.isRunning();
                if (arenaActive && window.BotEffects?.decideResponse) {
                    const casterIdx = rw.currentCaster;
                    const numPlayers = typeof playerPositions !== 'undefined' ? playerPositions.length : 0;
                    let acted = false;
                    for (let i = 0; i < numPlayers; i++) {
                        if (i === casterIdx || rw.respondingPlayers?.has(i)) continue;
                        if (window.BotEffects.decideResponse(i, casterIdx)) { acted = true; break; }
                    }
                    if (acted) { await tick(250); continue; }
                }
                await tick(400);
                continue;
            }
            return; // quiet — safe to act again
        }
        log('waitForQuiescence timed out — proceeding anyway');
    }

    // ----------------------------------------------------------------
    // Whole-turn autopilot: loop steps until the turn ends (or safety cap).
    // Async with a small delay so reveals/casts/HUD settle between actions.
    // ----------------------------------------------------------------
    let _turnRunning = false;
    async function botTurn() {
        if (_turnRunning) { log('Turn already running'); return; }
        _turnRunning = true;
        const startingPlayer = activePlayerIndex;
        const m = mem(startingPlayer);
        const wasForced = m.turnRepeatStreak >= 1; // circuit breaker armed for this turn
        const turnMoves = [];
        let productive = false; // cast or placeStone applied this turn — see unproductiveStreak below
        let endedTurn = false;
        try {
            for (let i = 0; i < 30; i++) {                    // safety cap
                if (activePlayerIndex !== startingPlayer) break; // turn passed
                await waitForQuiescence();
                if (activePlayerIndex !== startingPlayer) break;
                const applied = botAct();
                if (!applied) break;
                if (applied.type === 'move') turnMoves.push(`${applied.x.toFixed(1)},${applied.y.toFixed(1)}`);
                // Tactical (scroll:null) drops are terrain control, not
                // progress toward the win — they must not mask a stall or
                // unproductiveStreak's circuit breaker never fires.
                if (applied.type === 'cast' || (applied.type === 'placeStone' && applied.scroll)) productive = true;
                if (applied.type === 'endTurn') { endedTurn = true; break; }
                await tick(350);
            }
            // Never leave autopilot RESTING ON A STONE when stepping onto a
            // stone-free hex is affordable: endTurn is banned there
            // (transit-only rule) unless genuinely stranded, so both the
            // arena's and bot-driver's forced end-turn safety nets would be
            // rejected and the whole game wedges. One escape step is enough
            // — the pawn is then on an empty hex where endTurn is legal.
            if (!endedTurn && activePlayerIndex === startingPlayer &&
                typeof isPlayerRestingOnStone === 'function' && isPlayerRestingOnStone(startingPlayer)) {
                const esc = window.BotState.legalActions()
                    .filter(a => a.type === 'move' &&
                        !placedStones.some(s => Math.hypot(s.x - a.x, s.y - a.y) < 5))
                    .sort((a, b) => a.cost - b.cost)[0];
                if (esc) {
                    log(`Autopilot ended on a stone — stepping off to (${esc.x.toFixed(0)},${esc.y.toFixed(0)}) so the turn can end`);
                    const r = window.BotState.applyAction(esc);
                    if (r.ok) recordVisited(startingPlayer, esc.x, esc.y);
                }
            }
        } finally {
            _turnRunning = false;
        }
        // Compare this turn's move sequence to THIS SAME PLAYER's last one
        // to detect a stable N-hex cycle (see mem()/turnRepeatStreak above).
        // A circuit-breaker turn (wasForced) is a one-shot intervention, not
        // a new baseline to compare against — fully reset regardless of
        // what it produced (likely empty, which must NOT count as "equal
        // to the last empty turn" or the breaker would just latch forever).
        if (wasForced) {
            m.turnRepeatStreak = 0;
            m.lastTurnMoveKey = null;
        } else {
            const key = turnMoves.join('|');
            if (key && key === m.lastTurnMoveKey) {
                m.turnRepeatStreak++;
                log(`Turn repeated the exact same ${turnMoves.length}-move sequence as last turn (streak ${m.turnRepeatStreak}) — next turn skips movement`);
            } else {
                m.turnRepeatStreak = 0;
            }
            m.lastTurnMoveKey = key || null;
        }
        // Broader stuck signal than the exact-repeat check above: a bot
        // orbiting a small home region rarely repeats the SAME move list
        // turn to turn (the revisit-penalty perturbs which hex it visits
        // first each lap), so turnRepeatStreak can stay at 0 for 100+ turns
        // while the bot accomplishes nothing. Track "how many of my own
        // turns in a row produced no cast/placeStone" instead — a direct
        // measure of progress, not movement shape — and let botAct()'s
        // circuit breaker fire on THIS once it crosses UNPRODUCTIVE_LIMIT,
        // in addition to the exact-repeat trigger. Not reset by a
        // fixation-driven turn (unlike turnRepeatStreak) — as long as the
        // bot keeps failing to progress, keep re-searching for a fixation
        // target every turn; a genuinely dead position (nothing anywhere
        // still grants win credit) just means findFixationTarget() keeps
        // returning null and the old fallback continues, same as before.
        if (productive) m.unproductiveStreak = 0;
        else {
            m.unproductiveStreak++;
            if (m.unproductiveStreak === UNPRODUCTIVE_LIMIT) {
                log(`${m.unproductiveStreak} turns with no cast/placeStone — trying fixation targets from now on`);
            }
        }
        log('Turn autopilot finished');
    }

    // ----------------------------------------------------------------
    // Keyboard: Shift+R = one step, Shift+B = whole turn.
    // Same guards as game-ui.js (no lobby, no text inputs).
    // ----------------------------------------------------------------
    document.addEventListener('keydown', function (e) {
        if (!e.shiftKey) return;
        const key = e.key.toUpperCase();
        if (key !== 'R' && key !== 'B') return;

        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
        if (!document.getElementById('game-layout')?.classList.contains('active')) return;

        e.preventDefault();
        if (key === 'R') { log('Shift+R — one bot step'); botAct(); }
        else             { log('Shift+B — bot plays out the turn'); botTurn(); }
    });

    // ----------------------------------------------------------------
    // Public API (console debugging + Stage 2/3 hooks)
    // ----------------------------------------------------------------
    // Wipe per-bot memory for ALL players (plan, anti-oscillation history,
    // cursed-cell blacklist, turn-repeat tracking). The arena MUST call this
    // between games — board positions repeat across games, so a cell
    // blacklisted in game 1 would silently handicap every later game.
    function resetMemory() {
        resetAllMemory();
    }

    window.BotSystem = {
        step:  botAct,        // one action
        turn:  botTurn,       // play out the whole turn
        rank:  rankActions,   // scored candidate list (top = what greedy step() would do)
        score: scoreAction,   // (action, snapshot, ctx) → utility
        searchPick,           // Stage 2 lookahead pick — used when WEIGHTS.searchDepth > 0
        evaluateSnapshot,     // Stage 2 state evaluator (search leaves)
        resetMemory,          // wipe plan/history/blacklists (arena: call per game)
        castsApplied: () => _castsApplied, // monotonic cast counter — arena's no-cast stall cap reads deltas
        speedScale: 1,        // scales all between-action delays (arena sets ~0.1)
        waitForQuiescence,    // settle response windows / selection modes / cascades
        WEIGHTS,              // live tuning surface (Stage 3a evolves this)
        DEFAULT_WEIGHTS,
    };

    log('Loaded — Shift+R = one bot step, Shift+B = full bot turn');
})();
