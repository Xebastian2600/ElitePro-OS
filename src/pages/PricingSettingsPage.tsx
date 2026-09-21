import { useState } from 'react'
import { getPricingConfig, setPricingRule } from '../data/pricingRules.ts'
import { describeRule, parsePricingRuleValue, ruleLabel } from '../quote/pricing.ts'
import type { PricingRuleKey, ResolvedRule } from '../quote/types.ts'
import { PRICING_RULE_KEYS, QUOTE_ITEM_TYPES } from '../quote/types.ts'
import { useAsync } from '../components/ui/useAsync.ts'
import { PageHeader } from '../components/ui/PageHeader.tsx'
import { Section } from '../components/ui/Section.tsx'
import { LoadingLine } from '../components/ui/LoadingLine.tsx'
import { TextField } from '../components/ui/TextField.tsx'
import { SelectField } from '../components/ui/SelectField.tsx'
import { Checkbox } from '../components/ui/Checkbox.tsx'
import { Button } from '../components/ui/Button.tsx'
import { FormError } from '../components/ui/FormError.tsx'

export function PricingSettingsPage() {
  const [refreshKey, setRefreshKey] = useState(0)
  const { data: config, loading, error } = useAsync(() => getPricingConfig(), [refreshKey])
  const bump = () => setRefreshKey((n) => n + 1)

  return (
    <div>
      <PageHeader title="Pricing settings" />
      <div className="container page stack-lg">
        <div className="notice notice-info">
          Changes apply to quotes saved after this point. Saved quotes keep the rules they were saved with.
        </div>
        {loading ? <LoadingLine label="Loading pricing rules…" /> : null}
        {error ? <div className="text-error text-body-sm">Could not load pricing rules.</div> : null}
        {config && config.issues.length > 0 ? <FormError message={config.issues.join(' ')} /> : null}
        {config
          ? PRICING_RULE_KEYS.map((key) => (
              <Section key={key} title={ruleLabel(key)}>
                <PricingRuleEditor ruleKey={key} resolved={config.rules[key]} onSaved={bump} />
              </Section>
            ))
          : null}
      </div>
    </div>
  )
}

interface PricingRuleEditorProps {
  ruleKey: PricingRuleKey
  resolved: ResolvedRule<PricingRuleKey> | null
  onSaved: () => void
}

function PricingRuleEditor({ ruleKey, resolved, onSaved }: PricingRuleEditorProps) {
  const isPrice = ruleKey.startsWith('price.')
  const isTax = ruleKey === 'tax'
  const isDiscount = ruleKey === 'discount'

  const priceResolvedValue = isPrice ? (resolved?.value as { mode: string; value: number } | undefined) : undefined
  const taxResolvedValue = isTax ? (resolved?.value as { rate: number; taxable_types: string[] } | undefined) : undefined
  const discountResolvedValue = isDiscount ? (resolved?.value as { max_percent: number | null } | undefined) : undefined

  const [mode, setMode] = useState(priceResolvedValue?.mode ?? '')
  const [value, setValue] = useState(priceResolvedValue ? String(priceResolvedValue.value) : '')
  const [ratePercent, setRatePercent] = useState(taxResolvedValue ? String(taxResolvedValue.rate * 100) : '')
  const [taxableTypes, setTaxableTypes] = useState<string[]>(taxResolvedValue?.taxable_types ?? [])
  const [maxPercent, setMaxPercent] = useState(
    discountResolvedValue && discountResolvedValue.max_percent !== null ? String(discountResolvedValue.max_percent) : '',
  )
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function toggleType(t: string) {
    setTaxableTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
  }

  async function handleSave() {
    setError(null)

    // Number('') is 0 — a blank field must never silently become a 0 rate/price.
    if ((isPrice && (mode === '' || value.trim() === '')) || (isTax && ratePercent.trim() === '')) {
      setError(isTax ? 'Enter a tax rate.' : 'Choose a mode and enter a value.')
      return
    }

    let rawValue: unknown
    if (isPrice) {
      rawValue = { mode, value: Number(value) }
    } else if (isTax) {
      rawValue = { rate: Number(ratePercent) / 100, taxable_types: taxableTypes }
    } else {
      rawValue = { max_percent: maxPercent.trim() === '' ? null : Number(maxPercent) }
    }

    const parsed = parsePricingRuleValue(ruleKey, rawValue)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }

    setSubmitting(true)
    try {
      await setPricingRule(ruleKey, parsed.value)
      onSaved()
    } catch {
      setError('Could not save this rule. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="stack">
      <div className="text-body-sm">Current: {resolved ? describeRule(resolved) : 'Not configured'}</div>
      <FormError message={error} />

      {isPrice ? (
        <div className="grid-2">
          <SelectField
            label="Mode"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            placeholder="Select a mode"
            options={[
              { value: 'markup_percent', label: 'Markup % of cost' },
              { value: 'markup_amount', label: 'Markup $ on cost' },
              { value: 'fixed', label: 'Fixed price' },
            ]}
          />
          <TextField label="Value" type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
      ) : null}

      {isTax ? (
        <div className="stack-sm">
          <TextField
            label="Tax rate (%)"
            type="number"
            step="any"
            value={ratePercent}
            onChange={(e) => setRatePercent(e.target.value)}
          />
          <div className="field">
            <span className="field-label">Taxable item types</span>
            <div className="row">
              {QUOTE_ITEM_TYPES.map((t) => (
                <Checkbox
                  key={t.value}
                  label={t.label}
                  checked={taxableTypes.includes(t.value)}
                  onChange={() => toggleType(t.value)}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {isDiscount ? (
        <TextField
          label="Max discount percent"
          type="number"
          step="any"
          value={maxPercent}
          onChange={(e) => setMaxPercent(e.target.value)}
          hint="Leave blank for no cap."
        />
      ) : null}

      <div>
        <Button type="button" variant="secondary" onClick={handleSave} disabled={submitting}>
          {submitting ? 'Saving…' : 'Save rule'}
        </Button>
      </div>
    </div>
  )
}
