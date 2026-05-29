import { useEffect, useState, useCallback } from 'react';
import { api, RivalStatus } from '../lib/api';
import { useAuth } from '../components/AuthProvider';

// Tiny shared store so the RivalRadar panel and every PlayerCard's pin button
// see the same watchlist without prop-drilling or a heavier state lib. One poller
// (RivalRadar passes poll:true) keeps "online now" fresh; mutations refresh + emit.
let cache: RivalStatus[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

async function refresh(): Promise<void> {
  try {
    cache = await api.getWatchlist();
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
  };
}
