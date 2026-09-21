// Integration adapter registry. These three entries are placeholders — no network
// calls, no live or fabricated data — so the UI has something honest to show
// ("Dialpad: not connected") before a real adapter is built.
//
// To add a real adapter: implement IntegrationAdapter in its own file and register it
// below; normalize its input to InboundLeadEvent (src/integrations/types.ts); write
// through with importLeads-style orchestration (src/integrations/leadImport.ts) and
// log every exchange with logIntegrationEvent; never call Workstream A/B tables
// directly from adapter code — always go through src/data/*.ts.

import type { IntegrationAdapter, IntegrationId, IntegrationStatus } from './types.ts'

function notConfigured(): IntegrationStatus {
  return 'not_configured'
}

const ADAPTERS: IntegrationAdapter[] = [
  {
    id: 'dialpad',
    name: 'Dialpad',
    description: 'Not connected. Adapter boundary only — no data is exchanged.',
    capabilities: ['log_calls', 'import_leads'],
    status: notConfigured,
  },
  {
    id: 'ghl',
    name: 'GoHighLevel',
    description: 'Not connected. Adapter boundary only — no data is exchanged.',
    capabilities: ['import_leads', 'send_messages'],
    status: notConfigured,
  },
  {
    id: 'hcp',
    name: 'Housecall Pro',
    description: 'Not connected. Adapter boundary only — no data is exchanged.',
    capabilities: ['sync_jobs', 'import_leads'],
    status: notConfigured,
  },
]

export function listIntegrations(): IntegrationAdapter[] {
  return ADAPTERS
}

export function getIntegration(id: IntegrationId): IntegrationAdapter | null {
  return ADAPTERS.find((adapter) => adapter.id === id) ?? null
}
