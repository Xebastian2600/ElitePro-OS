# Workstream C: Command Center + Follow-Up + Activity + Analytics — Data Layer Contract

Schema and data-access API for follow-ups, the cross-entity activity feed, Command Center metrics,
team lookup, and the `integration_events` log. Builds on Workstream A's core CRM
(`docs/workstream-a-data.md`) and Workstream B's quote engine (`docs/workstream-b-data.md`). Shared
TypeScript contract: `src/followup/types.ts` (not modified by this workstream).

## 1. Tables & Columns

**follow_ups**
| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | – | gen_random_uuid() | PRIMARY KEY |
| lead_id | uuid | ✓ | – | FK leads; CASCADE on delete |
| quote_id | uuid | ✓ | – | FK quotes; CASCADE on delete |
| job_id | uuid | ✓ | – | FK jobs; CASCADE on delete |
| due_at | timestamptz | – | – | – |
| action | text | – | – | CHECK non-blank |
| status | text | – | 'open' | IN (open, done, cancelled) |
| owner_id | uuid | ✓ | auth.uid() | FK auth.users; SET NULL on delete |
| notes | text | ✓ | – | – |
| **outcome** | text | ✓ | – | **Additive.** IN (contacted, booked, lost, snoozed) |
| **completed_at** | timestamptz | ✓ | – | **Additive.** Set when status moves to 'done' |
| **created_by** | uuid | ✓ | auth.uid() | **Additive.** FK auth.users; SET NULL on delete |
| **created_at / updated_at** | timestamptz | – | now() | **Additive** (mirrors vehicles/jobs/quotes) |
| – | – | – | – | CHECK `num_nonnulls(lead_id, quote_id, job_id) = 1` (exactly one source) |
| – | – | – | – | CHECK status='done' requires outcome not null, outcome <> 'snoozed', and completed_at not null |
| – | – | – | – | CHECK status='open' requires completed_at is null |

Indexes: `(status, due_at)`, `lead_id`, `quote_id`, `job_id`, `owner_id`.

Snoozing (`recordFollowUpOutcome(id, { outcome: 'snoozed', snooze_until })`) only moves `due_at` —
it leaves `status = 'open'` and `outcome = null`. The snooze itself shows up in the activity feed as
a `follow_up.updated` (due_at changed), not a status change.

**integration_events**
| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | – | gen_random_uuid() | PRIMARY KEY |
| source | text | – | – | IN (dialpad, ghl, hcp, csv, manual) |
| direction | text | – | – | IN (inbound, outbound) |
| event_type | text | – | – | Free-form, e.g. "call.completed", "contact.imported" |
| status | text | – | 'received' | IN (received, processed, failed, skipped) |
| entity_type | text | ✓ | – | Not a DB FK (may reference any entity type) |
| entity_id | uuid | ✓ | – | – |
| payload | jsonb | – | '{}' | Raw adapter payload |
| error | text | ✓ | – | Set when status = 'failed' |
| actor_id | uuid | ✓ | auth.uid() | FK auth.users; SET NULL on delete |
| created_at | timestamptz | – | now() | – |

Indexes: `created_at desc`, `(source, created_at desc)`.

An event log for the future Dialpad/GHL/HCP/CSV adapters in `src/integrations/**` (owned by a
separate concurrent workstream — this table and `src/data/integrationEvents.ts` are what it writes
through). **The table starts and stays empty in this workstream** — no rows are seeded here, and no
adapter code lives in this data layer.

## 2. Outcome → Source Effects

Applied by `recordFollowUpOutcome()` through Workstream A/B's own status functions
(`updateLeadStatus`, `updateQuoteStatus`, `updateJobStatus`) so their validation still runs — never
by writing to `leads`/`quotes`/`jobs` directly.

| Outcome | lead | quote | job |
|---------|------|-------|-----|
| contacted | → 'contacted', **only if lead is currently 'new'** (else source untouched) | → 'follow_up', **only if quote is currently 'presented'** (else source untouched) | untouched |
| booked | → 'booked' | → 'approved' | → 'booked' |
| lost | → 'lost' (`lost_reason` required) | → 'lost' (`lost_reason` required) | → 'lost' |
| snoozed | — (due_at only, see §1) | — | — |

Additional rules, applied uniformly for every source type/outcome:
- If the source is **already** in the target status, the source update is skipped (`sourceUpdated:
  false` in the result) rather than issuing a no-op write.
- Any error from the underlying A/B function (e.g. an invalid quote transition, like `booked` on a
  `draft` quote with no items) propagates as a `ValidationError`, and the follow-up is **not** marked
  done — it stays `open` so the outcome can be retried once the underlying issue is fixed.

## 3. Non-Atomic Caveat: `recordFollowUpOutcome`

Like `saveQuote()` (see `docs/workstream-b-data.md` §9), this is **not** a single transaction — it's
two sequential requests. The order is deliberate: **the source record is updated first**, and the
follow-up is marked `done` **last**. If the process dies between the two (or the second write fails
for an unrelated reason), the follow-up is left `open` and retryable: calling `recordFollowUpOutcome`
again is safe, because the source-update step is skipped once the source is already in the target
status (§2). The alternative order (mark the follow-up done first) would risk a follow-up that says
"done" while the source it was supposed to affect never moved — strictly worse for a retry story.

