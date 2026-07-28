# Orthopaedic Guidelines Hub

© 2026 Safa Paravakkal. All rights reserved. No licence is granted to reproduce or reuse this code or content structure without permission.

**Live app: https://safsaf4444.github.io/ortho-guidelines-hub/**

A curated, mobile-friendly directory of current orthopaedic guidance for doctors — combining national guidance, specialist society guidance, and local pathways. A navigation tool and quick-reference hub for ward, on-call, and clinic use; not a replacement for source guidance or clinical judgement.

Built with React + TypeScript + Vite, backed by Supabase (with automatic fallback to bundled static data when no database is configured).

## Supabase setup

The app works without a database (falls back to static data), but to enable database mode:

1. Copy `.env.example` to `.env.local`.
2. In [Supabase](https://app.supabase.com) → your project → **Project Settings → API**, copy:
   - **Project URL** (the base URL, e.g. `https://abcdefgh.supabase.co` — not the `/rest/v1/...` endpoint) → `VITE_SUPABASE_URL`
   - **anon / publishable key** → `VITE_SUPABASE_ANON_KEY`
   - **service_role key** (keep secret, never in browser code) → `SUPABASE_SERVICE_ROLE_KEY`
3. Run the schema in the Supabase SQL editor: paste the contents of `supabase-schema.sql` and execute.
4. Seed the database: `npm run seed`
5. Start the app: `npm run dev`

`VITE_*` variables are exposed to the frontend bundle — only put the anon key there, never the service role key. `SUPABASE_SERVICE_ROLE_KEY` is read only by `scripts/seed.ts`.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
