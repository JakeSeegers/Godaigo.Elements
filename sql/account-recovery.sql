-- Optional recovery email for password resets.
-- Applied 2026-09-24 (migration account_recovery).
--
-- Accounts sign in with username + password; the auth email is a fake
-- "<username>@godaigo.game" address (js/lobby.js authLogin), so Supabase's
-- own reset email has nowhere to go. Players can add a REAL email here.
-- The edge function supabase/functions/account-recovery sends the emails
-- (via Resend) and enforces the rate limits. Clients never read these
-- tables directly: RLS is on with no policies, and the only client access
-- is the two small RPCs at the bottom.

create table if not exists public.account_recovery (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  email             text not null,
  verified          boolean not null default false,
  verify_token_hash text,
  verify_expires    timestamptz,
  updated_at        timestamptz not null default now()
);
alter table public.account_recovery enable row level security;

-- One row per email sent. Used for the rate limits (per account, per
-- address, whole game per day).
create table if not exists public.recovery_email_log (
  id       bigserial primary key,
  user_id  uuid,
  email    text,
  kind     text not null check (kind in ('verify', 'reset')),
  sent_at  timestamptz not null default now()
);
alter table public.recovery_email_log enable row level security;
create index if not exists recovery_email_log_user_idx  on public.recovery_email_log (user_id, sent_at);
create index if not exists recovery_email_log_email_idx on public.recovery_email_log (email, sent_at);
create index if not exists recovery_email_log_sent_idx  on public.recovery_email_log (sent_at);

-- Server-only: find the account for a sign-in address and its recovery email.
create or replace function public.recovery_lookup(p_login_email text)
returns table (user_id uuid, email text, verified boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  select u.id, r.email, coalesce(r.verified, false)
  from auth.users u
  left join public.account_recovery r on r.user_id = u.id
  where lower(u.email) = lower(p_login_email)
  limit 1;
$$;
revoke all on function public.recovery_lookup(text) from public, anon, authenticated;
grant execute on function public.recovery_lookup(text) to service_role;

-- Client: the signed-in player's own recovery email, masked (j***@gmail.com).
create or replace function public.my_recovery_email()
returns table (email_masked text, verified boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    left(split_part(r.email, '@', 1), 1) || '***@' || split_part(r.email, '@', 2),
    r.verified
  from public.account_recovery r
  where r.user_id = auth.uid();
$$;
revoke all on function public.my_recovery_email() from public, anon;
grant execute on function public.my_recovery_email() to authenticated;

-- Client: remove the signed-in player's own recovery email.
create or replace function public.remove_my_recovery_email()
returns void
language sql
security definer
set search_path to 'public'
as $$
  delete from public.account_recovery where user_id = auth.uid();
$$;
revoke all on function public.remove_my_recovery_email() from public, anon;
grant execute on function public.remove_my_recovery_email() to authenticated;
