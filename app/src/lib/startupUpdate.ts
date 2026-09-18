import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';

export type UpdatePhase = 'checking' | 'downloading' | 'ready';

// Tight bounds on how long the splash can linger on a slow/offline launch. On timeout we launch the
// cached bundle anyway — expo-updates' built-in ON_LOAD downloader still fetches the update in the
// background and applies it on the NEXT launch, so nothing is lost; we just don't apply it on THIS one.
const CHECK_TIMEOUT = 3000;
const DOWNLOAD_TIMEOUT = 12000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms))]);
}

/**
 * On a production cold start, check EAS Update for a newer JS bundle and, if one is ready, download
 * and apply it BEFORE showing the app — so users run the latest bundle immediately instead of
 * waiting for expo-updates' default "apply on next launch". Runs once on mount; bounded by the
 * timeouts above and fails open (launches the cached bundle) on any error. No-op in dev / Expo Go
 * and on web, where Updates is disabled — so it never blocks local development. Pure JS: it ships
 * over-the-air itself, no rebuild.
 */
export function useStartupUpdate(): UpdatePhase {
  const [phase, setPhase] = useState<UpdatePhase>(Updates.isEnabled ? 'checking' : 'ready');

  useEffect(() => {
    if (!Updates.isEnabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const check = await withTimeout(Updates.checkForUpdateAsync(), CHECK_TIMEOUT);
        if (cancelled) return;
        if (check?.isAvailable) {
          setPhase('downloading');
          const fetched = await withTimeout(Updates.fetchUpdateAsync(), DOWNLOAD_TIMEOUT);
          if (cancelled) return;
          if (fetched?.isNew) {
            await Updates.reloadAsync(); // restarts into the new bundle — never returns
            return;
          }
        }
      } catch {
        // registry unreachable / fetch failed — fall through and launch the cached bundle
      }
      if (!cancelled) setPhase('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return phase;
}
