# Workstream B: Quote Engine — Data Layer Contract

Schema and data-access API for quotes, quote items, and pricing rules. Builds on Workstream A's
core CRM (`docs/workstream-a-data.md`). Shared TypeScript contract: `src/quote/types.ts`.

## 1. Tables & Columns

**quotes**
| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | – | gen_random_uuid() | PRIMARY KEY |
| lead_id | uuid | ✓ | – | FK leads; SET NULL on delete |
| customer_id | uuid | – | – | FK customers; RESTRICT on delete |
| vehicle_id | uuid | – | – | FK vehicles; RESTRICT on delete |
| status | text | – | 'draft' | IN (draft, presented, follow_up, approved, lost) |
| subtotal | numeric(12,2) | – | 0 | CHECK >= 0 |
| tax | numeric(12,2) | – | 0 | CHECK >= 0 |
| total | numeric(12,2) | – | 0 | CHECK total = subtotal + tax |
| notes | text | ✓ | – | – |
| **lost_reason** | text | ✓ | – | **Additive** (beyond src/quote/types.ts's minimal contract shape, but present in the `Quote` interface). Required when status = 'lost'. |
| **pricing_snapshot** | jsonb | – | '{}' | **Additive.** The resolved `PricingConfig` captured at save time (see §5) |
| created_by | uuid | ✓ | auth.uid() | FK auth.users; SET NULL on delete |
| created_at / updated_at | timestamptz | – | now() | – |

**quote_items**
| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | – | gen_random_uuid() | PRIMARY KEY |
| quote_id | uuid | – | – | FK quotes; CASCADE on delete |
| type | text | – | – | IN (glass, labor, adas, part, discount) |
| description | text | – | – | CHECK non-blank |
| quantity | numeric(10,2) | – | – | CHECK > 0 |
| unit_cost | numeric(12,2) | ✓ | – | CHECK >= 0 when present |
| unit_price | numeric(12,2) | – | – | CHECK >= 0; for discount lines, the positive per-unit amount subtracted |
| metadata | jsonb | – | '{}' | e.g. `{ percent }` for percent-based discounts, `{ pricing_rule_id }` |
| **sort_order** | int | – | 0 | **Additive.** Display/edit order within the quote |
| **created_at / updated_at** | timestamptz | – | now() | **Additive** (mirrors vehicles/jobs) |

Index: `(quote_id, sort_order)`.

**pricing_rules**
| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | – | gen_random_uuid() | PRIMARY KEY |
| key | text | – | – | IN (price.glass, price.labor, price.adas, price.part, tax, discount) |
| value | jsonb | – | – | Shape depends on key (see §4) |
| active_from | timestamptz | – | now() | – |
| active_to | timestamptz | ✓ | – | null = currently open/active row |
| updated_by | uuid | ✓ | auth.uid() | FK auth.users; SET NULL on delete |
| created_at | timestamptz | – | now() | – |

Partial unique index on `(key) where active_to is null` — at most one open row per key at a time.
History is kept: `set_pricing_rule()` closes the old open row (`active_to = now()`) rather than
updating it in place, then inserts a new row.

**No pricing values are seeded.** The table starts empty; every `price.*`/`tax`/`discount` key is
unset until someone configures it in Pricing settings. `resolvePricingRules()` treats an unset key
as `null`, and the calculator flags the gaps that matter (e.g. `tax_not_configured` blocks
presenting/approving a quote until tax is set).

## 2. Status & Transitions

`QuoteStatus`: draft, presented, follow_up, approved, lost.

| From | Allowed to |
|------|------------|
| draft | presented, lost |
| presented | draft, follow_up, approved, lost |
| follow_up | presented, approved, lost |
| approved | (none — terminal) |
| lost | draft |

Enforced twice: client-side by `validateQuoteTransition()` (`src/quote/status.ts`), and as a DB
backstop by the `enforce_quote_status` trigger (`before update of status on quotes`), which also:
- requires at least one non-discount `quote_item` before a quote can move to `presented` or `approved`
- clears `lost_reason` automatically when a `lost` quote moves back to `draft`

`EDITABLE_QUOTE_STATUSES` = draft, presented, follow_up — `quote_items` can only be written while
the parent quote is in one of these; the `quote_items_lock` trigger rejects any insert/update/delete
once the quote is `approved` or `lost` (error `quote is locked`).

## 3. Triggers

**quotes**
- `set_updated_at` (reused from Workstream A)
- `enforce_vehicle_owner` (reused — `vehicle_id` must belong to `customer_id`)
- `enforce_quote_lead` (new) — when `lead_id` is set, that lead's `customer_id` must match the quote's
- `enforce_quote_status` (new) — see §2
- `enforce_quote_lock` (new) — on an approved/lost quote, rejects changes to `customer_id`,
  `vehicle_id`, `lead_id`, `subtotal`, `tax`, `total` and `pricing_snapshot` (status changes and
  notes are still allowed)
- `log_activity('quote')` (reused) — `quote.created` / `quote.status_changed` / `quote.updated`

**quote_items**
- `set_updated_at`
- `quote_items_lock` (new) — rejects writes while the parent quote is approved/lost
- `log_quote_item_activity` (new, `security definer`) — writes to `activity` with
  `entity_type = 'quote'`, `entity_id = quote_id` (so an item edit shows up in the quote's own
  activity feed), action `quote.item_added` / `quote.item_updated` / `quote.item_removed`. Updates
  are skipped when no column actually changed (mirrors Workstream A's `log_activity`).

**pricing_rules**
- `log_activity('pricing_rule')` (reused) — `pricing_rule.created` on insert, `pricing_rule.updated`
  when `set_pricing_rule()` closes the previous open row.

**jobs** (see §6)
- `jobs_enforce_quote` (new, `before insert or update of quote_id`)

## 4. Pricing Rule Keys & Value Shapes

| key | shape | example |
|-----|-------|---------|
| `price.glass` / `price.labor` / `price.adas` / `price.part` | `{ mode: 'markup_percent' \| 'markup_amount' \| 'fixed', value: number }` | `{"mode":"fixed","value":300}` |
| `tax` | `{ rate: number (0–1, exclusive of 1), taxable_types: QuoteItemType[] }` | `{"rate":0.0825,"taxable_types":["glass","labor","adas","part"]}` |
| `discount` | `{ max_percent: number \| null }` (null = no cap) | `{"max_percent":20}` |

`price.*` modes: `fixed` uses `value` directly as the unit price (no cost needed, e.g. a flat labor
rate); `markup_percent`/`markup_amount` derive the unit price from the item's `unit_cost`.

Client-side validation lives in `parsePricingRuleValue()` (`src/quote/pricing.ts`) and runs before
any RPC call. The DB function `set_pricing_rule()` only checks `jsonb_typeof(value) = 'object'` as a
minimal backstop — it is `security invoker`, so it still runs under RLS as the calling user.

## 5. Pricing Snapshot

`quotes.pricing_snapshot` stores the `PricingConfig` (via `configToSnapshot()`) that was active when
`saveQuote()` last ran. Reloading a quote and recalculating from `pricing_snapshot`
(`snapshotToConfig()` + `calculateQuote()`, see `recalculateStoredQuote()` in `src/data/quotes.ts`)
reproduces the exact stored `subtotal`/`tax`/`total`, even if pricing rules change later. Status
transitions (`updateQuoteStatus()`) validate against this same recalculation, not live pricing
rules — a quote's numbers don't shift out from under a customer between presenting and approving.

## 6. Jobs ↔ Quotes Integration

Workstream A's `jobs.quote_id` shipped without a foreign key (see `docs/workstream-a-data.md` §8).
This migration adds it:

```sql
alter table public.jobs
  add constraint jobs_quote_id_fkey foreign key (quote_id) references public.quotes(id)
  on delete restrict not valid;
```

`not valid` so pre-existing dev rows with random `quote_id`s don't break the migration; it is still
fully enforced for every new insert/update going forward.

The `jobs_enforce_quote` trigger additionally requires, whenever `quote_id` is set:
- the quote's `status` must be `approved` (else: `quote must be approved before creating a job`)
- the job's `customer_id`/`vehicle_id` must equal the quote's (else: `job does not match quote`)

A `quote_id` that references no row is caught by the FK as Postgres error `23503`; `src/data/errors.ts`
maps that specifically to `new ValidationError({ quote_id: 'No quote exists with this ID.' })`.

## 7. RLS

RLS enabled on `quotes`, `quote_items`, `pricing_rules`; `anon` has no access (revoked). For
`authenticated`:
- `quotes`: select, insert, update (no delete)
- `quote_items`: select, insert, update, **delete** (items can be removed from an editable quote;
  the lock trigger is what actually protects approved/lost quotes, not the absence of a delete policy)
- `pricing_rules`: select, insert, and update of the `active_to` column only (column-level grant, so a
  rule's value can never be rewritten in place; no delete — history is kept via `active_to`)
- `set_pricing_rule()`: execute granted to `authenticated` only (revoked from `public`)

## 8. Data Access API

**Pricing rules** (`src/data/pricingRules.ts`)
- `listPricingRuleRows()` — all rows (small table)
- `getPricingConfig(now?)` — resolves the currently-active rule per key via `resolvePricingRules()`
- `setPricingRule(key, value)` — validates with `parsePricingRuleValue()` client-side, then calls the
  `set_pricing_rule` RPC

**Quotes** (`src/data/quotes.ts`)
- `listQuotes({ status?, leadId?, customerId? })` / `getQuote(id)` → `QuoteWithRefs` (joins
  `customer`/`vehicle`, same pattern as `JobWithRefs`/`LeadWithRefs`)
- `listQuoteItems(quoteId)` — ordered by `sort_order`
- `getQuoteWithItems(id)` → `{ quote: QuoteWithRefs, items: QuoteItem[] }`
- `createQuote(input)` — validates `customer_id`/`vehicle_id`, inserts as `draft`
- `saveQuote(id, { items, notes }, config)` → `{ quote: Quote, items: QuoteItem[] }` — see §9
- `updateQuoteStatus(id, to, lost_reason?)` → `Quote` — recalculates from the stored
  `pricing_snapshot`, validates via `validateQuoteTransition()`, then updates status. When moving to
  `presented` and the quote has a `lead_id` whose lead is still `new`/`contacted`/`qualified`, also
  calls `updateLeadStatus(lead_id, 'quoted')`
- `recalculateStoredQuote(quote, items)` → `QuoteCalculation` — recompute from the saved snapshot

Numeric columns (`subtotal`, `tax`, `total`, `quantity`, `unit_cost`, `unit_price`, `sort_order`) are
normalized with `Number()` when read back, since PostgREST/pg may return `numeric` columns as strings.

## 9. saveQuote: Non-Atomic Caveat

`saveQuote()` is **not** a single transaction — it's several sequential requests against PostgREST
(no multi-statement RPC was written for it). The order is deliberate: item writes happen first
(delete removed → update changed → insert new), and the quote's `subtotal`/`tax`/`total`/
`pricing_snapshot` are written **last**. If the process dies partway through, the persisted
`quote_items` are always self-consistent and `recalculateStoredQuote()` (or a fresh `saveQuote` call)
can recompute correct totals from whatever items actually landed — the quote row is never left
pointing at totals for a different item set than what's stored. This is an acceptable MVP tradeoff
given the low write concurrency on a single quote (one user editing it at a time in practice); a
proper fix would be a `security definer` RPC that does the whole diff+update in one Postgres
transaction.

`saveQuote()` blocks only on line-level issues (`invalid_quantity`, `invalid_price`,
`discount_exceeds_gross`) — these come back as a `ValidationError` keyed like `items.2.quantity` (or
`_` for quote-wide issues like `discount_exceeds_gross`). Blocking issues that are really about
*readiness to present*, not *validity of the draft* (`tax_not_configured`, `no_items`,
`discount_exceeds_max`), do **not** block a save — only `updateQuoteStatus()`'s transition to
`presented`/`approved` does, via `validateQuoteTransition()` → `quoteIsPresentable()`.

## 10. Local Development

Same as Workstream A (`docs/workstream-a-data.md` §9): `npx supabase start`, then
`npx supabase db reset` (or `migration up`) to apply `20260921120000_quotes_pricing.sql`. No pricing
values are seeded — go to Pricing settings (or call `setPricingRule` directly) to configure
`price.glass`, `price.labor`, `price.adas`, `price.part`, `tax`, and `discount` before quotes can be
presented or approved.
