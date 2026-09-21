// Pure copilot: reads CRM/quote/pricing state and surfaces gaps and the next
// action. No policy statements, no prices — every message is a fixed
// template filled with record data, and every item cites the record(s) or
// calculation issue that justify it. The copilot has no KB content of its
// own; it may only suggest a kbQuery for the UI to run.

import type { Customer, Lead, Vehicle } from '../shared/types.ts'
import type { CalculationIssueCode, PricingConfig, PricingRuleKey, QuoteCalculation, QuoteItemInput, QuoteStatus } from '../quote/types.ts'
import type { KbCategory } from '../kb/types.ts'

export interface CopilotState {
  lead: Lead | null
  customer: Customer | null
  vehicle: Vehicle | null
  quote: { status: QuoteStatus } | null
  items: QuoteItemInput[]
  calculation: QuoteCalculation | null
  pricing: PricingConfig | null
  hasJob: boolean
  kbAvailable: boolean
}

export type CopilotItemKind = 'missing' | 'warning' | 'next_action'

export type CopilotBasis =
  | { type: 'record'; entity: 'lead' | 'customer' | 'vehicle' | 'quote' | 'quote_item'; field: string; value: string | null }
  | { type: 'pricing_rule'; key: PricingRuleKey; rule_id: string | null }
  | { type: 'calculation'; code: CalculationIssueCode }

export interface CopilotItem {
  id: string
  kind: CopilotItemKind
  message: string
  basis: CopilotBasis[]
  kbQuery?: { query: string; categories: KbCategory[] }
}

// Fixed message templates. Every non-calculation item's message is one of
// these, verbatim — tests assert against this map. Calculation-issue
// ('calc_*') items use the calculator's own issue message instead, since
// that message can legitimately include dollar amounts.
export const COPILOT_MESSAGE_TEMPLATES = {
  missing_customer: 'Select or create a customer.',
  missing_vehicle: 'Attach a vehicle before quoting.',
  missing_vin: 'Ask customer for VIN.',
  adas_unknown: 'Verify ADAS feature/KB before quoting.',
  adas_missing_line: 'Vehicle is marked ADAS required, but the quote has no ADAS line.',
  adas_line_unexpected: 'Quote has an ADAS line, but the vehicle is marked ADAS not required.',
  missing_glass_type: 'Confirm glass type.',
  vehicle_unverified: 'Vehicle details are unverified — confirm year/make/model/VIN.',
  next_action_create_quote: 'Create a quote.',
  next_action_resolve_warnings: 'Resolve the warnings above, then present the quote.',
  next_action_present: 'Present the quote to the customer.',
  next_action_presented_followup: 'Follow up with the customer or record their decision.',
  next_action_follow_up: 'Follow up with the customer.',
  next_action_create_job: 'Create a job from this approved quote.',
} as const

function vehicleQueryText(vehicle: Vehicle, prefix: string): string {
  const parts = [vehicle.year, vehicle.make, vehicle.model].filter(
    (p): p is string | number => p !== null && p !== undefined && p !== '',
  )
  return parts.length > 0 ? `${prefix} ${parts.join(' ')}` : prefix
}

function buildNextAction(state: CopilotState): CopilotItem | null {
  if (state.quote === null) {
    return {
      id: 'next_action_create_quote',
      kind: 'next_action',
      message: COPILOT_MESSAGE_TEMPLATES.next_action_create_quote,
      basis: [{ type: 'record', entity: 'quote', field: 'status', value: null }],
    }
  }

  const status = state.quote.status
  const blocking = state.calculation !== null && state.calculation.issues.some((i) => i.blocking)

  if (status === 'draft') {
    return {
      id: blocking ? 'next_action_resolve_warnings' : 'next_action_present',
      kind: 'next_action',
      message: blocking
        ? COPILOT_MESSAGE_TEMPLATES.next_action_resolve_warnings
        : COPILOT_MESSAGE_TEMPLATES.next_action_present,
      basis: [{ type: 'record', entity: 'quote', field: 'status', value: status }],
    }
  }

  if (status === 'presented') {
    return {
      id: 'next_action_presented_followup',
      kind: 'next_action',
      message: COPILOT_MESSAGE_TEMPLATES.next_action_presented_followup,
      basis: [{ type: 'record', entity: 'quote', field: 'status', value: status }],
    }
  }

  if (status === 'follow_up') {
    return {
      id: 'next_action_follow_up',
      kind: 'next_action',
      message: COPILOT_MESSAGE_TEMPLATES.next_action_follow_up,
      basis: [{ type: 'record', entity: 'quote', field: 'status', value: status }],
    }
  }

  if (status === 'approved') {
    if (state.hasJob) return null
    return {
      id: 'next_action_create_job',
      kind: 'next_action',
      message: COPILOT_MESSAGE_TEMPLATES.next_action_create_job,
      basis: [
        { type: 'record', entity: 'quote', field: 'status', value: status },
        { type: 'record', entity: 'quote', field: 'has_job', value: String(state.hasJob) },
      ],
    }
  }

  // lost
  return null
}

