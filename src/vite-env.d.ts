declare module '*.mjs?url' {
  const url: string;
  export default url;
}

declare module '*.svg' {
  const url: string;
  export default url;
}

interface ImportMetaEnv {
  readonly VITE_ENABLE_SERVER_API?: string;
  readonly VITE_BILLING_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
