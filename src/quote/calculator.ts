// Pure quote calculator. Works in integer cents internally so results are
// deterministic and free of float rounding traps (e.g. 3 × $19.99).

import type {
  CalculatedLine,
  CalculationIssue,
  PricingConfig,
  QuoteCalculation,
  QuoteItemInput,
  TaxRuleValue,
} from './types.ts'

export function toCents(dollars: number): number {
  return Math.round(dollars * 100)
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100
}

const MONEY_FORMATTER = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function formatMoney(n: number): string {
  return MONEY_FORMATTER.format(n)
}

export function quoteIsPresentable(calc: QuoteCalculation): boolean {
  return !calc.issues.some((issue) => issue.blocking)
}

interface LineValidation {
  quantityValid: boolean
  unitPriceValid: boolean
  unitCostValid: boolean
  percentValid: boolean
  percent: number | undefined
  valid: boolean
}

function validateLine(item: QuoteItemInput): LineValidation {
  const quantityValid = Number.isFinite(item.quantity) && item.quantity > 0
  const unitPriceValid = Number.isFinite(item.unit_price) && item.unit_price >= 0
  const unitCostValid = item.unit_cost === null || (Number.isFinite(item.unit_cost) && item.unit_cost >= 0)

  let percent: number | undefined
  let percentValid = true
  if (item.type === 'discount') {
    percent = item.metadata?.percent
    if (percent !== undefined) {
      percentValid = typeof percent === 'number' && Number.isFinite(percent) && percent >= 0 && percent <= 100
    }
  }

  return {
    quantityValid,
    unitPriceValid,
    unitCostValid,
    percentValid,
    percent,
    valid: quantityValid && unitPriceValid && unitCostValid && percentValid,
  }
}

