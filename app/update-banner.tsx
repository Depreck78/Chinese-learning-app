import { RefreshCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';

const CHECK_EVERY_MS = 15 * 60 * 1000;
// Must match SHELL_CACHE in public/sw.js.
const SHELL_CACHE = 'hanzi-shell-v1';

/**
 * Offers the newest version as soon as it is deployed. The installed app opens its saved copy
 * when the network is slow, so without this an update could take two launches to appear.
 * Each build has an id (vite.config.ts); /version.json holds the id of the live one.
 */
export function UpdateBanner() {
  const [available, setAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    const check = async () => {
      if (!navigator.onLine || document.visibilityState !== 'visible') return;
      try {
        const response = await fetch('/version.json', { cache: 'no-store' });
        const { build } = (await response.json()) as { build?: string };
        if (build && build !== __BUILD_ID__) setAvailable(true);
      } catch {
        // Offline or blocked: try again later.
      }
    };
    const first = window.setTimeout(() => void check(), 5000);
    const interval = window.setInterval(() => void check(), CHECK_EVERY_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, []);

  async function update() {
    setUpdating(true);
    // Forget the saved page so the reload waits for the new one instead of reopening the old copy.
    await caches.open(SHELL_CACHE).then((cache) => cache.delete('/')).catch(() => undefined);
    window.location.reload();
  }

  if (!available || dismissed) return null;
  return (
    <output className="update-banner">
      <p><b>A new version is ready.</b> Update to get the latest changes.</p>
      <button type="button" className="update-now" onClick={() => void update()} disabled={updating}><RefreshCw size={16} />{updating ? 'Updating…' : 'Update'}</button>
      <button type="button" className="update-later" onClick={() => setDismissed(true)} aria-label="Not now"><X size={18} /></button>
    </output>
  );
}