export function assessWorkflow(state: CopilotState): CopilotItem[] {
  const items: CopilotItem[] = []

  if (state.customer === null) {
    items.push({
      id: 'missing_customer',
      kind: 'missing',
      message: COPILOT_MESSAGE_TEMPLATES.missing_customer,
      basis: [{ type: 'record', entity: 'customer', field: 'id', value: null }],
    })
  } else if (state.vehicle === null) {
    items.push({
      id: 'missing_vehicle',
      kind: 'missing',
      message: COPILOT_MESSAGE_TEMPLATES.missing_vehicle,
      basis: [{ type: 'record', entity: 'vehicle', field: 'id', value: null }],
    })
  } else {
    const vehicle = state.vehicle

    if (vehicle.vin === null) {
      items.push({
        id: 'missing_vin',
        kind: 'missing',
        message: COPILOT_MESSAGE_TEMPLATES.missing_vin,
        basis: [{ type: 'record', entity: 'vehicle', field: 'vin', value: null }],
      })
    }

    if (vehicle.adas_status === 'unknown') {
      const item: CopilotItem = {
        id: 'adas_unknown',
        kind: 'warning',
        message: COPILOT_MESSAGE_TEMPLATES.adas_unknown,
        basis: [{ type: 'record', entity: 'vehicle', field: 'adas_status', value: 'unknown' }],
      }
      if (state.kbAvailable) {
        item.kbQuery = { query: vehicleQueryText(vehicle, 'ADAS'), categories: ['adas', 'vehicle'] }
      }
      items.push(item)
    }

    const hasAdasItem = state.items.some((i) => i.type === 'adas')

    if (state.quote !== null && vehicle.adas_status === 'required' && !hasAdasItem) {
      items.push({
        id: 'adas_missing_line',
        kind: 'warning',
        message: COPILOT_MESSAGE_TEMPLATES.adas_missing_line,
        basis: [{ type: 'record', entity: 'vehicle', field: 'adas_status', value: 'required' }],
      })
    }

    if (vehicle.adas_status === 'not_required' && hasAdasItem) {
      items.push({
        id: 'adas_line_unexpected',
        kind: 'warning',
        message: COPILOT_MESSAGE_TEMPLATES.adas_line_unexpected,
        basis: [
          { type: 'record', entity: 'vehicle', field: 'adas_status', value: 'not_required' },
          { type: 'record', entity: 'quote_item', field: 'type', value: 'adas' },
        ],
      })
    }

    if (vehicle.glass_type === null) {
      const item: CopilotItem = {
        id: 'missing_glass_type',
        kind: 'missing',
        message: COPILOT_MESSAGE_TEMPLATES.missing_glass_type,
        basis: [{ type: 'record', entity: 'vehicle', field: 'glass_type', value: null }],
      }
      if (state.kbAvailable) {
        item.kbQuery = { query: vehicleQueryText(vehicle, 'Glass type'), categories: ['glass'] }
      }
      items.push(item)
    }

    if (vehicle.verified_status === 'unverified') {
      items.push({
        id: 'vehicle_unverified',
        kind: 'warning',
        message: COPILOT_MESSAGE_TEMPLATES.vehicle_unverified,
        basis: [{ type: 'record', entity: 'vehicle', field: 'verified_status', value: 'unverified' }],
      })
    }
  }

  if (state.calculation !== null) {
    for (const issue of state.calculation.issues) {
      if (!issue.blocking) continue
      const id = issue.index !== undefined ? `calc_${issue.code}_${issue.index}` : `calc_${issue.code}`
      const basis: CopilotBasis[] = [{ type: 'calculation', code: issue.code }]
      if (issue.code === 'tax_not_configured') {
        basis.push({ type: 'pricing_rule', key: 'tax', rule_id: state.pricing?.rules.tax?.id ?? null })
      }
      if (issue.code === 'discount_exceeds_max') {
        basis.push({ type: 'pricing_rule', key: 'discount', rule_id: state.pricing?.rules.discount?.id ?? null })
      }
      items.push({ id, kind: 'warning', message: issue.message, basis })
    }
  }

  const hasMissing = items.some((i) => i.kind === 'missing')
  if (!hasMissing) {
    const nextAction = buildNextAction(state)
    if (nextAction) items.push(nextAction)
  }

  return items
}
