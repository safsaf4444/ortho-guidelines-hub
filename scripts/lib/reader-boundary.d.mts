import type { Plugin } from 'vite';
export function forbiddenReaderModules(ids: Iterable<string>): string[];
export function readerBoundary(): Plugin;
