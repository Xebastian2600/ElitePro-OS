// Read-only: activity rows are written exclusively by the log_activity()
// trigger (SECURITY DEFINER) — see supabase/migrations/20260921000000_core_crm.sql.

import { supabase } from '../lib/supabase.ts'
import type { Activity, EntityType } from '../shared/types.ts'
import { unwrap } from './unwrap.ts'

export async function listActivityForEntity(entityType: EntityType, entityId: string, limit = 50): Promise<Activity[]> {
  return unwrap(
    await supabase
      .from('activity')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(limit),
  )
}

export async function listActivityForEntities(
  pairs: Array<{ entityType: EntityType; entityId: string }>,
  limit = 50,
): Promise<Activity[]> {
  if (pairs.length === 0) return []
  const filter = pairs.map((p) => `and(entity_type.eq.${p.entityType},entity_id.eq.${p.entityId})`).join(',')
  return unwrap(
    await supabase.from('activity').select('*').or(filter).order('created_at', { ascending: false }).limit(limit),
  )
}