## 4. Command Center Metrics

`getCommandCenterMetrics(period, now?)` — every number is a real query against `leads`, `quotes`,
`jobs`, `follow_ups`, or `activity`; nothing is mocked or seeded. Ranges come from
`periodRange()` (`src/analytics/period.ts`): `[start, end)` in **local** time, where `end` is always
the local midnight after `now`'s day.

| Field | Query |
|-------|-------|
| `leads_created` | `count(leads)` where `created_at` in range |
| `quotes_created` | `count(quotes)` where `created_at` in range |
| `quotes_open` | `count(quotes)` where `status in (draft, presented, follow_up)` — point in time, no date filter |
| `leads_booked` | distinct `entity_id` from `activity` where `entity_type='lead'`, `action='lead.status_changed'`, `metadata->>to='booked'`, `created_at` in range |
| `jobs_created` | `count(jobs)` where `created_at` in range |
| `jobs_scheduled` | `count(jobs)` where `appointment_at` in range and `status not in (completed, lost)` — point-in-time status, so a job that was scheduled and then completed within the same window no longer counts |
| `jobs_completed` | distinct `entity_id` from `activity` where `entity_type='job'`, `action='job.status_changed'`, `metadata->>to='completed'`, `created_at` in range |
| `leads_open` | `count(leads)` where `status in` `OPEN_LEAD_STATUSES` (not booked/lost) — point in time |
| `leads_lost` | distinct `entity_id` from `activity` where `entity_type='lead'`, `action='lead.status_changed'`, `metadata->>to='lost'`, `created_at` in range |
| `follow_ups_overdue` | `count(follow_ups)` where `status='open'` and `due_at < now` — independent of `period`, always "as of now" |
| `follow_ups_due_today` | `count(follow_ups)` where `status='open'` and `now <= due_at < end of today` — independent of `period` |
| `follow_ups_open` | `count(follow_ups)` where `status='open'` — point in time |
| `conversion_rate` | `conversionRate(booked, total)` where `total` = leads created in range, `booked` = leads created in range **and currently** `status='booked'`; `null` when `total = 0` |

`leads_booked` (a distinct-activity count over the whole range) and the numerator of
`conversion_rate` (leads created in range that are *currently* booked) are deliberately different
queries — a lead created in range could be booked, then re-opened, then booked again; `leads_booked`
counts every such event, `conversion_rate` only cares about final state.

PostgREST has no `COUNT(DISTINCT …)`, so the distinct-activity metrics call the SQL function
`count_status_changes(p_entity_type, p_to, p_start, p_end)` (`security invoker`, authenticated only).
Counting in SQL keeps the number exact — fetching `entity_id`s and deduping in the browser would be
silently capped by PostgREST's max-rows limit (1000 by default). Every other metric uses a
`select('id', { count: 'exact', head: true })` query so no row bodies are transferred. All twelve
underlying queries run in parallel via `Promise.all`.

`listTodayBoard(now?)` returns the four lists the Command Center shows: leads created today
(`LeadWithRefs`, limit 20), open quotes (`QuoteWithRefs`, statuses draft/presented/follow_up, fetched
as three separate `listQuotes()` calls since that function only filters on one status — Workstream
B's file is not modified — then merged and capped at 20), jobs with `appointment_at` today
(`JobWithRefs`, capped at 50 as a safety net), and open follow-ups due today or overdue
(`FollowUpWithSource`, `status='open' and due_at < end of today`, capped at 50).

## 5. `list_team_members()`

```sql
create function public.list_team_members()
returns table(id uuid, email text)
language sql stable security definer set search_path = public, auth
as $$ select id, email::text from auth.users order by email; $$;
```

There is still no `users`/`profiles` table (see `docs/workstream-a-data.md` §8). This is the
interim team lookup for an owner picker and an activity "user" filter — it reads `auth.users`
directly via `SECURITY DEFINER`, since `authenticated` has no ordinary `SELECT` grant on `auth.users`.
**Flag:** every signed-in user can see every other user's email through this function — acceptable
for an internal small-team MVP, but it should be narrowed (e.g. to a real `profiles` table with only
non-PII fields) before this app has external or lower-trust users. `EXECUTE` is revoked from
`public`/`anon` and granted only to `authenticated`.

## 6. RLS

- `follow_ups`: RLS enabled; `anon` revoked entirely. `authenticated`: select, insert, update. No
  delete policy, **and** `DELETE` is revoked from `authenticated` at the grant level too — RLS alone
  only filters rows via `USING`; without a matching policy a `DELETE` with no privilege revoke would
  just silently affect zero rows rather than error (see the `activity` table precedent in
  `docs/workstream-a-data.md` §6).
- `integration_events`: RLS enabled; `anon` revoked entirely. `authenticated`: select, insert only.
  `UPDATE`/`DELETE` are revoked at the grant level for the same reason — this table is an append-only
  log.

**Guard triggers**
- `follow_ups_enforce_final` — a `done`/`cancelled` follow-up can't be updated at all (no reopening
  or rewriting an outcome), and `created_by` can never change.
