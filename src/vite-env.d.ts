/// <reference types="vite/client" />

/**
 * The Supabase service-role key, injected at bundle time by vite.config.ts.
 *
 * Populated ONLY under `vite dev` (command === 'serve'). Every production
 * build substitutes the empty string, which is what makes local-editor mode
 * structurally impossible to ship — see the comment block in vite.config.ts
 * and src/lib/supabase.ts.
 */
declare const __LOCAL_EDITOR_KEY__: string;
