// account-recovery: optional recovery email + password reset.
//
// Deployed to Supabase as the "account-recovery" edge function. Tables and
// RPCs: sql/account-recovery.sql. Client: js/account-recovery.js.
//
// Actions (POST JSON { action, ... }):
//   set_email      { email, redirect }  signed-in: save an email, send a confirm link
//   verify         { token }            confirm link clicked: mark the email verified
//   request_reset  { username, redirect } send a password reset link to the
//                                        account's VERIFIED recovery email; `username`
//                                        may also be that email (one link per account, max 3)
//
// Rate limits (all emails count, confirm + reset):
//   2 per account per hour, 3 per address per day, 90 for the whole game per
//   day (Resend's free plan allows 100 a day).
//
// Secrets: RESEND_API_KEY, EMAIL_FROM (e.g. "Godaigo <noreply@mail.example.com>"),
// optional SITE_URLS (comma-separated extra allowed game URLs).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from "npm:@supabase/supabase-js@2";

const PER_ACCOUNT_PER_HOUR = 2;
const PER_ADDRESS_PER_DAY = 3;
const GLOBAL_PER_DAY = 90;
const VERIFY_TTL_HOURS = 24;
const LOGIN_EMAIL_DOMAIN = "@godaigo.game"; // must match js/lobby.js authLogin()

// First entry = fallback link target when a request names no allowed site.
const DEFAULT_SITES = [
  "https://playgodaigo.com/",
  "https://godaigo.aikijake.workers.dev/",
  "https://jakeseegers.github.io/Godaigo.Elements/", // old address, until players have moved
  "http://localhost:3333/",
];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function allowedSites(): string[] {
  const extra = (Deno.env.get("SITE_URLS") || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  return [...extra, ...DEFAULT_SITES];
}

// Only ever send links back to the game itself.
function safeRedirect(requested: unknown): string {
  const sites = allowedSites();
  if (typeof requested === "string") {
    const hit = sites.find((s) => requested === s || requested.startsWith(s));
    if (hit) return hit;
  }
  return sites[0];
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hourAgo() { return new Date(Date.now() - 3600_000).toISOString(); }
function dayAgo() { return new Date(Date.now() - 86400_000).toISOString(); }

async function countLog(filter: { user_id?: string; email?: string }, since: string) {
  let q = admin.from("recovery_email_log").select("id", { count: "exact", head: true }).gte("sent_at", since);
  if (filter.user_id) q = q.eq("user_id", filter.user_id);
  if (filter.email) q = q.eq("email", filter.email);
  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

// true = allowed to send one more email
async function withinLimits(userId: string, email: string): Promise<boolean> {
  const [acct, addr, all] = await Promise.all([
    countLog({ user_id: userId }, hourAgo()),
    countLog({ email }, dayAgo()),
    countLog({}, dayAgo()),
  ]);
  return acct < PER_ACCOUNT_PER_HOUR && addr < PER_ADDRESS_PER_DAY && all < GLOBAL_PER_DAY;
}

async function sendEmail(to: string, subject: string, text: string, html: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("EMAIL_FROM");
  if (!key || !from) throw new Error("email_not_configured");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, text, html }),
  });
  if (!res.ok) throw new Error(`resend_${res.status}: ${await res.text()}`);
}

function emailHtml(heading: string, body: string, buttonText: string, link: string, footer: string) {
  return `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#222">
  <h2 style="margin:0 0 12px">${heading}</h2>
  <p style="line-height:1.5">${body}</p>
  <p style="margin:24px 0"><a href="${link}" style="background:#6b3fa0;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">${buttonText}</a></p>
  <p style="font-size:12px;color:#666;line-height:1.5">${footer}</p>
</div>`;
}

