// ========================================
// CONNECTION MONITOR
// ========================================
// window.ConnectionMonitor — observes network/connection health and shows
// a single, always-visible source of truth for "how good is my connection
// right now". Built after a playtest where a poor connection caused a pile
// of confusing, unexplained breakage: every network call in this game
// (heartbeats, turn-timer enforcement, scroll-state sync, the realtime
// broadcast channel itself) previously failed silently on a bad connection
// — console.log only, nothing a player without devtools open would ever
// see. This module gives that failure mode a visible signal instead.
//
// Scope, deliberately: this module OBSERVES (browser online/offline, a
// lightweight periodic HTTP ping, realtime channel status reports handed
// to it by lobby.js) and REPORTS (a small HUD badge, onChange() subscribers,
// isWorkable() for gating). It does not know anything about game state and
// does not itself reconnect any Supabase Realtime channel — that requires
// game-specific knowledge (which channel, how to rebuild it) that belongs
// in lobby.js. Keeping this module ignorant of game state is deliberate:
// the rest of this codebase's multiplayer sync logic is large and already
// fragile (see planning/current.md's history of scroll-state desync fixes),
// so this stays a small, self-contained add-on other files opt into calling
// rather than something that reaches into and risks destabilizing them.
//
// Depends only on: `SUPABASE_URL` (declared by js/multiplayer-state.js) and
// browser globals. Must load AFTER multiplayer-state.js — see index.html's
// script order and js/INDEX.md.

