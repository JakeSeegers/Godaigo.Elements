-- Opt-in mailing list for occasional human-written emails (2026-09-25,
-- migration mailing_list). At most one email a month (a promise in the UI,
-- not enforced here: the hermit sends them by hand).
--
-- Only players who ticked the box AND confirmed their recovery email are on
-- the list (the address comes from account_recovery, never stored twice).
-- RLS on, no client policies: RPCs only.

create table if not exists public.mailing_list (
  user_id       uuid primary key,
  opted_in      boolean not null default false,
  opted_in_at   timestamptz,
  opted_out_at  timestamptz,
  updated_at    timestamptz not null default now()
);
alter table public.mailing_list enable row level security;

create or replace function public.set_mailing_list(p_opt_in boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  insert into mailing_list (user_id, opted_in, opted_in_at, opted_out_at, updated_at)
  values (v_uid, coalesce(p_opt_in, false),
          case when p_opt_in then now() end, case when not coalesce(p_opt_in, false) then now() end, now())
  on conflict (user_id) do update set
    opted_in     = excluded.opted_in,
    opted_in_at  = case when excluded.opted_in then now() else mailing_list.opted_in_at end,
    opted_out_at = case when excluded.opted_in then mailing_list.opted_out_at else now() end,
    updated_at   = now();
end;
$$;

create or replace function public.my_mailing_list()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((select opted_in from mailing_list where user_id = auth.uid()), false);
$$;

-- For the hermit: who to send the monthly email to.
create or replace function public.hermit_mailing_list()
returns table (display_name text, email text, opted_in_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_hermit() then raise exception 'not authorized'; end if;
  return query
    select p.display_name, r.email, m.opted_in_at
    from mailing_list m
    join account_recovery r on r.user_id = m.user_id and r.verified
    left join user_profiles p on p.user_id = m.user_id
    where m.opted_in
    order by m.opted_in_at;
end;
$$;

revoke all on function public.set_mailing_list(boolean) from public, anon;
revoke all on function public.my_mailing_list() from public, anon;
revoke all on function public.hermit_mailing_list() from public, anon;
grant execute on function public.set_mailing_list(boolean) to authenticated;
grant execute on function public.my_mailing_list() to authenticated;
grant execute on function public.hermit_mailing_list() to authenticated;
