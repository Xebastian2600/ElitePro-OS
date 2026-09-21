-- ElitePro OS Lite — Core CRM (Workstream A shared contract)
-- customers, vehicles, leads, jobs, activity + triggers + RLS.

-- ============================================================
-- customers
-- ============================================================
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  phone text null,
  email text null,
  address text null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_contact_required check (phone is not null or email is not null),
  constraint customers_phone_e164 check (phone is null or phone ~ '^\+[0-9]{8,15}$'),
  constraint customers_email_lower check (email is null or email = lower(email))
);

create unique index customers_phone_unique on public.customers (phone) where phone is not null;
create unique index customers_email_unique on public.customers (email) where email is not null;
create index customers_name_search_idx on public.customers (lower(name));

-- ============================================================
-- vehicles
-- ============================================================
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  year int null check (year between 1950 and 2100),
  make text null,
  model text null,
  trim text null,
  vin text null,
  glass_type text null,
  adas_status text not null default 'unknown' check (adas_status in ('unknown', 'required', 'not_required')),
  verified_status text not null default 'unverified' check (verified_status in ('unverified', 'verified')),
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicles_vin_format check (vin is null or vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  constraint vehicles_identifiable check (vin is not null or (year is not null and make is not null and model is not null))
);

create unique index vehicles_vin_unique on public.vehicles (vin) where vin is not null;
create index vehicles_customer_id_idx on public.vehicles (customer_id);

-- ============================================================
-- leads
-- ============================================================
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid null references public.customers(id) on delete restrict,
  vehicle_id uuid null references public.vehicles(id) on delete set null,
  source text null,
  request text null,
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'quoted', 'follow_up', 'booked', 'lost')),
  assigned_user_id uuid null references auth.users(id) on delete set null,
  next_action text null,
  next_action_at timestamptz null,
  lost_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_lost_reason_required check (status <> 'lost' or (lost_reason is not null and length(trim(lost_reason)) > 0))
);

create index leads_status_idx on public.leads (status);
create index leads_customer_id_idx on public.leads (customer_id);

-- ============================================================
-- jobs
-- ============================================================
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  -- quote_id intentionally has NO foreign key here: the `quotes` table is owned by
  -- Workstream B. They will add `foreign key (quote_id) references quotes(id)` in a
  -- later migration once that table exists.
  quote_id uuid null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  status text not null default 'new' check (status in ('new', 'quoted', 'booked', 'parts_needed', 'scheduled', 'in_progress', 'completed', 'follow_up', 'lost')),
  appointment_at timestamptz null,
  address text null,
  technician_id uuid null references auth.users(id) on delete set null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index jobs_quote_id_unique on public.jobs (quote_id) where quote_id is not null;
create index jobs_status_idx on public.jobs (status);
create index jobs_customer_id_idx on public.jobs (customer_id);