(function () {
    'use strict';

    const PING_INTERVAL_MS = 12000;   // how often we probe, once steady-state
    const PING_TIMEOUT_MS  = 8000;    // a probe slower than this counts as a failure
    const SLOW_PING_MS     = 2500;    // a successful probe slower than this is "fair", not "good"
    const DEBOUNCE_SAMPLES = 2;       // consistent samples needed to move the DISPLAYED state (avoids flicker on one blip)
    const POOR_GRACE_MS    = 8000;    // how long "poor" must persist before isWorkable() flips false
    const OFFLINE_AFTER_FAILURES = 3; // consecutive failed pings (with the browser still claiming online) before we call it offline

    // ---- state ----
    let quality = 'unknown';          // 'good' | 'fair' | 'poor' | 'offline' | 'unknown'
    let browserOnline = (typeof navigator === 'undefined') || navigator.onLine !== false;
    let consecutiveFailures = 0;
    let lastLatencyMs = null;
    let lastSuccessAt = null;
    let lastError = null;
    let poorSinceMs = null;           // when the current poor/offline stretch began (for the grace period)
    let pendingQuality = null;        // debounce: quality we're trending toward
    let pendingCount = 0;
    let pingTimer = null;
    let started = false;

    const channelStatuses = Object.create(null); // channel name -> last reported status
    const listeners = [];

    function notify() {
        const snap = getStatus();
        listeners.forEach(fn => {
            try { fn(snap); } catch (e) { console.error('ConnectionMonitor listener error:', e); }
        });
        renderBadge(snap);
    }

    function setQuality(next, opts) {
        const immediate = !!(opts && opts.immediate);
        if (immediate || next === quality) {
            pendingQuality = null;
            pendingCount = 0;
            const changed = next !== quality;
            quality = next;
            if (quality === 'poor' || quality === 'offline') { if (!poorSinceMs) poorSinceMs = Date.now(); }
            else { poorSinceMs = null; }
            notify();
            return changed;
        }
        if (pendingQuality === next) {
            pendingCount++;
        } else {
            pendingQuality = next;
            pendingCount = 1;
        }
        if (pendingCount >= DEBOUNCE_SAMPLES) {
            quality = next;
            pendingQuality = null;
            pendingCount = 0;
            if (quality === 'poor' || quality === 'offline') { if (!poorSinceMs) poorSinceMs = Date.now(); }
            else { poorSinceMs = null; }
        }
        notify(); // still refresh the badge — latency/timestamp text can change even without a quality flip
        return quality === next;
    }

    // ---- browser online/offline (fast path — trust the browser immediately) ----
    function onBrowserOffline() {
        browserOnline = false;
        lastError = 'Browser reports no network connection';
        setQuality('offline', { immediate: true });
    }
    function onBrowserOnline() {
        browserOnline = true;
        consecutiveFailures = 0;
        // Don't claim "good" yet — let the next ping confirm it, but don't
        // leave the badge stuck on "offline" either while that ping is in flight.
        setQuality('fair', { immediate: true });
        runPing();
    }

    // ---- ping probe ----
    // Hits Supabase Auth's dedicated health endpoint — unauthenticated, no
    // RLS/table concerns, minimal payload, exists specifically for this.
    // ANY http response (even a non-2xx) proves the round trip completed;
    // that's what "is the connection workable" means here, not whether this
    // one endpoint likes us. Only a network-level failure (timeout, DNS,
    // connection refused) counts as a failed probe.
    async function runPing() {
        if (typeof SUPABASE_URL === 'undefined' || typeof fetch !== 'function') return;
        const startedAt = Date.now();
        const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        const timeoutId = controller ? setTimeout(() => controller.abort(), PING_TIMEOUT_MS) : null;
        try {
            const resp = await fetch(SUPABASE_URL + '/auth/v1/health', {
                method: 'GET',
                cache: 'no-store',
                signal: controller ? controller.signal : undefined
            });
            if (timeoutId) clearTimeout(timeoutId);
            const latency = Date.now() - startedAt;
            lastLatencyMs = latency;
            lastSuccessAt = Date.now();
            consecutiveFailures = 0;
            lastError = resp.ok ? null : ('Health check returned HTTP ' + resp.status);
            browserOnline = true;
            setQuality(latency > SLOW_PING_MS ? 'fair' : 'good');
        } catch (e) {
            if (timeoutId) clearTimeout(timeoutId);
            consecutiveFailures++;
            lastError = (e && e.name === 'AbortError') ? 'Request timed out' : ((e && e.message) || 'Request failed');
            if (!browserOnline) {
                setQuality('offline', { immediate: true });
            } else if (consecutiveFailures >= OFFLINE_AFTER_FAILURES) {
                setQuality('offline');
            } else {
                setQuality('poor');
            }
        }
    }

    function startPingLoop() {
        if (pingTimer) clearInterval(pingTimer);
        runPing();
        pingTimer = setInterval(runPing, PING_INTERVAL_MS);
    }

    // ---- public: realtime channel status reports (lobby.js calls this) ----
    function reportChannelStatus(name, status) {
        channelStatuses[name] = status;
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            lastError = name + ' channel: ' + status;
            setQuality('poor');
        } else if (status === 'SUBSCRIBED' && quality === 'offline') {
            // A channel just subscribed successfully — strong evidence the
            // connection works again. Let the next ping confirm "good".
            setQuality('fair', { immediate: true });
        }
    }

    // ---- public: broadcast send outcome (lobby.js's broadcastGameAction) ----
    function reportSendFailure(event, result) {
        lastError = 'Send "' + event + '" ' + result;
        consecutiveFailures++;
        if (consecutiveFailures >= OFFLINE_AFTER_FAILURES) setQuality('poor');
    }
    function reportSendSuccess() {
        if (consecutiveFailures > 0) consecutiveFailures--;
    }

    // ---- public: query ----
    function getStatus() {
        return {
            quality, browserOnline, lastLatencyMs, lastSuccessAt, lastError,
            consecutiveFailures, channelStatuses: Object.assign({}, channelStatuses)
        };
    }

    // The single gate other modules should check before doing something
    // where a broken connection does real damage (starting a multiplayer
    // game). Deliberately forgiving of a single blip — "poor" only fails
    // this once it's been sustained past POOR_GRACE_MS — and optimistic
    // about 'unknown' (before the very first ping has resolved) so this
    // never blocks the first thing a page does.
    function isWorkable() {
        if (!browserOnline) return false;
        if (quality === 'offline') return false;
        if (quality === 'poor' && poorSinceMs && (Date.now() - poorSinceMs) > POOR_GRACE_MS) return false;
        return true;
    }

    function onChange(fn) {
        if (typeof fn !== 'function') return () => {};
        listeners.push(fn);
        return function unsubscribe() {
            const i = listeners.indexOf(fn);
            if (i !== -1) listeners.splice(i, 1);
        };
    }

    // ---- badge UI ----
    const QUALITY_META = {
        good:    { color: '#69d83a', label: 'Connected' },
        fair:    { color: '#ffce00', label: 'Fair connection' },
        poor:    { color: '#ff8c00', label: 'Poor connection' },
        offline: { color: '#ed1b43', label: 'Offline' },
        unknown: { color: '#777',    label: 'Checking connection…' }
    };

    let badgeEl = null, dotEl = null, labelEl = null, detailEl = null;

    function ensureBadge() {
        if (badgeEl || typeof document === 'undefined' || !document.body) return;
        badgeEl = document.createElement('div');
        badgeEl.id = 'connection-status-badge';
        badgeEl.setAttribute('title', 'Click for connection details');
        badgeEl.innerHTML =
            '<span class="csb-dot"></span>' +
            '<span class="csb-label"></span>' +
            '<div class="csb-detail"></div>';
        document.body.appendChild(badgeEl);
        dotEl = badgeEl.querySelector('.csb-dot');
        labelEl = badgeEl.querySelector('.csb-label');
        detailEl = badgeEl.querySelector('.csb-detail');
        badgeEl.addEventListener('click', () => badgeEl.classList.toggle('csb-expanded'));
    }

    function renderBadge(snap) {
        ensureBadge();
        if (!badgeEl) return; // document.body not ready yet — init() retries via DOMContentLoaded
        const meta = QUALITY_META[snap.quality] || QUALITY_META.unknown;
        dotEl.style.background = meta.color;
        dotEl.style.color = meta.color; // .csb-dot's box-shadow uses currentColor — must be set explicitly, background alone won't drive it
        labelEl.textContent = meta.label;
        badgeEl.classList.toggle('csb-bad', snap.quality === 'poor' || snap.quality === 'offline');

        const bits = [];
        if (snap.lastLatencyMs != null) bits.push('Last ping: ' + snap.lastLatencyMs + 'ms');
        if (snap.lastSuccessAt) bits.push('Last confirmed: ' + Math.max(0, Math.round((Date.now() - snap.lastSuccessAt) / 1000)) + 's ago');
        if (snap.lastError) bits.push('Last error: ' + snap.lastError);
        bits.push('Browser network: ' + (snap.browserOnline ? 'online' : 'offline'));
        detailEl.innerHTML = bits.map(b => '<div>' + String(b).replace(/</g, '&lt;') + '</div>').join('');
    }

    // ---- lifecycle ----
    function init() {
        if (started) return;
        started = true;
        if (typeof window !== 'undefined') {
            window.addEventListener('offline', onBrowserOffline);
            window.addEventListener('online', onBrowserOnline);
        }
        if (typeof document !== 'undefined') {
            if (document.body) ensureBadge();
            else document.addEventListener('DOMContentLoaded', ensureBadge);
        }
        startPingLoop();
    }

    window.ConnectionMonitor = {
        init,
        isWorkable,
        getStatus,
        onChange,
        reportChannelStatus,
        reportSendFailure,
        reportSendSuccess
    };

    init();
})();
