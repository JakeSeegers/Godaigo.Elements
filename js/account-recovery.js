// account-recovery.js: optional recovery email + "Forgot password?".
//
// window.AccountRecovery:
//   openForgot()             sign-in screen "Forgot password?" modal
//   renderSettings(el)       Profile > Settings > Account section
// Also handles, on page load:
//   ?recovery_verify=TOKEN   the "confirm your email" link from the email
//   #...type=recovery        the password reset link (Supabase signs the
//                            player in, then we ask for a new password)
//
// Server side: supabase/functions/account-recovery (sends email via Resend,
// enforces the rate limits) and sql/account-recovery.sql. Needs the global
// `supabase` client from multiplayer-state.js, which also sets
// window.__godaigoRecoveryLink before the client reads the URL hash.
(function () {
    const FN = 'account-recovery';

    function gameUrl() {
        return location.origin + location.pathname;
    }

    function esc(s) {
        return String(s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    const ERRORS = {
        bad_email: 'That does not look like a valid email address.',
        rate_limited: 'Too many emails for now (2 per hour). Please try again later.',
        not_signed_in: 'Please sign in again, then try once more.',
        email_not_configured: 'Email is not set up on the server yet. Please tell the developer.',
        invalid: 'This link is invalid or has expired. Add your email again to get a new link.',
    };
    function errorText(code) {
        return ERRORS[code] || 'Something went wrong. Please try again later.';
    }

    // Returns { ok, error } from the edge function, also for non-2xx replies.
    async function call(action, payload) {
        try {
            const { data, error } = await supabase.functions.invoke(FN, { body: { action, ...payload } });
            if (!error) return data || { ok: false };
            try { return await error.context.json(); } catch (e) { return { ok: false, error: 'server_error' }; }
        } catch (e) {
            return { ok: false, error: 'server_error' };
        }
    }

    // ── Small modal helper ───────────────────────────────────────
    function modal(title, bodyHtml) {
        document.getElementById('acct-overlay')?.remove();
        const overlay = document.createElement('div');
        overlay.id = 'acct-overlay';
        overlay.innerHTML = `
            <div class="acct-modal" role="dialog" aria-label="${esc(title)}">
                <div class="acct-title">${esc(title)}</div>
                <div class="acct-body">${bodyHtml}</div>
            </div>`;
        document.body.appendChild(overlay);
        return overlay;
    }
    function closeModal() { document.getElementById('acct-overlay')?.remove(); }
    function message(title, text) {
        const o = modal(title, `<p class="acct-text">${esc(text)}</p>
            <div class="acct-actions"><button class="acct-btn" data-close>OK</button></div>`);
        o.querySelector('[data-close]').onclick = closeModal;
    }

    // ── Forgot password (sign-in screen) ─────────────────────────
    function openForgot() {
        const prefill = document.getElementById('auth-username')?.value.trim() || '';
        const o = modal('Forgot password', `
            <p class="acct-text">Enter your username. If your account has a confirmed recovery email, we will send it a link to choose a new password.</p>
            <input type="text" class="acct-input" id="acct-forgot-user" placeholder="Username" value="${esc(prefill)}" maxlength="40">
            <div class="acct-status" id="acct-forgot-status"></div>
            <div class="acct-actions">
                <button class="acct-btn acct-btn-secondary" data-close>Cancel</button>
                <button class="acct-btn" id="acct-forgot-send">Send link</button>
            </div>`);
        o.querySelector('[data-close]').onclick = closeModal;
        const btn = o.querySelector('#acct-forgot-send');
        btn.onclick = async () => {
            const username = o.querySelector('#acct-forgot-user').value.trim();
            const status = o.querySelector('#acct-forgot-status');
            if (!username) { status.textContent = 'Please enter your username.'; return; }
            btn.disabled = true;
            status.textContent = 'Sending...';
            await call('request_reset', { username, redirect: gameUrl() });
            // Always the same answer, so nobody can use this to learn who has an email.
            message('Check your email',
                'If that account has a confirmed recovery email, a reset link is on its way. ' +
                'It can take a few minutes. Check your spam folder too. No recovery email? Ask the developer for help.');
        };
    }

    // ── Profile > Settings > Account ─────────────────────────────
    async function renderSettings(el) {
        if (!el) return;
        const { data: { session } = {} } = await supabase.auth.getSession();
        if (!session) {
            el.innerHTML = '<div class="gami-settings-desc">Sign in to manage your account.</div>';
            return;
        }
        el.innerHTML = '<div class="gami-settings-desc">Loading...</div>';
        const [{ data, error }, nlRes] = await Promise.all([
            supabase.rpc('my_recovery_email'),
            supabase.rpc('my_mailing_list'),
        ]);
        const row = !error && data && data[0];
        const newsletter = nlRes?.data === true;

        let statusHtml;
        if (!row) statusHtml = 'No recovery email yet. Without one, a forgotten password cannot be reset.';
        else if (row.verified) statusHtml = `Recovery email: <b>${esc(row.email_masked)}</b> (confirmed)`;
        else statusHtml = `Recovery email: <b>${esc(row.email_masked)}</b> (waiting for you to click the link in the email)`;

        el.innerHTML = `
            <div class="gami-settings-row acct-settings">
                <div class="gami-settings-label">
                    <div class="gami-settings-name">Recovery Email</div>
                    <div class="gami-settings-desc">Optional. Used only to reset your password. Other players never see it.</div>
                    <div class="gami-settings-desc acct-current">${statusHtml}</div>
                    <input type="email" class="acct-input" id="acct-email-input" placeholder="${row ? 'New email' : 'you@example.com'}" maxlength="254">
                    <div class="acct-status" id="acct-email-status"></div>
                    <div class="acct-actions acct-actions-left">
                        <button class="acct-btn" id="acct-email-save">${row ? 'Change email' : 'Add email'}</button>
                        ${row ? '<button class="acct-btn acct-btn-secondary" id="acct-email-remove">Remove</button>' : ''}
                    </div>
                </div>
            </div>
            <div class="gami-settings-row acct-settings">
                <div class="gami-settings-label">
                    <div class="gami-settings-name">News Emails</div>
                    <label class="auth-check">
                        <input type="checkbox" id="acct-newsletter"${newsletter ? ' checked' : ''}>
                        <span class="gami-settings-desc">Send me news about Godaigo, written by the developer. At most one email a month.${row && row.verified ? '' : ' Needs a confirmed email above.'}</span>
                    </label>
                </div>
            </div>`;
        const nl = el.querySelector('#acct-newsletter');
        if (nl) nl.onchange = async () => {
            nl.disabled = true;
            await supabase.rpc('set_mailing_list', { p_opt_in: nl.checked });
            nl.disabled = false;
        };

        const status = el.querySelector('#acct-email-status');
        el.querySelector('#acct-email-save').onclick = async (ev) => {
            const email = el.querySelector('#acct-email-input').value.trim();
            if (!email) { status.textContent = 'Please enter an email address.'; return; }
            ev.target.disabled = true;
            status.textContent = 'Sending...';
            const res = await call('set_email', { email, redirect: gameUrl() });
            if (res.ok) {
                status.textContent = 'Check your inbox and click the link to confirm. Check spam too.';
                renderSettings(el).then(() => {
                    const s = el.querySelector('#acct-email-status');
                    if (s) s.textContent = 'Check your inbox and click the link to confirm. Check spam too.';
                });
            } else {
                status.textContent = errorText(res.error);
                ev.target.disabled = false;
            }
        };
        const removeBtn = el.querySelector('#acct-email-remove');
        if (removeBtn) removeBtn.onclick = async () => {
            removeBtn.disabled = true;
            await supabase.rpc('remove_my_recovery_email');
            renderSettings(el);
        };
    }

    // ── "Confirm your email" link ────────────────────────────────
    async function handleVerifyLink() {
        const params = new URLSearchParams(location.search);
        const token = params.get('recovery_verify');
        if (!token) return;
        params.delete('recovery_verify');
        const clean = location.pathname + (params.toString() ? '?' + params : '') + location.hash;
        history.replaceState(null, '', clean);
        const res = await call('verify', { token });
        if (res.ok) message('Email confirmed', 'Your recovery email is confirmed. If you ever forget your password, use "Forgot password?" on the sign-in screen.');
        else message('Link not valid', errorText(res.error || 'invalid'));
    }

    // ── Password reset link: choose a new password ───────────────
    let resetShown = false;
    function openNewPassword() {
        if (resetShown) return;
        resetShown = true;
        const o = modal('Choose a new password', `
            <p class="acct-text">Enter a new password for your account.</p>
            <input type="password" class="acct-input" id="acct-pw1" placeholder="New password (6+ characters)">
            <input type="password" class="acct-input" id="acct-pw2" placeholder="Type it again">
            <div class="acct-status" id="acct-pw-status"></div>
            <div class="acct-actions"><button class="acct-btn" id="acct-pw-save">Save password</button></div>`);
        const btn = o.querySelector('#acct-pw-save');
        btn.onclick = async () => {
            const p1 = o.querySelector('#acct-pw1').value;
            const p2 = o.querySelector('#acct-pw2').value;
            const status = o.querySelector('#acct-pw-status');
            if (p1.length < 6) { status.textContent = 'Password must be at least 6 characters.'; return; }
            if (p1 !== p2) { status.textContent = 'The two passwords do not match.'; return; }
            btn.disabled = true;
            status.textContent = 'Saving...';
            const { error } = await supabase.auth.updateUser({ password: p1 });
            if (error) {
                status.textContent = error.message || 'Could not save the password. Please try again.';
                btn.disabled = false;
                return;
            }
            message('Password changed', 'Your new password is saved. You are signed in.');
        };
    }

    try {
        supabase.auth.onAuthStateChange((event) => {
            if (event === 'PASSWORD_RECOVERY') openNewPassword();
        });
    } catch (e) { /* no Supabase client (offline) */ }

    function onReady() {
        handleVerifyLink();
        // The reset link's #type=recovery hash may already be consumed (and the
        // PASSWORD_RECOVERY event already fired) before this script loaded, so
        // multiplayer-state.js remembers it for us.
        if (window.__godaigoRecoveryLink) {
            supabase.auth.getSession().then(({ data }) => {
                if (data?.session) openNewPassword();
            }).catch(() => {});
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
    else onReady();

    // Right after registering: send the confirmation link for the email
    // typed into the register form, and tell the player to check their inbox.
    async function setEmailAfterRegister(email) {
        const res = await call('set_email', { email, redirect: gameUrl() });
        if (res.ok) message('Check your email', 'We sent a link to confirm your email. Click it to finish (check spam too). You can change this later in Profile > Settings.');
        else message('Email not saved', errorText(res.error) + ' You can add it later in Profile > Settings.');
    }

    window.AccountRecovery = { openForgot, renderSettings, setEmailAfterRegister };
})();
