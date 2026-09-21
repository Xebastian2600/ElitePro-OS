// Pure quote status transition rules.

import type { QuoteCalculation, QuoteStatus } from './types.ts'
import { QUOTE_TRANSITIONS } from './types.ts'
import { quoteIsPresentable } from './calculator.ts'

export function canTransitionQuote(from: QuoteStatus, to: QuoteStatus): boolean {
  return QUOTE_TRANSITIONS[from].includes(to)
}

export function nextQuoteStatuses(from: QuoteStatus): QuoteStatus[] {
  return QUOTE_TRANSITIONS[from]
}

export interface ValidateQuoteTransitionArgs {
  from: QuoteStatus
  to: QuoteStatus
  lost_reason?: string | null
  calculation: QuoteCalculation
}

export type ValidateQuoteTransitionResult = { ok: true } | { ok: false; error: string }

export function validateQuoteTransition(args: ValidateQuoteTransitionArgs): ValidateQuoteTransitionResult {
  const { from, to, lost_reason, calculation } = args

  if (!canTransitionQuote(from, to)) {
    return { ok: false, error: `Cannot change quote status from "${from}" to "${to}".` }
  }

  if (to === 'lost' && (!lost_reason || lost_reason.trim() === '')) {
    return { ok: false, error: 'A lost reason is required.' }
  }

  if ((to === 'presented' || to === 'approved') && !quoteIsPresentable(calculation)) {
    return { ok: false, error: 'Resolve the blocking issues on this quote before it can be presented or approved.' }
  }

  return { ok: true }
}
