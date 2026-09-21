// Plain-text, customer-ready quote summary. Deterministic — no invented
// terms (warranty, validity period, payment terms, company claims). Those
// are business policy and do not belong in pure calculation code.

import type { Customer, Vehicle } from '../shared/types.ts'
import type { QuoteCalculation, QuoteItemInput } from './types.ts'
import { formatMoney } from './calculator.ts'

export interface BuildCustomerSummaryArgs {
  customer: Customer
  vehicle: Vehicle
  items: QuoteItemInput[]
  calculation: QuoteCalculation
  notes?: string | null
}

function vehicleLine(vehicle: Vehicle): string {
  const parts = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(
    (p): p is string | number => p !== null && p !== undefined && p !== '',
  )
  const base = parts.length > 0 ? parts.join(' ') : 'Vehicle'
  return vehicle.vin ? `${base} (VIN ${vehicle.vin})` : base
}

export function buildCustomerSummary(args: BuildCustomerSummaryArgs): string {
  const { customer, vehicle, calculation, notes } = args

  const lines: string[] = []
  lines.push(`Hi ${customer.name},`)
  lines.push('')
  lines.push(`Here is your quote for: ${vehicleLine(vehicle)}`)
  lines.push('')

  for (const line of calculation.lines) {
    const sign = line.line_total < 0 ? '-' : ''
    const amount = formatMoney(Math.abs(line.line_total))
    lines.push(`${line.description} — ${line.quantity} × ${formatMoney(line.unit_price)} = ${sign}${amount}`)
  }

  lines.push('')
  lines.push(`Subtotal: ${formatMoney(calculation.subtotal)}`)

  if (calculation.tax_rate === null) {
    lines.push('Tax: to be confirmed')
    lines.push(`Total before tax: ${formatMoney(calculation.subtotal)}`)
  } else {
    const ratePct = (calculation.tax_rate * 100).toFixed(2).replace(/\.?0+$/, '')
    lines.push(`Tax (${ratePct}%): ${formatMoney(calculation.tax)}`)
    lines.push(`Total: ${formatMoney(calculation.total)}`)
  }

  if (notes) {
    lines.push('')
    lines.push(notes)
  }

  return lines.join('\n')
}
