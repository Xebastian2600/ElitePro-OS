# Workstream A: Data Layer Contract

Shared data schema and API for ElitePro OS Lite core CRM (customers, vehicles, leads, jobs, activity).

## 1. Tables & Columns

**customers**
| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | – | gen_random_uuid() | PRIMARY KEY |
| name | text | – | – | CHECK (length > 0) |
| phone | text | ✓ | – | E.164 format; UNIQUE |
| email | text | ✓ | – | lowercase; UNIQUE |
| address | text | ✓ | – | – |
| notes | text | ✓ | – | – |
| created_at | timestamptz | – | now() | – |
| updated_at | timestamptz | – | now() | – |
| – | – | – | – | CHECK (phone OR email required) |

**vehicles**
| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | – | gen_random_uuid() | PRIMARY KEY |
| customer_id | uuid | – | – | FK customers; RESTRICT on delete |
| year | int | ✓ | – | CHECK (1950–2100) |
| make | text | ✓ | – | – |
| model | text | ✓ | – | – |
| trim | text | ✓ | – | – |
| vin | text | ✓ | – | 17 chars [A-HJ-NPR-Z0-9]; UNIQUE |
| glass_type | text | ✓ | – | – |
| adas_status | text | – | 'unknown' | IN ('unknown', 'required', 'not_required') |
| verified_status | text | – | 'unverified' | IN ('unverified', 'verified') |
| notes | text | ✓ | – | – |
| created_at | timestamptz | – | now() | – |
| updated_at | timestamptz | – | now() | – |
| – | – | – | – | CHECK (vin OR (year AND make AND model)) |

**leads**
| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | – | gen_random_uuid() | PRIMARY KEY |
| customer_id | uuid | ✓ | – | FK customers; RESTRICT on delete |
| vehicle_id | uuid | ✓ | – | FK vehicles; SET NULL on delete |
| source | text | ✓ | – | – |
| request | text | ✓ | – | – |
| status | text | – | 'new' | IN (new, contacted, qualified, quoted, follow_up, booked, lost) |
| assigned_user_id | uuid | ✓ | – | FK auth.users; SET NULL on delete |
| next_action | text | ✓ | – | – |
| next_action_at | timestamptz | ✓ | – | – |
| lost_reason | text | ✓ | – | – |
| created_at | timestamptz | – | now() | – |
| updated_at | timestamptz | – | now() | – |
| – | – | – | – | CHECK (lost_reason required if status = 'lost') |

**jobs**
| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | – | gen_random_uuid() | PRIMARY KEY |
| quote_id | uuid | ✓ | – | UNIQUE; no FK yet (WS-B adds it) |
| customer_id | uuid | – | – | FK customers; RESTRICT on delete |
| vehicle_id | uuid | – | – | FK vehicles; RESTRICT on delete |
| status | text | – | 'new' | IN (new, quoted, booked, parts_needed, scheduled, in_progress, completed, follow_up, lost) |
| appointment_at | timestamptz | ✓ | – | – |
| address | text | ✓ | – | – |
| technician_id | uuid | ✓ | – | FK auth.users; SET NULL on delete |
| notes | text | ✓ | – | – |
| created_at | timestamptz | – | now() | – |
| updated_at | timestamptz | – | now() | – |

**activity**
| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | – | gen_random_uuid() | PRIMARY KEY |
| entity_type | text | – | – | – |
| entity_id | uuid | – | – | – |
| actor_id | uuid | ✓ | – | FK auth.users; SET NULL on delete |
| action | text | – | – | e.g., "customer.created", "lead.status_changed" |
| metadata | jsonb | – | '{}' | Trigger-specific structure per action type |
| created_at | timestamptz | – | now() | – |

## 2. Status Values

**LeadStatus**: new, contacted, qualified, quoted, follow_up, booked, lost
**JobStatus**: new, quoted, booked, parts_needed, scheduled, in_progress, completed, follow_up, lost
**AdasStatus**: unknown, required, not_required
**VerifiedStatus**: unverified, verified

See `src/shared/types.ts` for label mappings.

## 3. Normalization & Duplicate Rules

- **Phone**: Stored E.164 format (+1XXXXXXXXXX for US). App normalizes bare 10-digit to +1, passes +N through as-is. Unique index prevents duplicates at DB level.
- **Email**: Stored lowercase; unique index prevents duplicates.
- **VIN**: Stored uppercase, exactly 17 chars [A-HJ-NPR-Z0-9]; unique index prevents duplicates.
- **quote_id**: Unique on jobs; duplicate prevents two jobs per quote.
- **App-level checks**: `findCustomerMatches()` and `findVehicleByVin()` pre-check before insert/update; throw `DuplicateError` with `existing` field. DB unique indexes are the backstop for concurrent writes.

