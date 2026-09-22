/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** رابط مصدر مباريات الـAPI (يُربط لاحقاً) — عند تعبئته تعمل كل المباريات من المصدر الحقيقي */
  readonly VITE_FIXTURES_API_URL?: string;
  readonly VITE_FIXTURES_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}