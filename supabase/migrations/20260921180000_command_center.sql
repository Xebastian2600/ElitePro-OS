-- ElitePro OS Lite — Command Center (Workstream C shared contract)
-- follow_ups, integration_events, list_team_members() + triggers + RLS.
-- Builds on Workstream A (leads/jobs/activity, 20260921000000_core_crm.sql)
-- and Workstream B (quotes, 20260921120000_quotes_pricing.sql). Reuses
-- public.set_updated_at() and public.log_activity(entity_type) from A.

-- ============================================================
-- follow_ups
-- Exactly one of lead_id/quote_id/job_id is set (num_nonnulls check).
-- Snoozing (see src/followup/due.ts snoozeUntil) only moves due_at and
-- leaves the row open — it does not touch status/outcome/completed_at.
-- ============================================================
create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid null references public.leads(id) on delete cascade,
  quote_id uuid null references public.quotes(id) on delete cascade,
  job_id uuid null references public.jobs(id) on delete cascade,
  due_at timestamptz not null,
  action text not null check (length(trim(action)) > 0),
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  owner_id uuid null references auth.users(id) on delete set null default auth.uid(),
  notes text null,
  outcome text null check (outcome in ('contacted', 'booked', 'lost', 'snoozed')),
  completed_at timestamptz null,
  created_by uuid null references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint follow_ups_one_source check (num_nonnulls(lead_id, quote_id, job_id) = 1),
  constraint follow_ups_done_requires_outcome check (
    status <> 'done' or (outcome is not null and outcome <> 'snoozed' and completed_at is not null)
  ),
  constraint follow_ups_open_has_no_completed_at check (
    status <> 'open' or completed_at is null
  )
);

create index follow_ups_status_due_idx on public.follow_ups (status, due_at);
create index follow_ups_lead_id_idx on public.follow_ups (lead_id);
create index follow_ups_quote_id_idx on public.follow_ups (quote_id);
create index follow_ups_job_id_idx on public.follow_ups (job_id);
create index follow_ups_owner_id_idx on public.follow_ups (owner_id);

create trigger follow_ups_set_updated_at before update on public.follow_ups
  for each row execute function public.set_updated_at();

create trigger follow_ups_log_activity after insert or update on public.follow_ups
  for each row execute function public.log_activity('follow_up');

-- ============================================================
-- integration_events
-- Event log for future Dialpad/GHL/HCP/CSV adapters (owned by src/integrations/**,
-- consumed via src/data/integrationEvents.ts). Starts EMPTY — no seed rows.
-- Append-only: authenticated may select/insert; no update/delete policy.
-- ============================================================
create table public.integration_events (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('dialpad', 'ghl', 'hcp', 'csv', 'manual')),
  direction text not null check (direction in ('inbound', 'outbound')),
  event_type text not null,
  status text not null default 'received' check (status in ('received', 'processed', 'failed', 'skipped')),
  entity_type text null,
  entity_id uuid null,
  payload jsonb not null default '{}',
  error text null,
  actor_id uuid null references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index integration_events_created_at_idx on public.integration_events (created_at desc);
create index integration_events_source_created_at_idx on public.integration_events (source, created_at desc);

-- ============================================================
-- Function: list_team_members
-- There is no users/profiles table (see docs/workstream-a-data.md §8), so
-- this is how the UI populates an owner picker or an activity "user" filter.
-- security definer to read auth.users; locked down to authenticated only.
-- ============================================================
create function public.list_team_members()
returns table(id uuid, email text)
language sql
stable
security definer
set search_path = public, auth
as $$
  select id, email::text from auth.users order by email;
$$;

revoke execute on function public.list_team_members() from public;
revoke execute on function public.list_team_members() from anon;
grant execute on function public.list_team_members() to authenticated;

-- ============================================================
-- RLS
-- ============================================================
alter table public.follow_ups enable row level security;
alter table public.integration_events enable row level security;

revoke all on public.follow_ups from anon;
revoke all on public.integration_events from anon;

create policy follow_ups_select on public.follow_ups for select to authenticated using (true);
create policy follow_ups_insert on public.follow_ups for insert to authenticated with check (true);
create policy follow_ups_update on public.follow_ups for update to authenticated using (true) with check (true);
-- No delete policy: follow-ups are cancelled, never deleted. Also revoke the
-- delete grant itself (not just the RLS policy) so a delete attempt errors
-- outright instead of silently affecting zero rows — same pattern as
-- Workstream A's read-only `activity` table.
revoke delete on public.follow_ups from authenticated;

create policy integration_events_select on public.integration_events for select to authenticated using (true);
create policy integration_events_insert on public.integration_events for insert to authenticated with check (true);
-- No update/delete policy: integration_events is an append-only log. Revoke
-- the grants too, so an update/delete attempt errors outright instead of
-- silently affecting zero rows.
revoke update, delete on public.integration_events from authenticated;

-- ============================================================
-- Guards
-- - A resolved (done/cancelled) follow-up is final: the client already
--   refuses to edit it, and this makes the DB refuse too.
-- - created_by / actor_id always come from the session, never from the
--   client payload, so audit fields can't be spoofed.
-- ============================================================
create function public.enforce_follow_up_final()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('done', 'cancelled') then
    raise exception 'follow-up is already resolved' using errcode = '23514';
  end if;
  new.created_by := old.created_by;
  return new;
end;
$$;

create trigger follow_ups_enforce_final before update on public.follow_ups
  for each row execute function public.enforce_follow_up_final();

create function public.stamp_follow_up_creator()
returns trigger
language plpgsql
as $$
begin
  new.created_by := auth.uid();
  return new;
end;
$$;

create trigger follow_ups_stamp_creator before insert on public.follow_ups
  for each row execute function public.stamp_follow_up_creator();

create function public.stamp_integration_event_actor()
returns trigger
language plpgsql
as $$
begin
  new.actor_id := auth.uid();
  return new;
end;
$$;

create trigger integration_events_stamp_actor before insert on public.integration_events
  for each row execute function public.stamp_integration_event_actor();

-- ============================================================
-- Metrics helper: distinct entities whose status changed to p_to within
-- [p_start, p_end). Counted in SQL so the result isn't capped by the API's
-- max-rows limit. security invoker: runs under the caller's RLS.
-- ============================================================
create function public.count_status_changes(p_entity_type text, p_to text, p_start timestamptz, p_end timestamptz)
returns integer
language sql
stable
security invoker
as $$
  select count(distinct entity_id)::int
  from public.activity
  where entity_type = p_entity_type
    and action = p_entity_type || '.status_changed'
    and metadata->>'to' = p_to
    and created_at >= p_start
    and created_at < p_end;
$$;

revoke execute on function public.count_status_changes(text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.count_status_changes(text, text, timestamptz, timestamptz) to authenticated;