async function setEmail(req: Request, body: any) {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: userData } = await admin.auth.getUser(jwt);
  const user = userData?.user;
  if (!user) return json({ ok: false, error: "not_signed_in" }, 401);

  const email = String(body.email || "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.endsWith(LOGIN_EMAIL_DOMAIN)) {
    return json({ ok: false, error: "bad_email" }, 400);
  }
  if (!(await withinLimits(user.id, email))) return json({ ok: false, error: "rate_limited" }, 429);

  const token = randomToken();
  const { error: upErr } = await admin.from("account_recovery").upsert({
    user_id: user.id,
    email,
    verified: false,
    verify_token_hash: await sha256Hex(token),
    verify_expires: new Date(Date.now() + VERIFY_TTL_HOURS * 3600_000).toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (upErr) throw upErr;

  const link = `${safeRedirect(body.redirect)}?recovery_verify=${token}`;
  const username = user.user_metadata?.username || "your account";
  await sendEmail(
    email,
    "Confirm your Godaigo recovery email",
    `Hi ${username},\n\nConfirm this email so you can reset your Godaigo password if you forget it:\n${link}\n\nThe link works for ${VERIFY_TTL_HOURS} hours. If you did not ask for this, ignore this email.`,
    emailHtml(
      "Confirm your recovery email",
      `Hi ${username}. Confirm this email so you can reset your Godaigo password if you ever forget it.`,
      "Confirm email",
      link,
      `The link works for ${VERIFY_TTL_HOURS} hours. If you did not ask for this, you can ignore this email.`,
    ),
  );
  await admin.from("recovery_email_log").insert({ user_id: user.id, email, kind: "verify" });
  return json({ ok: true });
}

async function verify(body: any) {
  const token = String(body.token || "");
  if (!/^[0-9a-f]{64}$/.test(token)) return json({ ok: false, error: "invalid" }, 400);
  const hash = await sha256Hex(token);
  const { data, error } = await admin.from("account_recovery")
    .update({ verified: true, verify_token_hash: null, verify_expires: null, updated_at: new Date().toISOString() })
    .eq("verify_token_hash", hash)
    .gt("verify_expires", new Date().toISOString())
    .select("user_id");
  if (error) throw error;
  if (!data?.length) return json({ ok: false, error: "invalid" }, 400);
  return json({ ok: true });
}

async function requestReset(body: any) {
  // Same answer whether or not the account or email exists, so this can't
  // be used to find out who has a recovery email.
  const generic = json({ ok: true });
  const input = String(body.username || "").trim();

  // Players type either their username or their recovery email.
  // [{ user_id, login_email, email }] with a CONFIRMED recovery email only.
  let targets: { user_id: string; login_email: string; email: string }[] = [];
  if (input.includes("@")) {
    if (input.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)) return generic;
    const { data, error } = await admin.rpc("recovery_lookup_by_email", { p_email: input.toLowerCase() });
    if (error) throw error;
    targets = data || [];
  } else {
    if (!/^[a-zA-Z0-9_\-.]{1,40}$/.test(input)) return generic;
    const loginEmail = input.toLowerCase() + LOGIN_EMAIL_DOMAIN;
    const { data: rows, error } = await admin.rpc("recovery_lookup", { p_login_email: loginEmail });
    if (error) throw error;
    const row = rows?.[0];
    if (row?.user_id && row.email && row.verified) targets = [{ user_id: row.user_id, login_email: loginEmail, email: row.email }];
  }

  for (const t of targets.slice(0, 3)) {
    if (!(await withinLimits(t.user_id, t.email))) continue;
    const username = t.login_email.replace(LOGIN_EMAIL_DOMAIN, "");
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: t.login_email,
      options: { redirectTo: safeRedirect(body.redirect) },
    });
    if (linkErr) throw linkErr;
    const link = linkData.properties.action_link;

    await sendEmail(
      t.email,
      "Reset your Godaigo password",
      `Someone asked to reset the password for the Godaigo account "${username}".\n\nChoose a new password here:\n${link}\n\nIf this was not you, ignore this email. Your password stays the same.`,
      emailHtml(
        "Reset your password",
        `Someone asked to reset the password for the Godaigo account <b>${username}</b>. Click below to choose a new one.`,
        "Choose a new password",
        link,
        "If this was not you, ignore this email. Your password stays the same.",
      ),
    );
    await admin.from("recovery_email_log").insert({ user_id: t.user_id, email: t.email, kind: "reset" });
  }
  return generic;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { /* empty body */ }
  try {
    switch (body.action) {
      case "set_email": return await setEmail(req, body);
      case "verify": return await verify(body);
      case "request_reset": return await requestReset(body);
      default: return json({ ok: false, error: "unknown_action" }, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("account-recovery error:", msg);
    if (msg === "email_not_configured") return json({ ok: false, error: "email_not_configured" }, 500);
    // request_reset always looks the same to the caller
    if (body.action === "request_reset") return json({ ok: true });
    return json({ ok: false, error: "server_error" }, 500);
  }
});
