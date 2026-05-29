import { useEffect, useState, useCallback } from 'react';
import { api, RivalStatus } from '../lib/api';
import { useAuth } from '../components/AuthProvider';

// Tiny shared store so the RivalRadar panel and every PlayerCard's pin button
// see the same watchlist without prop-drilling or a heavier state lib. One poller
// (RivalRadar passes poll:true) keeps "online now" fresh; mutations refresh + emit.
let cache: RivalStatus[] = [];
const listeners = new Set<() => void>();

// Online-now alerts: fire a browser notification when a pinned rival flips
// offline -> online. `primed` seeds the baseline on first poll so we don't flood
// the user with notifications for rivals already online when alerts are enabled.
let prevOnline = new Set<string>();
let primed = false;
let alertsOn = false;

function emit(): void {
  listeners.forEach((l) => l());
}

export function alertsEnabled(): boolean {
  return alertsOn && typeof Notification !== 'undefined' && Notification.permission === 'granted';
}

export function enableRivalAlerts(): Promise<boolean> {
  if (typeof Notification === 'undefined') return Promise.resolve(false);
  if (Notification.permission === 'granted') {
    alertsOn = true;
    emit();
    return Promise.resolve(true);
  }
  return Notification.requestPermission().then((p) => {
    alertsOn = p === 'granted';
    emit();
    return alertsOn;
  });
}

async function refresh(): Promise<void> {
  try {
    const next = await api.getWatchlist();
    const nowOnline = new Set(next.filter((r) => r.online).map((r) => r.playerUserId));

    if (primed && alertsEnabled()) {
      for (const r of next) {
        if (r.online && !prevOnline.has(r.playerUserId)) {
          try {
            new Notification('Rival grinding now', {
              body: `${r.playerName || r.playerUserId} just queued up${r.topRank ? ` (#${r.topRank})` : ''}`,
            });
          } catch {
            // notification can throw on some platforms — never break the poll
          }
        }
      }
    }

    prevOnline = nowOnline;
    primed = true;
    cache = next;
    emit();
  } catch {
    // keep last-known cache on a transient error
  }
}

export function useWatchlist(opts: { poll?: boolean } = {}) {
  const { hasAccess } = useAuth();
  const [, force] = useState(0);

  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  useEffect(() => {
    if (!hasAccess || !opts.poll) return;
    refresh();
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, [hasAccess, opts.poll]);

  const toggle = useCallback(async (userId: string, name: string) => {
    if (cache.some((r) => r.playerUserId === userId)) {
      await api.removeWatch(userId);
    } else {
      await api.addWatch(userId, name);
    }
    await refresh();
  }, []);

  return {
    rivals: cache,
    isWatching: (id: string) => cache.some((r) => r.playerUserId === id),
    toggle,
    hasAccess,
    alertsEnabled: alertsEnabled(),
    enableAlerts: enableRivalAlerts,
  };
}
