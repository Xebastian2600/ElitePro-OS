// Team lookup — there is no users/profiles table (see docs/workstream-a-data.md
// §8), so this calls the list_team_members() SQL function, which reads
// auth.users via SECURITY DEFINER. Used for owner pickers and activity
// "user" filters.

import { supabase } from '../lib/supabase.ts'
import { unwrap } from './unwrap.ts'

export interface TeamMember {
  id: string
  email: string
}

export async function listTeamMembers(): Promise<TeamMember[]> {
  return unwrap(await supabase.rpc('list_team_members'))
}
