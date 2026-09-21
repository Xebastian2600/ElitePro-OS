import type { QuoteCalculation } from '../../quote/types.ts'
import { formatMoney } from '../../quote/calculator.ts'

export interface QuoteBreakdownProps {
  calculation: QuoteCalculation
}

function trimPercent(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, '')
}

export function QuoteBreakdown({ calculation }: QuoteBreakdownProps) {
  return (
    <div className="stack-sm">
      {calculation.lines.length === 0 ? (
        <div className="text-body-sm text-mute">No line items yet.</div>
      ) : (
        <div className="stack-sm">
          {calculation.lines.map((line) => (
            <div key={line.index} className="row-between" style={{ alignItems: 'flex-start' }}>
              <div className="stack-sm" style={{ gap: 'var(--space-xxs)' }}>
                <div className="text-body-sm">
                  {line.description || 'Untitled line'}
                  {line.taxable ? (
                    <span className="badge badge-neutral" style={{ marginLeft: 'var(--space-xs)' }}>
                      <span className="badge__dot" aria-hidden="true" />
                      Taxable
                    </span>
                  ) : null}
                </div>
                <div className="text-caption">{line.explanation}</div>
              </div>
              <div className="text-body-sm">
                {line.line_total < 0 ? '-' : ''}
                {formatMoney(Math.abs(line.line_total))}
              </div>
            </div>
          ))}
        </div>
      )}

      <hr className="hairline-divider" />

      <div className="stack-sm" style={{ gap: 'var(--space-xxs)' }}>
        <div className="row-between">
          <span className="text-body-sm">Gross</span>
          <span className="text-body-sm">{formatMoney(calculation.gross)}</span>
        </div>
        <div className="row-between">
          <span className="text-body-sm">Discounts</span>
          <span className="text-body-sm">
            {calculation.discount_total > 0 ? `-${formatMoney(calculation.discount_total)}` : formatMoney(0)}
          </span>
        </div>
        <div className="row-between">
          <span className="text-body-sm">Subtotal</span>
          <span className="text-body-sm">{formatMoney(calculation.subtotal)}</span>
        </div>
        <div className="row-between">
          <span className="text-body-sm">Taxable base</span>
          <span className="text-body-sm">{formatMoney(calculation.taxable_base)}</span>
        </div>
        <div className="row-between">
          <span className="text-body-sm">Tax {calculation.tax_rate !== null ? `(${trimPercent(calculation.tax_rate * 100)}%)` : '(not configured)'}</span>
          <span className="text-body-sm">{formatMoney(calculation.tax)}</span>
        </div>
        <div className="row-between">
          <span className="text-subtitle">Total</span>
          <span className="text-subtitle">{formatMoney(calculation.total)}</span>
        </div>
      </div>

      {calculation.issues.length > 0 ? (
        <div className="stack-sm">
          {calculation.issues.map((issue, i) => (
            <div key={i} className={issue.blocking ? 'form-error' : 'notice'} role={issue.blocking ? 'alert' : undefined}>
              {issue.message}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
