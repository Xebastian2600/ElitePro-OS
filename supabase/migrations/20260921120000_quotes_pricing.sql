-- ElitePro OS Lite — Quote Engine (Workstream B)
-- quotes, quote_items, pricing_rules + triggers + RLS, and the jobs<->quotes
-- integration pre-agreed with Workstream A (see 20260921000000_core_crm.sql).
--
-- Additive columns beyond the shared contract in src/quote/types.ts:
--   quotes.lost_reason        — required when status = 'lost' (mirrors leads.lost_reason)
--   quotes.pricing_snapshot   — the resolved PricingConfig captured at save time, so a
--                                reloaded quote recalculates to exactly the saved totals
--   quote_items.sort_order    — display/edit order within a quote
--   quote_items.created_at/updated_at — audit timestamps (mirrors vehicles/jobs)

-- ============================================================
-- quotes
-- ============================================================
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid null references public.leads(id) on delete set null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'presented', 'follow_up', 'approved', 'lost')),
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  tax numeric(12,2) not null default 0 check (tax >= 0),
  total numeric(12,2) not null default 0,
  notes text null,
  lost_reason text null,
  pricing_snapshot jsonb not null default '{}',
  created_by uuid null references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quotes_total_matches_sum check (total = subtotal + tax),
  constraint quotes_lost_reason_required check (status <> 'lost' or (lost_reason is not null and length(trim(lost_reason)) > 0))
);

create index quotes_status_idx on public.quotes (status);
create index quotes_lead_id_idx on public.quotes (lead_id);
create index quotes_customer_id_idx on public.quotes (customer_id);

