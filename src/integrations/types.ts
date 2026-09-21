// Integration boundary types. Dialpad, GHL and HCP adapters aren't implemented yet —
// this module only fixes the shape they'll conform to, so the rest of the app can be
// built against a stable contract today. No network calls or fabricated data here.
//
// Every lead source (future adapter, CSV importer, manual entry) normalizes to
// InboundLeadEvent, and every exchange with an external system is recorded via
// logIntegrationEvent (src/data/integrationEvents.ts).

export type IntegrationId = 'dialpad' | 'ghl' | 'hcp'

export type IntegrationStatus = 'not_configured' | 'configured' | 'error'

// Descriptive only — what an adapter *could* do once implemented. Not wired
// to any permission, billing, or feature-flag system.
export type IntegrationCapability = 'import_leads' | 'log_calls' | 'sync_jobs' | 'send_messages'

// Adapters register in src/integrations/registry.ts and report status/capabilities only.
// Data-moving methods (e.g. a future pullEvents()) aren't part of this interface yet —
// add them when a real adapter is built, not speculatively now.
export interface IntegrationAdapter {
  id: IntegrationId
  name: string
  description: string
  capabilities: IntegrationCapability[]
  status(): IntegrationStatus
}

// Normalized shape every inbound lead source must produce before it is
// handed to createCustomer/createLead (src/data/customers.ts, src/data/leads.ts).
export interface InboundLeadEvent {
  source: IntegrationId | 'csv' | 'manual'
  external_id: string | null
  customer: {
    name: string
    phone: string | null
    email: string | null
    address: string | null
  }
  lead: {
    source: string | null
    request: string | null
  }
  received_at: string
}
