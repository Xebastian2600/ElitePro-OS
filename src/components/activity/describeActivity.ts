// Shared activity description helpers, used by ActivityList (single-entity
// history) and ActivityFeed (cross-entity Command Center / Activity page).
// Pure — no data/Supabase imports.

import type { Activity, EntityType } from '../../shared/types.ts'
import { JOB_STATUSES, LEAD_STATUSES } from '../../shared/types.ts'
import { QUOTE_STATUSES } from '../../quote/types.ts'

function statusLabel(entityType: EntityType, value: unknown): string {
  const str = typeof value === 'string' ? value : String(value)
  const options = entityType === 'job' ? JOB_STATUSES : entityType === 'quote' ? QUOTE_STATUSES : LEAD_STATUSES
  return options.find((s) => s.value === str)?.label ?? str
}

export function entityLabel(entityType: EntityType): string {
  switch (entityType) {
    case 'customer':
      return 'Customer'
    case 'vehicle':
      return 'Vehicle'
    case 'lead':
      return 'Lead'
    case 'job':
      return 'Job'
    case 'quote':
      return 'Quote'
    case 'pricing_rule':
      return 'Pricing rule'
    case 'follow_up':
      return 'Follow-up'
  }
}

// Where an activity row's entity can be viewed. null when there is no page
// for that entity type (vehicles have no standalone page; follow-ups live
// only inside their source record / the Follow-ups queue).
export function entityHref(activity: Activity): string | null {
  switch (activity.entity_type) {
    case 'lead':
      return `/leads/${activity.entity_id}`
    case 'quote':
      return `/quotes/${activity.entity_id}`
    case 'job':
      return `/jobs/${activity.entity_id}`
    case 'customer':
      return `/customers/${activity.entity_id}`
    case 'pricing_rule':
      return '/settings/pricing'
    case 'vehicle':
    case 'follow_up':
      return null
  }
}

function describeFollowUp(activity: Activity): string {
  const { action, metadata } = activity

  if (action === 'follow_up.created') {
    const actionText = typeof metadata.action === 'string' ? metadata.action : ''
    return actionText ? `Follow-up created: ${actionText}` : 'Follow-up created'
  }

  if (action === 'follow_up.status_changed') {
    const to = typeof metadata.to === 'string' ? metadata.to : ''
    if (to === 'done') {
      const after = (metadata.after ?? {}) as Record<string, unknown>
      const outcome = typeof after.outcome === 'string' ? after.outcome : null
      return outcome ? `Follow-up done (${outcome})` : 'Follow-up done'
    }
    if (to === 'cancelled') {
      return 'Follow-up cancelled'
    }
    return `Follow-up status changed to ${to || 'unknown'}`
  }

  if (action === 'follow_up.updated') {
    const changed = Array.isArray(metadata.changed) ? (metadata.changed as string[]) : []
    if (changed.includes('due_at')) return 'Follow-up rescheduled'
    return changed.length > 0 ? `Follow-up updated: ${changed.join(', ')}` : 'Follow-up updated'
  }

  return action
}

export function describeActivity(activity: Activity): string {
  const { action, entity_type, metadata } = activity

  if (entity_type === 'follow_up') return describeFollowUp(activity)

  if (action === 'quote.item_added') {
    const description = typeof metadata.description === 'string' ? metadata.description : ''
    return description ? `Item added: ${description}` : 'Item added'
  }

  if (action === 'quote.item_removed') {
    const description = typeof metadata.description === 'string' ? metadata.description : ''
    return description ? `Item removed: ${description}` : 'Item removed'
  }

  if (action === 'quote.item_updated') {
    const changed = Array.isArray(metadata.changed) ? (metadata.changed as string[]) : []
    return changed.length > 0 ? `Item updated: ${changed.join(', ')}` : 'Item updated'
  }

  if (action === 'pricing_rule.created') {
    const key = typeof metadata.key === 'string' ? metadata.key : ''
    return key ? `Pricing rule set: ${key}` : 'Pricing rule set'
  }

  if (action.endsWith('.created')) {
    return `${entityLabel(entity_type)} created`
  }

  if (action.endsWith('.status_changed')) {
    const from = statusLabel(entity_type, metadata.from)
    const to = statusLabel(entity_type, metadata.to)
    return `Status changed from ${from} to ${to}`
  }

  if (action.endsWith('.updated')) {
    const changed = Array.isArray(metadata.changed) ? (metadata.changed as string[]) : []
    return changed.length > 0 ? `Updated: ${changed.join(', ')}` : 'Updated'
  }

  return action
}
