// Acceptance probe, not a release configuration: intentionally fails on current App imports.
import { mergeConfig } from 'vite';
import preview from './vite.static-preview.config.ts';
import { readerBoundary } from './scripts/lib/reader-boundary.mjs';
export default mergeConfig(preview, { plugins: [readerBoundary()] });
