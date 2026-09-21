/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  // Optional: base URL of the KB search backend. Unset -> KB features are
  // unavailable (see src/kb/client.ts) rather than an app crash.
  readonly VITE_KB_SEARCH_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