export function calculateQuote(items: QuoteItemInput[], config: PricingConfig): QuoteCalculation {
  const issues: CalculationIssue[] = []
  const validations = items.map(validateLine)

  items.forEach((item, index) => {
    const v = validations[index]
    if (!v.quantityValid) {
      issues.push({
        code: 'invalid_quantity',
        message: `Line ${index + 1} ("${item.description || 'untitled'}"): quantity must be a positive number.`,
        index,
        blocking: true,
      })
    }
    if (!v.unitPriceValid) {
      issues.push({
        code: 'invalid_price',
        message: `Line ${index + 1} ("${item.description || 'untitled'}"): unit price must be a non-negative number.`,
        index,
        blocking: true,
      })
    }
    if (!v.unitCostValid) {
      issues.push({
        code: 'invalid_price',
        message: `Line ${index + 1} ("${item.description || 'untitled'}"): unit cost must be a non-negative number.`,
        index,
        blocking: true,
      })
    }
    if (item.type === 'discount' && !v.percentValid) {
      issues.push({
        code: 'invalid_price',
        message: `Line ${index + 1} ("${item.description || 'untitled'}"): discount percent must be between 0 and 100.`,
        index,
        blocking: true,
      })
    }
  })

  // Pass 1: non-discount lines, and gross.
  const nonDiscountCents: number[] = items.map((item, index) => {
    if (item.type === 'discount') return 0
    const v = validations[index]
    if (!v.valid) return 0
    const unitPriceCents = toCents(item.unit_price)
    return Math.round(item.quantity * unitPriceCents)
  })

  const nonDiscountCount = items.filter((item) => item.type !== 'discount').length
  if (nonDiscountCount === 0) {
    issues.push({ code: 'no_items', message: 'Add at least one priced item to the quote.', blocking: true })
  }

  const grossCents = nonDiscountCents.reduce((sum, c) => sum + c, 0)

  // Pass 2: discount lines (percent-based needs grossCents from pass 1).
  const rawDiscountCents: number[] = items.map((item, index) => {
    if (item.type !== 'discount') return 0
    const v = validations[index]
    if (!v.valid) return 0
    if (v.percent !== undefined) {
      return Math.round((grossCents * v.percent) / 100)
    }
    const unitPriceCents = toCents(item.unit_price)
    return Math.round(item.quantity * unitPriceCents)
  })

  const rawDiscountTotalCents = rawDiscountCents.reduce((sum, c) => sum + c, 0)
  const clamped = rawDiscountTotalCents > grossCents
  const finalDiscountTotalCents = clamped ? grossCents : rawDiscountTotalCents

  if (clamped) {
    issues.push({
      code: 'discount_exceeds_gross',
      message: `Discount total exceeds the gross amount and has been capped at ${formatMoney(fromCents(grossCents))}.`,
      blocking: true,
    })
  }

  const scale = rawDiscountTotalCents > 0 ? finalDiscountTotalCents / rawDiscountTotalCents : 1

  // Distribute the (possibly clamped) discount total across discount lines,
  // proportionally, with the rounding remainder absorbed by the last
  // discount line so the sum always equals finalDiscountTotalCents exactly.
  const discountIndexes = items.map((item, index) => (item.type === 'discount' ? index : -1)).filter((i) => i >= 0)
  const clampedDiscountCents: number[] = new Array(items.length).fill(0)
  let assigned = 0
  discountIndexes.forEach((index, i) => {
    if (i === discountIndexes.length - 1) {
      clampedDiscountCents[index] = finalDiscountTotalCents - assigned
    } else {
      const c = Math.round(rawDiscountCents[index] * scale)
      clampedDiscountCents[index] = c
      assigned += c
    }
  })

  const discountRule = config.rules.discount
  if (discountRule !== null && discountRule.value.max_percent !== null) {
    const maxPercent = discountRule.value.max_percent
    const capCents = Math.round((grossCents * maxPercent) / 100)
    if (finalDiscountTotalCents > capCents) {
      issues.push({
        code: 'discount_exceeds_max',
        message: `Discount total exceeds the configured cap of ${trimPercent(maxPercent)}% of gross.`,
        blocking: true,
      })
    }
  }

  // Signed line totals (cents) in original order — used for taxable base.
  const signedLineCents: number[] = items.map((item, index) =>
    item.type === 'discount' ? -clampedDiscountCents[index] : nonDiscountCents[index],
  )

  const taxRule = config.rules.tax
  let taxRate: number | null = null
  let taxableBaseCents = 0
  let taxCents = 0

  if (taxRule === null) {
    issues.push({
      code: 'tax_not_configured',
      message: 'Tax rule not configured — set it in Pricing settings before presenting.',
      blocking: true,
    })
  } else {
    const taxValue = taxRule.value as TaxRuleValue
    taxRate = taxValue.rate
    let base = 0
    items.forEach((item, index) => {
      if (taxValue.taxable_types.includes(item.type)) base += signedLineCents[index]
    })
    taxableBaseCents = Math.max(0, base)
    taxCents = Math.round(taxableBaseCents * taxValue.rate)
  }

  const subtotalCents = grossCents - finalDiscountTotalCents
  const totalCents = subtotalCents + taxCents

  const lines: CalculatedLine[] = items.map((item, index) => {
    const v = validations[index]
    const taxable = taxRule !== null && (taxRule.value as TaxRuleValue).taxable_types.includes(item.type)
    const lineTotalCents = item.type === 'discount' ? -clampedDiscountCents[index] : nonDiscountCents[index]

    let explanation: string
    if (!v.valid) {
      explanation = 'Not included in totals — check this line.'
    } else if (item.type === 'discount') {
      if (v.percent !== undefined) {
        explanation = `${trimPercent(v.percent)}% of ${formatMoney(fromCents(grossCents))} gross`
      } else {
        explanation = `${formatMoney(fromCents(clampedDiscountCents[index]))} discount`
      }
    } else {
      explanation = `${item.quantity} × ${formatMoney(item.unit_price)}`
    }

    return {
      index,
      type: item.type,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_total: fromCents(lineTotalCents),
      taxable,
      explanation,
    }
  })

  return {
    lines,
    gross: fromCents(grossCents),
    discount_total: fromCents(finalDiscountTotalCents),
    subtotal: fromCents(subtotalCents),
    taxable_base: fromCents(taxableBaseCents),
    tax_rate: taxRate,
    tax: fromCents(taxCents),
    total: fromCents(totalCents),
    issues,
  }
}

function trimPercent(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, '')
}