-- ============================================================
-- quote_items
-- ============================================================
create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  type text not null check (type in ('glass', 'labor', 'adas', 'part', 'discount')),
  description text not null check (length(trim(description)) > 0),
  quantity numeric(10,2) not null check (quantity > 0),
  unit_cost numeric(12,2) null check (unit_cost is null or unit_cost >= 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  metadata jsonb not null default '{}',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index quote_items_quote_sort_idx on public.quote_items (quote_id, sort_order);

-- ============================================================
-- pricing_rules
-- One "open" (active_to is null) row per key at a time. set_pricing_rule()
-- closes the previous open row and inserts a new one, so history is kept.
-- ============================================================
create table public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  key text not null check (key in ('price.glass', 'price.labor', 'price.adas', 'price.part', 'tax', 'discount')),
  value jsonb not null,
  active_from timestamptz not null default now(),
  active_to timestamptz null check (active_to is null or active_to > active_from),
  updated_by uuid null references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create unique index pricing_rules_open_key_unique on public.pricing_rules (key) where active_to is null;

-- ============================================================
-- Function: set_pricing_rule
-- Closes the currently open row for p_key (if any) and inserts a new open
-- row, atomically (a single function call runs in one implicit transaction).
-- Client-side shape validation lives in src/quote/pricing.ts
-- (parsePricingRuleValue); this is only a minimal backstop.
-- ============================================================
create function public.set_pricing_rule(p_key text, p_value jsonb)
returns public.pricing_rules
language plpgsql
security invoker
as $$
declare
  v_row public.pricing_rules;
begin
  if jsonb_typeof(p_value) <> 'object' then
    raise exception 'pricing rule value must be a JSON object' using errcode = '23514';
  end if;

  update public.pricing_rules
  set active_to = now()
  where key = p_key and active_to is null;

  insert into public.pricing_rules (key, value)
  values (p_key, p_value)
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.set_pricing_rule(text, jsonb) from public;
grant execute on function public.set_pricing_rule(text, jsonb) to authenticated;

-- ============================================================
-- Triggers: set_updated_at (reuse Workstream A's function)
-- ============================================================
create trigger quotes_set_updated_at before update on public.quotes
  for each row execute function public.set_updated_at();

create trigger quote_items_set_updated_at before update on public.quote_items
  for each row execute function public.set_updated_at();

-- ============================================================
-- Trigger: enforce_vehicle_owner (reuse Workstream A's function — it only
-- looks at NEW.customer_id / NEW.vehicle_id, so it works unchanged here)
-- ============================================================
create trigger quotes_enforce_vehicle_owner before insert or update on public.quotes
  for each row execute function public.enforce_vehicle_owner();

-- ============================================================
-- Trigger: enforce_quote_lead
-- A quote's lead (when set) must belong to the same customer as the quote.
-- ============================================================
create function public.enforce_quote_lead()
returns trigger
language plpgsql
as $$
declare
  v_customer_id uuid;
begin
  if new.lead_id is not null then
    select customer_id into v_customer_id from public.leads where id = new.lead_id;

    if v_customer_id is distinct from new.customer_id then
      raise exception 'lead does not belong to customer' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger quotes_enforce_lead before insert or update on public.quotes
  for each row execute function public.enforce_quote_lead();

-- ============================================================
-- Trigger: enforce_quote_status
-- Enforces QUOTE_TRANSITIONS from src/quote/types.ts as a DB-level backstop
-- to validateQuoteTransition() in src/quote/status.ts. Also requires at
-- least one non-discount line before a quote can be presented or approved,
-- and clears lost_reason when a lost quote is reopened to draft.
-- ============================================================
create function public.enforce_quote_status()
returns trigger
language plpgsql
as $$
declare
  v_allowed text[];
  v_has_priced_item boolean;
begin
  v_allowed := case old.status
    when 'draft' then array['presented', 'lost']
    when 'presented' then array['draft', 'follow_up', 'approved', 'lost']
    when 'follow_up' then array['presented', 'approved', 'lost']
    when 'approved' then array[]::text[]
    when 'lost' then array['draft']
    else array[]::text[]
  end;

  if not (new.status = any (v_allowed)) then
    raise exception 'quote status cannot move from % to %', old.status, new.status using errcode = '23514';
  end if;

  if new.status in ('presented', 'approved') then
    select exists(
      select 1 from public.quote_items where quote_id = new.id and type <> 'discount'
    ) into v_has_priced_item;

    if not v_has_priced_item then
      raise exception 'quote needs at least one priced item before it can be %', new.status using errcode = '23514';
    end if;
  end if;

  if old.status = 'lost' and new.status = 'draft' then
    new.lost_reason := null;
  end if;

  return new;
end;
$$;

create trigger quotes_enforce_status before update of status on public.quotes
  for each row when (old.status is distinct from new.status)
  execute function public.enforce_quote_status();

-- ============================================================
-- Trigger: enforce_quote_lock
-- Approved/lost quotes keep their priced content frozen; only a status
-- change (lost -> draft) or notes may touch them.
-- ============================================================
create function public.enforce_quote_lock()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('approved', 'lost') and old.status = new.status and (
    new.customer_id is distinct from old.customer_id
    or new.vehicle_id is distinct from old.vehicle_id
    or new.lead_id is distinct from old.lead_id
    or new.subtotal is distinct from old.subtotal
    or new.tax is distinct from old.tax
    or new.total is distinct from old.total
    or new.pricing_snapshot is distinct from old.pricing_snapshot
  ) then
    raise exception 'quote is locked' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger quotes_enforce_lock before update on public.quotes
  for each row execute function public.enforce_quote_lock();

-- ============================================================
-- Trigger: log_activity('quote') (reuse Workstream A's function)
-- ============================================================
create trigger quotes_log_activity after insert or update on public.quotes
  for each row execute function public.log_activity('quote');

-- ============================================================
-- Trigger: quote_items lock
-- Once a quote is approved or lost, its items are frozen.
-- ============================================================
create function public.enforce_quote_item_lock()
returns trigger
language plpgsql
as $$
declare
  v_status text;
  v_quote_id uuid;
begin
  v_quote_id := coalesce(new.quote_id, old.quote_id);
  select status into v_status from public.quotes where id = v_quote_id;

  if v_status in ('approved', 'lost') then
    raise exception 'quote is locked' using errcode = '23514';
  end if;

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger quote_items_lock before insert or update or delete on public.quote_items
  for each row execute function public.enforce_quote_item_lock();

-- ============================================================
-- Trigger: log_quote_item_activity
-- quote_items has no direct RLS write-log of its own; log against the
-- parent quote's activity feed instead (entity_type 'quote').
-- ============================================================
create function public.log_quote_item_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed text[];
  v_before jsonb := '{}';
  v_after jsonb := '{}';
  v_key text;
begin
  if TG_OP = 'INSERT' then
    insert into public.activity (entity_type, entity_id, actor_id, action, metadata)
    values ('quote', new.quote_id, auth.uid(), 'quote.item_added', to_jsonb(new));
    return new;
  end if;

  if TG_OP = 'DELETE' then
    insert into public.activity (entity_type, entity_id, actor_id, action, metadata)
    values ('quote', old.quote_id, auth.uid(), 'quote.item_removed', to_jsonb(old));
    return old;
  end if;

  -- TG_OP = 'UPDATE': skip no-op updates (e.g. a save that reorders other rows only)
  select array_agg(key) into v_changed
  from jsonb_each(to_jsonb(old)) o(key, value)
  where key <> 'updated_at'
    and to_jsonb(new) -> key is distinct from o.value;

  if v_changed is null or array_length(v_changed, 1) is null then
    return new;
  end if;

  for v_key in select unnest(v_changed) loop
    v_before := v_before || jsonb_build_object(v_key, to_jsonb(old) -> v_key);
    v_after := v_after || jsonb_build_object(v_key, to_jsonb(new) -> v_key);
  end loop;

  insert into public.activity (entity_type, entity_id, actor_id, action, metadata)
  values (
    'quote',
    new.quote_id,
    auth.uid(),
    'quote.item_updated',
    jsonb_build_object('changed', to_jsonb(v_changed), 'before', v_before, 'after', v_after)
  );

  return new;
end;
$$;

create trigger quote_items_log_activity after insert or update or delete on public.quote_items
  for each row execute function public.log_quote_item_activity();

-- ============================================================
-- Trigger: log_activity('pricing_rule') (reuse Workstream A's function)
-- ============================================================
create trigger pricing_rules_log_activity after insert or update on public.pricing_rules
  for each row execute function public.log_activity('pricing_rule');

-- ============================================================
-- jobs <-> quotes integration
-- Pre-agreed with Workstream A (see the comment on jobs.quote_id in
-- 20260921000000_core_crm.sql). NOT VALID so existing dev rows with random
-- quote_ids don't break the migration; new/updated rows are still checked.
-- ============================================================
alter table public.jobs
  add constraint jobs_quote_id_fkey foreign key (quote_id) references public.quotes(id) on delete restrict not valid;

create function public.enforce_job_quote()
returns trigger
language plpgsql
as $$
declare
  v_status text;
  v_customer_id uuid;
  v_vehicle_id uuid;
begin
  if new.quote_id is not null then
    select status, customer_id, vehicle_id into v_status, v_customer_id, v_vehicle_id
    from public.quotes where id = new.quote_id;

    if not found then
      -- Nonexistent quote_id: let the (NOT VALID but still-enforced-on-write) FK reject it.
      return new;
    end if;

    if v_status <> 'approved' then
      raise exception 'quote must be approved before creating a job' using errcode = '23514';
    end if;

    if v_customer_id is distinct from new.customer_id or v_vehicle_id is distinct from new.vehicle_id then
      raise exception 'job does not match quote' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger jobs_enforce_quote before insert or update of quote_id on public.jobs
  for each row execute function public.enforce_job_quote();

-- ============================================================
-- RLS
-- ============================================================
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.pricing_rules enable row level security;

revoke all on public.quotes from anon;
revoke all on public.quote_items from anon;
revoke all on public.pricing_rules from anon;

create policy quotes_select on public.quotes for select to authenticated using (true);
create policy quotes_insert on public.quotes for insert to authenticated with check (true);
create policy quotes_update on public.quotes for update to authenticated using (true) with check (true);
-- No delete policy on quotes: the MVP never deletes rows.

create policy quote_items_select on public.quote_items for select to authenticated using (true);
create policy quote_items_insert on public.quote_items for insert to authenticated with check (true);
create policy quote_items_update on public.quote_items for update to authenticated using (true) with check (true);
create policy quote_items_delete on public.quote_items for delete to authenticated using (true);
-- Items may be removed from an editable quote; the quote_items_lock trigger
-- protects items once the parent quote is approved or lost.

create policy pricing_rules_select on public.pricing_rules for select to authenticated using (true);
-- insert/update are required for set_pricing_rule (security invoker) to run as the caller.
create policy pricing_rules_insert on public.pricing_rules for insert to authenticated with check (true);
create policy pricing_rules_update on public.pricing_rules for update to authenticated using (true) with check (true);
-- Rule values are immutable history: callers may only close a row (active_to).
revoke update on public.pricing_rules from authenticated;
grant update (active_to) on public.pricing_rules to authenticated;
-- No delete policy on pricing_rules: history is kept via active_to.