## 4. Integrity Triggers

- **enforce_vehicle_owner**: Leads and jobs may only reference vehicles owned by the same customer (enforced on insert/update).
- **set_updated_at**: Auto-updates `updated_at` on any row change (customers, vehicles, leads, jobs).

## 5. Activity Logging

- Written exclusively by `log_activity()` trigger (SECURITY DEFINER, runs as Postgres role).
- **actor_id** = `auth.uid()` at trigger time.
- **Actions**:
  - `<type>.created`: On insert; metadata is full new row.
  - `<type>.updated`: On non-status changes; metadata includes `changed` (field list), `before`, `after`.
  - `<type>.status_changed`: On status change; metadata includes `from`, `to`, `changed`, `before`, `after`, and `lost_reason` if transitioning to 'lost'.
- Workstream B: Wrap new `quotes` table with `log_activity('quote')` trigger rather than logging from client code.

## 6. Security

- RLS enabled on all tables; anon role revoked all access.
- Authenticated users can select/insert/update (no deletes).
- Activity: authenticated can only read; inserts/updates revoked (trigger handles writes via SECURITY DEFINER).
- **Anon key only in browser**; never expose service-role key to client.

## 7. Data Access API

**Customers** (`src/data/customers.ts`)
- `listRecentCustomers(limit?)` / `searchCustomers(query, limit?)` / `getCustomer(id)`
- `findCustomerMatches({ phone?, email? })` / `createCustomer(input)` / `updateCustomer(id, patch)`

**Vehicles** (`src/data/vehicles.ts`)
- `listVehiclesForCustomer(customerId)` / `getVehicle(id)` / `findVehicleByVin(vin)`
- `searchVehicles(query, limit?)` / `createVehicle(input)` / `updateVehicle(id, patch)`

**Leads** (`src/data/leads.ts`)
- `listLeads(options?)` / `getLead(id)` / `listOpenLeadsForCustomer(customerId)`
- `createLead(input)` / `updateLead(id, patch)` / `updateLeadStatus(id, status, lost_reason?)`

**Jobs** (`src/data/jobs.ts`)
- `listJobs(options?)` / `getJob(id)` / `findJobByQuoteId(quoteId)`
- `createJob(input)` / `createJobFromQuote(input)` / `updateJob(id, patch)` / `updateJobStatus(id, status)`

**Activity** (`src/data/activity.ts`)
- `listActivityForEntity(entityType, entityId, limit?)` / `listActivityForEntities(pairs, limit?)`

**Error Classes** (`src/data/errors.ts`)
- `ValidationError(errors)` — validation failed; includes error map.
- `DuplicateError(field, message, existing?)` — unique constraint violated; includes existing row.
- `DataError(message, cause?)` — unexpected database error.

**Update pattern**: `update*` functions fetch current row, merge patch, validate merged, then write. Throws `DuplicateError` if patch creates a conflict (e.g., duplicate phone after update).

## 8. Hand-offs & Open Items

- Workstream B: `jobs.quote_id` has no FK yet — add `alter table jobs add constraint jobs_quote_id_fkey foreign key (quote_id) references quotes(id)` in B's quotes migration.
- Workstream C: owns the `activity` table going forward; it was created here exactly per the shared contract.
- Contract gap: the plan's A3 lists a job "service" field that is not in the Job contract — not added; put service details in notes until the contract is updated.
- Contract gap: Job has no lead_id; job→lead linkage is via quote.lead_id once quotes exist.
- Contract gap: no users/profiles table, so assigned_user_id / technician_id can only be set to the current user (or left empty) in the UI. A shared profiles table should be agreed before a CSR/technician picker is built.
- Additive: created_at/updated_at added to vehicles and jobs (not in the contract list).
- Assumption: phone normalization defaults to US (+1).

## 9. Local Development

1. `npm install`
2. `npx supabase start` (requires Docker)
3. Copy `npx supabase status -o env` → take `API_URL` and `ANON_KEY`
4. Create `.env.local`: `VITE_SUPABASE_URL=<url>` and `VITE_SUPABASE_ANON_KEY=<key>`
5. Create `.env.test.local` with same variables for integration tests
6. `npm run dev` (start dev server)
7. `npm test` (unit tests)
8. `npm run test:integration` (integration tests against local Supabase)
9. Create a test user in Supabase Studio (Authentication → Add user) to sign in
10. For hosted projects: `npx supabase link` → `npx supabase db push`
