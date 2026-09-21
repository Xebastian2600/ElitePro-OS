// Cross-entity activity feed for the Command Center. Read-only: activity
// rows are written exclusively by the log_activity() trigger — see
// src/data/activity.ts (kept untouched; this is the multi-entity/date-range
// sibling of it).

import { supabase } from '../lib/supabase.ts'
import type { Activity, EntityType } from '../shared/types.ts'
import { unwrap } from './unwrap.ts'

export interface ListActivityFeedOptions {
  from?: string
  to?: string
  actorId?: string
  entityTypes?: EntityType[]
  limit?: number
  // created_at cursor for paging: pass the last row's created_at to fetch
  // the next older page.
  before?: string
}

export async function listActivityFeed(options: ListActivityFeedOptions = {}): Promise<Activity[]> {
  let query = supabase.from('activity').select('*').order('created_at', { ascending: false })

  if (options.from) query = query.gte('created_at', options.from)
  if (options.to) query = query.lt('created_at', options.to)
  if (options.before) query = query.lt('created_at', options.before)
  if (options.actorId) query = query.eq('actor_id', options.actorId)
  if (options.entityTypes && options.entityTypes.length > 0) query = query.in('entity_type', options.entityTypes)
  query = query.limit(options.limit ?? 100)

  return unwrap(await query)
}
