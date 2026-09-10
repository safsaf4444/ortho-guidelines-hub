import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

/**
 * Service-worker update lifecycle.
 *
 * THE PROBLEM THIS EXISTS TO FIX
 * The app previously used registerType 'autoUpdate'. A new worker installed and
 * claimed clients, but an already-open tab carried on rendering the bytes it
 * had. A deploy would land and the page would look unchanged, with nothing to
 * say a newer version existed. That is the mechanism behind the stale-worker
 * gotcha in this project's history, where a page appeared not to have updated
 * and a verification pass drew the wrong conclusion from it.
 *
 * WHAT IT DOES NOW
 * Registration happens here rather than via an injected script, so the app can
 * see the lifecycle. `needRefresh` goes true only when the browser reports a
 * NEW worker sitting in the waiting state — which happens when the served build
 * genuinely differs from the cached one. It is not set on an ordinary load, and
 * not on a first visit (that is onOfflineReady). So the prompt appearing is
 * itself evidence that a different build is on the server.
 *
 * WHY POLL AT ALL
 * The browser checks for a new worker on navigation. A tab left open on a ward
 * screen for a week never navigates, so it would never notice a deploy. The
 * interval below, plus a check when the tab becomes visible again, closes that
 * without being chatty: both call update(), which is a conditional request the
 * server answers with a 304 when nothing has changed.
 */

/** How often an open tab asks the server whether a newer worker exists. */
const UPDATE_POLL_MS = 60 * 60 * 1000; // 1 hour

export interface PwaUpdateState {
  /** True only while a new worker is waiting to take over. */
  needRefresh: boolean;
  /** True once the app has been cached and will work offline. First visit only. */
  offlineReady: boolean;
  /** Activates the waiting worker and reloads the page. */
  updateNow: () => void;
  /** Dismisses the prompt without updating. The worker stays waiting. */
  dismiss: () => void;
}

export function usePwaUpdate(): PwaUpdateState {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [updateSW, setUpdateSW] = useState<((reload?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    // Guard for environments without a worker: the dev server (devOptions is
    // off), non-secure origins, and any browser with service workers disabled.
    // registerSW is safe to call regardless, but the polling below is pointless
    // and the registration object would be undefined.
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    let timer: number | undefined;
    let registration: ServiceWorkerRegistration | undefined;

    const update = registerSW({
      immediate: true,
      onNeedRefresh() {
        // A different build is on the server, waiting. This is the ONLY path
        // that raises the prompt.
        setNeedRefresh(true);
      },
      onOfflineReady() {
        setOfflineReady(true);
      },
      onRegisteredSW(_swUrl: string, r: ServiceWorkerRegistration | undefined) {
        registration = r;
        if (!r) return;
        timer = window.setInterval(() => {
          // Conditional request; a 304 when nothing changed.
          void r.update();
        }, UPDATE_POLL_MS);
      },
      onRegisterError(err: unknown) {
        // Never surface this. A failed registration means no offline support,
        // which is a degraded but working site — not something to interrupt a
        // clinician mid-search about.
        console.warn('[pwa] service worker registration failed:', err);
      },
    });

    setUpdateSW(() => update);

    // A tab restored after days is the common case for a stale view; ask
    // immediately rather than waiting up to an hour for the interval.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && registration) void registration.update();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (timer !== undefined) window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return {
    needRefresh,
    offlineReady,
    updateNow: () => {
      setNeedRefresh(false);
      // updateSW(true) skips waiting and reloads. When registration failed we
      // have no updater, so fall back to a plain reload rather than doing
      // nothing after the user clicked a button that says it will reload.
      if (updateSW) void updateSW(true);
      else window.location.reload();
    },
    dismiss: () => setNeedRefresh(false),
  };
}