- `follow_ups_stamp_creator` / `integration_events_stamp_actor` — `created_by` / `actor_id` are set
  from `auth.uid()` on insert, ignoring any value the client sends, so audit fields can't be spoofed.

## 7. Data Access API

**Follow-ups** (`src/data/followUps.ts`)
- `listFollowUps({ status?, ownerId?, leadId?, quoteId?, jobId?, dueBefore?, limit? })` → `FollowUpWithSource[]`, default `status: 'open'`, ordered `due_at` ascending
- `getFollowUp(id)` / `listOpenFollowUpsForSource(type, id)`
- `createFollowUp(input)` — validates via `validateFollowUpInput()`; `owner_id` is omitted from the
  insert (so the DB default `auth.uid()` applies) unless the caller passes it explicitly
- `updateFollowUp(id, patch)` — fetch → merge → validate (same pattern as `updateLead`/`updateJob`);
  only while `status = 'open'`
- `cancelFollowUp(id)` — only while `status = 'open'`
- `recordFollowUpOutcome(id, { outcome, lost_reason?, snooze_until?, notes? })` → `{ followUp, sourceUpdated }` — see §2/§3

**Team** (`src/data/team.ts`)
- `listTeamMembers()` → `{ id, email }[]` via `rpc('list_team_members')`

**Activity feed** (`src/data/activityFeed.ts`) — read-only, like `src/data/activity.ts` (untouched)
- `listActivityFeed({ from?, to?, actorId?, entityTypes?, limit?, before? })` → newest first, default limit 100; `before` is a `created_at` cursor for paging

**Metrics** (`src/data/metrics.ts`)
- `getCommandCenterMetrics(period, now?)` → `CommandCenterMetrics` (see §4)
- `listTodayBoard(now?)` → `{ leadsToday, quotesOpen, jobsToday, followUpsDue }`

**Integration events** (`src/data/integrationEvents.ts`)
- `listIntegrationEvents({ source?, limit? })` — newest first, default limit 50
- `logIntegrationEvent(input)` — validates `source`/`direction`/`status` against the CHECK lists client-side, then inserts

**Pure helpers**
- `src/followup/due.ts`: `startOfLocalDay`/`endOfLocalDay` (DST-safe: `setDate`/`setHours`, not
  millisecond arithmetic), `dueState(due_at, now)`, `snoozeUntil(option, now)`, `sortQueue(items, now)`
- `src/followup/validation.ts`: `validateFollowUpInput(input)`, `validateOutcome(input, now?)`
- `src/analytics/period.ts`: `periodRange(period, now)`, `conversionRate(booked, total)`

**Error classes**: reuses `src/data/errors.ts` (`ValidationError`, `DuplicateError`, `DataError`) —
unchanged.

## 8. EntityType extension

`src/shared/types.ts`'s `EntityType` gained `'follow_up'` (additive; the only change made to that
file). `src/components/activity/ActivityList.tsx`'s `entityLabel()` switch, which is exhaustive over
`EntityType`, got a matching `'follow_up' → 'Follow-up'` case so it still compiles.

## 9. Local Development

Same as Workstream A/B (`docs/workstream-a-data.md` §9): `npx supabase start`, then
`npx supabase migration up` (or `npx supabase db reset`, local dev data only) to apply
`20260921180000_command_center.sql`. No seed rows for `follow_ups` or `integration_events` — both
start empty.

## 10. Shared UI changes

`src/components/activity/ActivityList.tsx`'s `describe()`/`entityLabel()` helpers moved to a new
shared module, `src/components/activity/describeActivity.ts`, so the Command Center's cross-entity
`ActivityFeed` can render the same human-readable descriptions as the single-entity `ActivityList`.
The module exports:

- `describeActivity(activity)` — identical output to the old inline `describe()` for every action
  `ActivityList` already handled, plus new `entity_type === 'follow_up'` cases: `follow_up.created` →
  `"Follow-up created: <action>"`; `follow_up.status_changed` → `"Follow-up done (<outcome>)"` when
  `metadata.to === 'done'` (outcome read from `metadata.after.outcome`, set by the generic
  `log_activity` trigger since `outcome` is one of the changed columns), `"Follow-up cancelled"` when
  `metadata.to === 'cancelled'`; `follow_up.updated` → `"Follow-up rescheduled"` when `due_at` is in
  `metadata.changed` (this is what a snooze produces, per §1/§3 above).
- `entityLabel(entityType)` — unchanged, exhaustive switch over `EntityType`.
- `entityHref(activity)` — new: `/leads/:id`, `/quotes/:id`, `/jobs/:id`, `/customers/:id`,
  `/settings/pricing` for `pricing_rule`; `null` for `vehicle` and `follow_up` (no standalone page for
  either).

`ActivityList.tsx` now imports `describeActivity` instead of defining it inline; its rendered output
for existing entity types is unchanged (its own tests still pass unmodified).
