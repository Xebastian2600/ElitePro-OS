import type { CopilotBasis, CopilotItem, CopilotState } from '../../copilot/assess.ts'
import { assessWorkflow } from '../../copilot/assess.ts'
import type { KbCategory } from '../../kb/types.ts'
import { Button } from '../ui/Button.tsx'

export interface CopilotPanelProps {
  state: CopilotState
  onKbLookup?: (kbQuery: { query: string; categories: KbCategory[] }) => void
}

function describeBasis(basis: CopilotBasis): string {
  if (basis.type === 'record') {
    const value = basis.value === null ? 'empty' : basis.value
    return `${basis.entity}.${basis.field} is ${value}`
  }
  if (basis.type === 'pricing_rule') {
    return `pricing rule ${basis.key} (${basis.rule_id ? 'set' : 'not set'})`
  }
  return `calculation issue: ${basis.code}`
}

function CopilotItemRow({ item, onKbLookup }: { item: CopilotItem; onKbLookup?: CopilotPanelProps['onKbLookup'] }) {
  return (
    <div className="stack-sm" style={{ borderBottom: '1px solid var(--color-hairline)', paddingBottom: 'var(--space-xs)' }}>
      <div className="text-body-sm">{item.message}</div>
      <div className="text-caption">Based on: {item.basis.map(describeBasis).join('; ')}</div>
      {item.kbQuery && onKbLookup ? (
        <Button type="button" variant="outline" size="sm" onClick={() => onKbLookup(item.kbQuery!)}>
          Look up in KB
        </Button>
      ) : null}
    </div>
  )
}

function CopilotGroup({
  title,
  items,
  onKbLookup,
}: {
  title: string
  items: CopilotItem[]
  onKbLookup?: CopilotPanelProps['onKbLookup']
}) {
  if (items.length === 0) return null
  return (
    <div className="stack-sm">
      <div className="text-overline">{title}</div>
      <div className="stack-sm">
        {items.map((item) => (
          <CopilotItemRow key={item.id} item={item} onKbLookup={onKbLookup} />
        ))}
      </div>
    </div>
  )
}

export function CopilotPanel({ state, onKbLookup }: CopilotPanelProps) {
  const items = assessWorkflow(state)
  const missing = items.filter((i) => i.kind === 'missing')
  const warnings = items.filter((i) => i.kind === 'warning')
  const nextActions = items.filter((i) => i.kind === 'next_action')

  return (
    <div className="card-soft stack">
      <div>
        <div className="text-heading-sm">Copilot</div>
        <div className="text-caption">Suggestions are based only on this record and configured rules.</div>
      </div>

      {items.length === 0 ? <div className="text-body-sm text-mute">Nothing to flag right now.</div> : null}

      <CopilotGroup title="Missing info" items={missing} onKbLookup={onKbLookup} />
      <CopilotGroup title="Warnings" items={warnings} onKbLookup={onKbLookup} />
      <CopilotGroup title="Next action" items={nextActions} onKbLookup={onKbLookup} />
    </div>
  )
}
