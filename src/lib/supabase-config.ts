/**
 * Pure browser connection policy. No client, I/O, credentials or defaults.
 * The public deployment origin is already documented in this repository.
 * Production connection inputs remain supplied by deploy.yml, unchanged.
 */
export const DEPLOYED_APP_ORIGIN = 'https://safsaf4444.github.io';

export interface BrowserDatabaseEnvironment {
  url?: unknown;
  anonKey?: unknown;
  allowRemoteInLocal?: unknown;
}
export interface BrowserDatabaseContext {
  productionBuild: boolean;
  mode: string;
  origin?: string;
}
export type BrowserDatabaseDecision =
  | { enabled: true; url: string; anonKey: string; reason: 'local' | 'explicit-production' | 'explicit-local-remote-opt-in' }
  | { enabled: false; reason: 'missing-configuration' | 'invalid-url' | 'invalid-public-key' | 'missing-runtime-origin' | 'remote-test-target' | 'remote-local-target' | 'local-production-target' };

export function isLoopbackHostname(hostname: string): boolean {
  if (['localhost','::1','[::1]'].includes(hostname.toLowerCase())) return true;
  // URL has already parsed/canonicalised an IPv4 literal. DNS suffixes do not match.
  return /^127(?:\.(?:0|[1-9][0-9]{0,2})){3}$/.test(hostname)
    && hostname.split('.').every((part) => Number(part) <= 255);
}

export function isPublicBrowserKey(key: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(key)) return true;
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) return false;
  try {
    const part = key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
    const payload = JSON.parse(atob(part + '='.repeat((4 - part.length % 4) % 4))) as { role?: unknown };
    return payload.role === 'anon';
  } catch { return false; }
}

export function resolveBrowserDatabase(
  environment: BrowserDatabaseEnvironment,
  context: BrowserDatabaseContext,
): BrowserDatabaseDecision {
  const url = typeof environment.url === 'string' ? environment.url.trim() : '';
  const anonKey = typeof environment.anonKey === 'string' ? environment.anonKey.trim() : '';
  if (!url || !anonKey) return { enabled:false, reason:'missing-configuration' };
  let target: URL;
  try { target = new URL(url); } catch { return { enabled:false, reason:'invalid-url' }; }
  const local = isLoopbackHostname(target.hostname);
  if (!['http:','https:'].includes(target.protocol) || (!local && target.protocol !== 'https:')
      || target.username || target.password || target.search || target.hash || target.pathname !== '/') {
    return { enabled:false, reason:'invalid-url' };
  }
  if (!isPublicBrowserKey(anonKey)) return { enabled:false, reason:'invalid-public-key' };
  if (!context.origin || context.origin === 'null') return { enabled:false, reason:'missing-runtime-origin' };
  if (local && context.productionBuild && context.origin === DEPLOYED_APP_ORIGIN) return { enabled:false, reason:'local-production-target' };
  if (local) return { enabled:true, url:target.origin, anonKey, reason:'local' };
  // Test mode never accepts remote endpoints, including explicit opt-in.
  if (context.mode === 'test') return { enabled:false, reason:'remote-test-target' };
  // A production-mode bundle served by localhost/LAN/preview is NOT deployment.
  if (context.productionBuild && context.origin === DEPLOYED_APP_ORIGIN) {
    return { enabled:true, url:target.origin, anonKey, reason:'explicit-production' };
  }
  if (environment.allowRemoteInLocal === 'true') {
    return { enabled:true, url:target.origin, anonKey, reason:'explicit-local-remote-opt-in' };
  }
  return { enabled:false, reason:'remote-local-target' };
}
