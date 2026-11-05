import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Closes a sentence built around a raw error message. The offline-snapshot
 * banner places another sentence straight after the reason, and messages such
 * as "Failed to fetch" carry no full stop, so it read "…Failed to fetch
 * Entries are the ones…".
 */
export function endSentence(text: string): string {
  const t = text.trim();
  return t === '' || /[.!?…]$/.test(t) ? t : `${t}.`;
}
