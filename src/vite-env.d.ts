/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WS_BASE_URL: string
  readonly VITE_WS_TOKEN: string
  readonly VITE_QUIZ_API_BASE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

export {}