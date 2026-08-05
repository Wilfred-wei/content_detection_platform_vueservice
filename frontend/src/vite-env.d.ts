/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly BASE_URL: string
  readonly VITE_AGENT_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