-- ============================================================
-- activity
-- Owned by Workstream C going forward; created here as the baseline exactly
-- per the shared contract so Workstreams A/B can log against it from day one.
-- ============================================================
create table public.activity (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  actor_id uuid null references auth.users(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index activity_entity_idx on public.activity (entity_type, entity_id, created_at desc);
create index activity_created_at_idx on public.activity (created_at desc);

-- ============================================================
-- Triggers: set_updated_at
-- ============================================================
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger customers_set_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

create trigger vehicles_set_updated_at before update on public.vehicles
  for each row execute function public.set_updated_at();

create trigger leads_set_updated_at before update on public.leads
  for each row execute function public.set_updated_at();

create trigger jobs_set_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();

-- ============================================================
-- Trigger: enforce_vehicle_owner
-- ============================================================
create function public.enforce_vehicle_owner()
returns trigger
language plpgsql
as $$
declare
  v_customer_id uuid;
begin
  if new.vehicle_id is not null then
    if new.customer_id is null then
      raise exception 'vehicle does not belong to customer' using errcode = '23514';
    end if;

    select customer_id into v_customer_id from public.vehicles where id = new.vehicle_id;

    if v_customer_id is distinct from new.customer_id then
      raise exception 'vehicle does not belong to customer' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger leads_enforce_vehicle_owner before insert or update on public.leads
  for each row execute function public.enforce_vehicle_owner();

create trigger jobs_enforce_vehicle_owner before insert or update on public.jobs
  for each row execute function public.enforce_vehicle_owner();

-- ============================================================
-- Trigger: log_activity
-- ============================================================
create function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity_type text := TG_ARGV[0];
  v_changed text[];
  v_before jsonb := '{}';
  v_after jsonb := '{}';
  v_key text;
  v_has_status boolean;
begin
  if TG_OP = 'INSERT' then
    insert into public.activity (entity_type, entity_id, actor_id, action, metadata)
    values (v_entity_type, new.id, auth.uid(), v_entity_type || '.created', to_jsonb(new));
    return new;
  end if;

  -- TG_OP = 'UPDATE'
  select array_agg(key) into v_changed
  from jsonb_each(to_jsonb(old)) o(key, value)
  where key <> 'updated_at'
    and to_jsonb(new) -> key is distinct from o.value;

  if v_changed is null or array_length(v_changed, 1) is null then
    return new;
  end if;

  v_has_status := 'status' = any (v_changed);

  if v_has_status then
    for v_key in select unnest(v_changed) loop
      v_before := v_before || jsonb_build_object(v_key, to_jsonb(old) -> v_key);
      v_after := v_after || jsonb_build_object(v_key, to_jsonb(new) -> v_key);
    end loop;

    insert into public.activity (entity_type, entity_id, actor_id, action, metadata)
    values (
      v_entity_type,
      new.id,
      auth.uid(),
      v_entity_type || '.status_changed',
      jsonb_build_object(
        'from', to_jsonb(old) -> 'status',
        'to', to_jsonb(new) -> 'status',
        'changed', to_jsonb(v_changed),
        'before', v_before,
        'after', v_after
      ) || case
        when (to_jsonb(new) -> 'status') = to_jsonb('lost'::text) then jsonb_build_object('lost_reason', to_jsonb(new) -> 'lost_reason')
        else '{}'::jsonb
      end
    );
    return new;
  end if;

  for v_key in select unnest(v_changed) loop
    v_before := v_before || jsonb_build_object(v_key, to_jsonb(old) -> v_key);
    v_after := v_after || jsonb_build_object(v_key, to_jsonb(new) -> v_key);
  end loop;

  insert into public.activity (entity_type, entity_id, actor_id, action, metadata)
  values (
    v_entity_type,
    new.id,
    auth.uid(),
    v_entity_type || '.updated',
    jsonb_build_object('changed', to_jsonb(v_changed), 'before', v_before, 'after', v_after)
  );

  return new;
end;
$$;

create trigger customers_log_activity after insert or update on public.customers
  for each row execute function public.log_activity('customer');

create trigger vehicles_log_activity after insert or update on public.vehicles
  for each row execute function public.log_activity('vehicle');

create trigger leads_log_activity after insert or update on public.leads
  for each row execute function public.log_activity('lead');

create trigger jobs_log_activity after insert or update on public.jobs
  for each row execute function public.log_activity('job');

-- ============================================================
-- RLS
-- The anon key is the only key the browser ever holds. There are no delete
-- policies anywhere: the MVP never deletes rows.
-- ============================================================
alter table public.customers enable row level security;
alter table public.vehicles enable row level security;
alter table public.leads enable row level security;
alter table public.jobs enable row level security;
alter table public.activity enable row level security;

revoke all on public.customers from anon;
revoke all on public.vehicles from anon;
revoke all on public.leads from anon;
revoke all on public.jobs from anon;
revoke all on public.activity from anon;
-- authenticated keeps its default SELECT grant (needed for the policy below);
-- only writes are revoked, since only the SECURITY DEFINER trigger may write here.
revoke insert, update, delete on public.activity from authenticated;

create policy customers_select on public.customers for select to authenticated using (true);
create policy customers_insert on public.customers for insert to authenticated with check (true);
create policy customers_update on public.customers for update to authenticated using (true) with check (true);

create policy vehicles_select on public.vehicles for select to authenticated using (true);
create policy vehicles_insert on public.vehicles for insert to authenticated with check (true);
create policy vehicles_update on public.vehicles for update to authenticated using (true) with check (true);

create policy leads_select on public.leads for select to authenticated using (true);
create policy leads_insert on public.leads for insert to authenticated with check (true);
create policy leads_update on public.leads for update to authenticated using (true) with check (true);

create policy jobs_select on public.jobs for select to authenticated using (true);
create policy jobs_insert on public.jobs for insert to authenticated with check (true);
create policy jobs_update on public.jobs for update to authenticated using (true) with check (true);

-- activity: read-only for authenticated; only the SECURITY DEFINER trigger writes.
create policy activity_select on public.activity for select to authenticated using (true);
