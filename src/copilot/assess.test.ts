import { describe, expect, it } from 'vitest'
import { assessWorkflow, COPILOT_MESSAGE_TEMPLATES } from './assess.ts'
import type { CopilotState } from './assess.ts'
import type { Customer, Vehicle } from '../shared/types.ts'
import type { QuoteCalculation, QuoteItemInput, QuoteStatus } from '../quote/types.ts'
import { calculateQuote } from '../quote/calculator.ts'
import { emptyPricingConfig } from '../quote/pricing.ts'

const customer: Customer = {
  id: 'c1',
  name: 'Jane Doe',
  phone: '+15551234567',
  email: 'jane@example.com',
  address: null,
  notes: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function makeVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'v1',
    customer_id: 'c1',
    year: 2019,
    make: 'Honda',
    model: 'Civic',
    trim: 'EX',
    vin: '1HGCM82633A004352',
    glass_type: 'OEM',
    adas_status: 'not_required',
    verified_status: 'verified',
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function baseState(overrides: Partial<CopilotState> = {}): CopilotState {
  return {
    lead: null,
    customer,
    vehicle: makeVehicle(),
    quote: null,
    items: [],
    calculation: null,
    pricing: null,
    hasJob: false,
    kbAvailable: false,
    ...overrides,
  }
}

const ALL_TEMPLATE_MESSAGES: Set<string> = new Set(Object.values(COPILOT_MESSAGE_TEMPLATES))

function isCalcItem(id: string): boolean {
  return id.startsWith('calc_')
}

describe('assessWorkflow — missing/warning triggers', () => {
  it('flags missing customer', () => {
    const items = assessWorkflow(baseState({ customer: null, vehicle: null }))
    expect(items.find((i) => i.id === 'missing_customer')?.message).toBe('Select or create a customer.')
  })

  it('flags missing vehicle when customer present', () => {
    const items = assessWorkflow(baseState({ vehicle: null }))
    expect(items.find((i) => i.id === 'missing_vehicle')?.message).toBe('Attach a vehicle before quoting.')
  })

  it('flags missing VIN', () => {
    const items = assessWorkflow(baseState({ vehicle: makeVehicle({ vin: null }) }))
    expect(items.find((i) => i.id === 'missing_vin')?.message).toBe('Ask customer for VIN.')
  })

  it('flags ADAS unknown', () => {
    const items = assessWorkflow(baseState({ vehicle: makeVehicle({ adas_status: 'unknown' }) }))
    expect(items.find((i) => i.id === 'adas_unknown')?.message).toBe('Verify ADAS feature/KB before quoting.')
  })

  it('attaches a kbQuery for ADAS unknown only when kbAvailable', () => {
    const withKb = assessWorkflow(baseState({ vehicle: makeVehicle({ adas_status: 'unknown' }), kbAvailable: true }))
    const item = withKb.find((i) => i.id === 'adas_unknown')
    expect(item?.kbQuery).toEqual({ query: 'ADAS 2019 Honda Civic', categories: ['adas', 'vehicle'] })

    const withoutKb = assessWorkflow(baseState({ vehicle: makeVehicle({ adas_status: 'unknown' }), kbAvailable: false }))
    expect(withoutKb.find((i) => i.id === 'adas_unknown')?.kbQuery).toBeUndefined()
  })

  it('flags ADAS required with no ADAS line only when a quote exists', () => {
    const withoutQuote = assessWorkflow(baseState({ vehicle: makeVehicle({ adas_status: 'required' }), quote: null }))
    expect(withoutQuote.find((i) => i.id === 'adas_missing_line')).toBeUndefined()

    const withQuote = assessWorkflow(
      baseState({ vehicle: makeVehicle({ adas_status: 'required' }), quote: { status: 'draft' } }),
    )
    expect(withQuote.find((i) => i.id === 'adas_missing_line')?.message).toBe(
      'Vehicle is marked ADAS required, but the quote has no ADAS line.',
    )
  })

  it('does not flag ADAS required when an ADAS line exists', () => {
    const adasItem: QuoteItemInput = { type: 'adas', description: 'Calibration', quantity: 1, unit_cost: null, unit_price: 0 }
    const items = assessWorkflow(
      baseState({ vehicle: makeVehicle({ adas_status: 'required' }), quote: { status: 'draft' }, items: [adasItem] }),
    )
    expect(items.find((i) => i.id === 'adas_missing_line')).toBeUndefined()
  })

  it('flags an unexpected ADAS line when vehicle is not_required', () => {
    const adasItem: QuoteItemInput = { type: 'adas', description: 'Calibration', quantity: 1, unit_cost: null, unit_price: 0 }
    const items = assessWorkflow(baseState({ vehicle: makeVehicle({ adas_status: 'not_required' }), items: [adasItem] }))
    expect(items.find((i) => i.id === 'adas_line_unexpected')?.message).toBe(
      'Quote has an ADAS line, but the vehicle is marked ADAS not required.',
    )
  })

  it('flags missing glass_type', () => {
    const items = assessWorkflow(baseState({ vehicle: makeVehicle({ glass_type: null }) }))
    expect(items.find((i) => i.id === 'missing_glass_type')?.message).toBe('Confirm glass type.')
  })

  it('flags unverified vehicle', () => {
    const items = assessWorkflow(baseState({ vehicle: makeVehicle({ verified_status: 'unverified' }) }))
    expect(items.find((i) => i.id === 'vehicle_unverified')?.message).toBe(
      'Vehicle details are unverified — confirm year/make/model/VIN.',
    )
  })
})

describe('assessWorkflow — calculation issues', () => {
  function blockingCalculation(): QuoteCalculation {
    return calculateQuote([{ type: 'glass', description: 'Windshield', quantity: 1, unit_cost: null, unit_price: 100 }], emptyPricingConfig())
  }

  it('surfaces a warning per blocking calculation issue with a calculation basis', () => {
    const calc = blockingCalculation()
    const items = assessWorkflow(baseState({ quote: { status: 'draft' }, calculation: calc }))
    const calcItems = items.filter((i) => isCalcItem(i.id))
    expect(calcItems.length).toBe(calc.issues.filter((i) => i.blocking).length)
    for (const item of calcItems) {
      expect(item.basis.some((b) => b.type === 'calculation')).toBe(true)
    }
  })

  it('attaches a pricing_rule basis for tax_not_configured', () => {
    const calc = blockingCalculation()
    const items = assessWorkflow(baseState({ quote: { status: 'draft' }, calculation: calc, pricing: emptyPricingConfig() }))
    const taxItem = items.find((i) => i.id.startsWith('calc_tax_not_configured'))
    expect(taxItem?.basis.some((b) => b.type === 'pricing_rule' && b.key === 'tax' && b.rule_id === null)).toBe(true)
  })
})

describe('assessWorkflow — every item has a basis', () => {
  const matrix: CopilotState[] = [
    baseState({ customer: null, vehicle: null }),
    baseState({ vehicle: null }),
    baseState({ vehicle: makeVehicle({ vin: null }) }),
    baseState({ vehicle: makeVehicle({ adas_status: 'unknown' }), kbAvailable: true }),
    baseState({ vehicle: makeVehicle({ adas_status: 'required' }), quote: { status: 'draft' } }),
    baseState({ vehicle: makeVehicle({ glass_type: null }), kbAvailable: true }),
    baseState({ vehicle: makeVehicle({ verified_status: 'unverified' }) }),
    baseState({ quote: { status: 'draft' } }),
    baseState({ quote: { status: 'presented' } }),
    baseState({ quote: { status: 'follow_up' } }),
    baseState({ quote: { status: 'approved' }, hasJob: false }),
    baseState({ quote: { status: 'approved' }, hasJob: true }),
    baseState({ quote: { status: 'lost' } }),
    baseState({ quote: null }),
  ]

  it('every item across a matrix of states has at least one basis entry', () => {
    for (const state of matrix) {
      const items = assessWorkflow(state)
      for (const item of items) {
        expect(item.basis.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('assessWorkflow — messages match known templates', () => {
  it('every non-calculation item message is a known template', () => {
    const matrixStates: CopilotState[] = [
      baseState({ customer: null, vehicle: null }),
      baseState({ vehicle: null }),
      baseState({ vehicle: makeVehicle({ vin: null }) }),
      baseState({ vehicle: makeVehicle({ adas_status: 'unknown' }) }),
      baseState({ vehicle: makeVehicle({ glass_type: null }) }),
      baseState({ vehicle: makeVehicle({ verified_status: 'unverified' }) }),
      baseState({ quote: null }),
      baseState({ quote: { status: 'draft' } }),
      baseState({ quote: { status: 'presented' } }),
      baseState({ quote: { status: 'follow_up' } }),
      baseState({ quote: { status: 'approved' } }),
    ]
    for (const state of matrixStates) {
      const items = assessWorkflow(state)
      for (const item of items) {
        if (isCalcItem(item.id)) continue
        expect(ALL_TEMPLATE_MESSAGES.has(item.message)).toBe(true)
      }
    }
  })
})

describe('assessWorkflow — kbQuery only when kbAvailable', () => {
  it('never attaches a kbQuery when kbAvailable is false', () => {
    const items = assessWorkflow(
      baseState({ vehicle: makeVehicle({ adas_status: 'unknown', glass_type: null }), kbAvailable: false }),
    )
    for (const item of items) expect(item.kbQuery).toBeUndefined()
  })
})

describe('assessWorkflow — next action per status', () => {
  it('suggests creating a quote when there is none', () => {
    const items = assessWorkflow(baseState({ quote: null }))
    expect(items.at(-1)).toMatchObject({ kind: 'next_action', message: 'Create a quote.' })
  })

  it('suggests resolving warnings when draft has blocking calc issues', () => {
    const calc = calculateQuote([{ type: 'glass', description: 'W', quantity: 1, unit_cost: null, unit_price: 100 }], emptyPricingConfig())
    const items = assessWorkflow(baseState({ quote: { status: 'draft' }, calculation: calc }))
    expect(items.at(-1)).toMatchObject({ kind: 'next_action', message: 'Resolve the warnings above, then present the quote.' })
  })

  it('suggests presenting when draft has no blocking issues', () => {
    const config = emptyPricingConfig()
    config.rules.tax = { id: 't1', key: 'tax', value: { rate: 0, taxable_types: [] } }
    const calc = calculateQuote([{ type: 'glass', description: 'W', quantity: 1, unit_cost: null, unit_price: 100 }], config)
    const items = assessWorkflow(baseState({ quote: { status: 'draft' }, calculation: calc }))
    expect(items.at(-1)).toMatchObject({ kind: 'next_action', message: 'Present the quote to the customer.' })
  })

  it('suggests follow-up-or-decision for presented', () => {
    const items = assessWorkflow(baseState({ quote: { status: 'presented' } }))
    expect(items.at(-1)).toMatchObject({
      kind: 'next_action',
      message: 'Follow up with the customer or record their decision.',
    })
  })

  it('suggests follow-up for follow_up status', () => {
    const items = assessWorkflow(baseState({ quote: { status: 'follow_up' } }))
    expect(items.at(-1)).toMatchObject({ kind: 'next_action', message: 'Follow up with the customer.' })
  })

  it('suggests creating a job for approved without a job', () => {
    const items = assessWorkflow(baseState({ quote: { status: 'approved' }, hasJob: false }))
    expect(items.at(-1)).toMatchObject({ kind: 'next_action', message: 'Create a job from this approved quote.' })
  })

  it('has no next_action for approved with a job', () => {
    const items = assessWorkflow(baseState({ quote: { status: 'approved' }, hasJob: true }))
    expect(items.some((i) => i.kind === 'next_action')).toBe(false)
  })

  it('has no next_action for lost', () => {
    const items = assessWorkflow(baseState({ quote: { status: 'lost' } }))
    expect(items.some((i) => i.kind === 'next_action')).toBe(false)
  })

  it('omits next_action when a missing item is present', () => {
    const items = assessWorkflow(baseState({ vehicle: null, quote: { status: 'draft' } }))
    expect(items.some((i) => i.kind === 'next_action')).toBe(false)
  })
})

describe('assessWorkflow — never emits price/policy text', () => {
  it('non-calculation messages never contain $ or a % digit', () => {
    const states: CopilotState[] = [
      baseState({ customer: null }),
      baseState({ vehicle: null }),
      baseState({ vehicle: makeVehicle({ vin: null }) }),
      baseState({ vehicle: makeVehicle({ adas_status: 'unknown' }) }),
      baseState({ vehicle: makeVehicle({ adas_status: 'required' }), quote: { status: 'draft' } }),
      baseState({ vehicle: makeVehicle({ glass_type: null }) }),
      baseState({ vehicle: makeVehicle({ verified_status: 'unverified' }) }),
      baseState({ quote: { status: 'approved' } }),
    ]
    for (const state of states) {
      const items = assessWorkflow(state)
      for (const item of items) {
        if (isCalcItem(item.id)) continue
        expect(item.message).not.toContain('$')
        expect(/\d%/.test(item.message)).toBe(false)
      }
    }
  })
})

describe('assessWorkflow — quote status type sanity', () => {
  it('handles every QuoteStatus value without throwing', () => {
    const statuses: QuoteStatus[] = ['draft', 'presented', 'follow_up', 'approved', 'lost']
    for (const status of statuses) {
      expect(() => assessWorkflow(baseState({ quote: { status } }))).not.toThrow()
    }
  })
})
