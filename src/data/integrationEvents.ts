// integration_events: append-only event log for future Dialpad/GHL/HCP/CSV
// adapters (src/integrations/**). This file owns the table; the adapter
// registry consumes it by calling logIntegrationEvent(). Starts EMPTY — no
// seed rows are ever inserted here.

import { supabase } from '../lib/supabase.ts'
import { ValidationError } from './errors.ts'
import { unwrap } from './unwrap.ts'

export type IntegrationEventSource = 'dialpad' | 'ghl' | 'hcp' | 'csv' | 'manual'
export type IntegrationEventDirection = 'inbound' | 'outbound'
export type IntegrationEventStatus = 'received' | 'processed' | 'failed' | 'skipped'

const SOURCES: IntegrationEventSource[] = ['dialpad', 'ghl', 'hcp', 'csv', 'manual']
const DIRECTIONS: IntegrationEventDirection[] = ['inbound', 'outbound']
const STATUSES: IntegrationEventStatus[] = ['received', 'processed', 'failed', 'skipped']

export interface IntegrationEvent {
  id: string
  source: IntegrationEventSource
  direction: IntegrationEventDirection
  event_type: string
  status: IntegrationEventStatus
  entity_type: string | null
  entity_id: string | null
  payload: Record<string, unknown>
  error: string | null
  actor_id: string | null
  created_at: string
}

export interface IntegrationEventInput {
  source: IntegrationEventSource
  direction: IntegrationEventDirection
  event_type: string
  status?: IntegrationEventStatus
  entity_type?: string | null
  entity_id?: string | null
  payload?: Record<string, unknown>
  error?: string | null
}

export async function listIntegrationEvents(
  options: { source?: IntegrationEventSource; limit?: number } = {},
): Promise<IntegrationEvent[]> {
  let query = supabase.from('integration_events').select('*').order('created_at', { ascending: false })
  if (options.source) query = query.eq('source', options.source)
  query = query.limit(options.limit ?? 50)
  return unwrap(await query)
}

export async function logIntegrationEvent(input: IntegrationEventInput): Promise<IntegrationEvent> {
  const errors: Record<string, string> = {}

  if (!SOURCES.includes(input.source)) errors.source = 'Invalid integration source.'
  if (!DIRECTIONS.includes(input.direction)) errors.direction = 'Invalid direction.'

  const event_type = (input.event_type ?? '').trim()
  if (!event_type) errors.event_type = 'event_type is required.'

  const status = input.status ?? 'received'
  if (!STATUSES.includes(status)) errors.status = 'Invalid status.'

  if (Object.keys(errors).length > 0) throw new ValidationError(errors)

  return unwrap(
    await supabase
      .from('integration_events')
      .insert({
        source: input.source,
        direction: input.direction,
        event_type,
        status,
        entity_type: input.entity_type ?? null,
        entity_id: input.entity_id ?? null,
        payload: input.payload ?? {},
        error: input.error ?? null,
      })
      .select('*')
      .single(),
  )
}
