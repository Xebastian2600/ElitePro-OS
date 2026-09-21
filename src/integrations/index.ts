// Public API for the integrations boundary. Import from here rather than
// reaching into individual files.

export type { IntegrationAdapter, IntegrationCapability, IntegrationId, IntegrationStatus, InboundLeadEvent } from './types.ts'

export { getIntegration, listIntegrations } from './registry.ts'

export { parseCsv } from './csv.ts'

export { LEAD_IMPORT_COLUMNS, buildLeadImportPreview, importLeads } from './leadImport.ts'
export type {
  ImportLeadsDeps,
  LeadImportCounts,
  LeadImportField,
  LeadImportMapping,
  LeadImportPreview,
  LeadImportResult,
  LeadImportRowOutcome,
  LeadImportRowResult,
  LeadImportRowStatus,
  LogIntegrationEventInput,
} from './leadImport.ts'
