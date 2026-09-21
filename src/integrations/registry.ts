// Integration adapter registry.
//
// These three entries are placeholders: no network calls, no env reads, no
// live or fabricated data. They exist so the UI has something honest to
// show ("Dialpad: not connected") and so the shape of a real adapter is
// settled before one is built.
//
// To add a real adapter later:
//   1. Implement IntegrationAdapter (id/name/description/capabilities/status)
//      in its own file under src/integrations/ and register it below.
//   2. Have it normalize whatever it receives (webhook payload, poll
//      response, manual sync, ...) into InboundLeadEvent
//      (src/integrations/types.ts).
//   3. Write it through with an importLeads-style orchestration (see
//      src/integrations/leadImport.ts) — findCustomerMatches, then reuse or
//      createCustomer, then createLead — and log every exchange with
//      logIntegrationEvent (src/data/integrationEvents.ts).
//   4. Never call Workstream A/B tables (customers, leads, vehicles, jobs,
//      quotes, pricing_rules) directly from adapter code — always go
//      through src/data/*.ts so validation and dedup stay centralized.

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
