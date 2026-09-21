// Integration boundary types.
//
// Dialpad (telephony), GoHighLevel/GHL (CRM/marketing) and Housecall Pro/HCP
// are NOT implemented here — this module only fixes the shape a real
// adapter will conform to, so the rest of the app (and the CSV/manual lead
// importer) can be built against a stable contract today. No network calls,
// no env reads, no fabricated data belong in this file or in registry.ts.
//
// Whatever produces a lead — a future adapter, the CSV importer, or a
// manual entry form — normalizes it to InboundLeadEvent before it reaches
// Workstream A's customers/leads tables, and every exchange with an
// external system is recorded via logIntegrationEvent
// (src/data/integrationEvents.ts).

export type IntegrationId = 'dialpad' | 'ghl' | 'hcp'

export type IntegrationStatus = 'not_configured' | 'configured' | 'error'

// Descriptive only — what an adapter *could* do once implemented. Not wired
// to any permission, billing, or feature-flag system.
export type IntegrationCapability = 'import_leads' | 'log_calls' | 'sync_jobs' | 'send_messages'

// Minimal contract a future adapter implements. Kept small on purpose:
// adapters register themselves (src/integrations/registry.ts), report a
// status, and describe what they can do. Data-moving methods — e.g. a
// future `pullEvents(): Promise<InboundLeadEvent[]>` that polls an API or
// receives a webhook, then hands events to an importLeads-style
// orchestrator — are deliberately not part of this interface yet. Add them
// when a real adapter is built, not speculatively now.
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
