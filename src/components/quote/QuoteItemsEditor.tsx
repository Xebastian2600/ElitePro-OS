import type { PricingConfig, QuoteItemInput, QuoteItemType } from '../../quote/types.ts'
import { QUOTE_ITEM_TYPES } from '../../quote/types.ts'
import { suggestUnitPrice } from '../../quote/pricing.ts'
import { TextField } from '../ui/TextField.tsx'
import { SelectField } from '../ui/SelectField.tsx'
import { Button } from '../ui/Button.tsx'

export interface QuoteItemsEditorProps {
  items: QuoteItemInput[]
  onChange: (items: QuoteItemInput[]) => void
  pricing: PricingConfig
  errors?: Record<string, string>
  disabled?: boolean
}

function emptyItem(): QuoteItemInput {
  return { type: 'glass', description: '', quantity: 1, unit_cost: null, unit_price: 0, metadata: {} }
}

export function QuoteItemsEditor({ items, onChange, pricing, errors = {}, disabled }: QuoteItemsEditorProps) {
  function updateItem(index: number, patch: Partial<QuoteItemInput>) {
    const next = items.slice()
    next[index] = { ...next[index], ...patch }
    onChange(next)
  }

  function updateMetadata(index: number, patch: Record<string, unknown>) {
    const item = items[index]
    updateItem(index, { metadata: { ...item.metadata, ...patch } })
  }

  function addItem() {
    onChange([...items, emptyItem()])
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index))
  }

  function moveItem(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= items.length) return
    const next = items.slice()
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    onChange(next)
  }

  return (
    <div className="stack">
      {items.length === 0 ? <div className="text-body-sm text-mute">No line items yet.</div> : null}

      {items.map((item, index) => {
        const err = (field: string) => errors[`items.${index}.${field}`]
        const isDiscount = item.type === 'discount'
        const isPercent = item.metadata?.percent !== undefined
        const suggestion = isDiscount ? null : suggestUnitPrice(item.type, item.unit_cost, pricing)

        return (
          <div key={index} className="card-soft stack-sm">
            <div className="row-between">
              <span className="text-caption">Line {index + 1}</span>
              {!disabled ? (
                <div className="row" style={{ gap: 'var(--space-xxs)' }}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => moveItem(index, -1)}
                    disabled={index === 0}
                    aria-label="Move line up"
                  >
                    Up
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => moveItem(index, 1)}
                    disabled={index === items.length - 1}
                    aria-label="Move line down"
                  >
                    Down
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => removeItem(index)}>
                    Remove
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="grid-2">
              <SelectField
                label="Type"
                value={item.type}
                onChange={(e) => updateItem(index, { type: e.target.value as QuoteItemType })}
                options={QUOTE_ITEM_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                disabled={disabled}
                error={err('type')}
              />
              <TextField
                label="Description"
                value={item.description}
                onChange={(e) => updateItem(index, { description: e.target.value })}
                disabled={disabled}
                error={err('description')}
              />
            </div>

            <div className="grid-2">
              <TextField
                label="Quantity"
                type="number"
                step="any"
                value={item.quantity}
                onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })}
                disabled={disabled}
                error={err('quantity')}
              />
              {!isDiscount ? (
                <TextField
                  label="Unit cost"
                  type="number"
                  step="any"
                  value={item.unit_cost ?? ''}
                  onChange={(e) => updateItem(index, { unit_cost: e.target.value === '' ? null : Number(e.target.value) })}
                  disabled={disabled}
                  error={err('unit_cost')}
                  hint="Optional — used by markup-based pricing rules."
                />
              ) : (
                <div className="field">
                  <span className="field-label">Discount type</span>
                  <div className="row" style={{ gap: 'var(--space-xs)' }}>
                    <button
                      type="button"
                      className={`pill${!isPercent ? ' active' : ''}`}
                      aria-pressed={!isPercent}
                      disabled={disabled}
                      onClick={() => updateMetadata(index, { percent: undefined })}
                    >
                      Amount
                    </button>
                    <button
                      type="button"
                      className={`pill${isPercent ? ' active' : ''}`}
                      aria-pressed={isPercent}
                      disabled={disabled}
                      onClick={() => updateMetadata(index, { percent: item.metadata?.percent ?? 0 })}
                    >
                      Percent
                    </button>
                  </div>
                </div>
              )}
            </div>

            {!isDiscount ? (
              <div className="grid-2">
                <TextField
                  label="Unit price"
                  type="number"
                  step="any"
                  value={item.unit_price}
                  onChange={(e) => updateItem(index, { unit_price: Number(e.target.value) })}
                  disabled={disabled}
                  error={err('unit_price')}
                />
                <div className="field">
                  <span className="field-label">Pricing rule</span>
                  {suggestion && suggestion.unit_price !== null ? (
                    <div className="stack-sm" style={{ gap: 'var(--space-xxs)' }}>
                      {!disabled ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            updateItem(index, {
                              unit_price: suggestion.unit_price as number,
                              metadata: { ...item.metadata, pricing_rule_id: suggestion.rule_id },
                            })
                          }
                        >
                          Use rule
                        </Button>
                      ) : null}
                      <span className="text-caption">{suggestion.explanation}</span>
                    </div>
                  ) : (
                    <span className="text-caption">{suggestion?.reason}</span>
                  )}
                </div>
              </div>
            ) : isPercent ? (
              <TextField
                label="Discount percent"
                type="number"
                step="any"
                min={0}
                max={100}
                value={item.metadata?.percent ?? 0}
                onChange={(e) => updateMetadata(index, { percent: Number(e.target.value) })}
                disabled={disabled}
                error={err('metadata.percent')}
                hint="Percent of the gross (non-discount lines) subtotal."
              />
            ) : (
              <TextField
                label="Discount amount (per unit)"
                type="number"
                step="any"
                value={item.unit_price}
                onChange={(e) => updateItem(index, { unit_price: Number(e.target.value) })}
                disabled={disabled}
                error={err('unit_price')}
              />
            )}
          </div>
        )
      })}

      {!disabled ? (
        <Button type="button" variant="outline" onClick={addItem}>
          Add line
        </Button>
      ) : null}
    </div>
  )
}
