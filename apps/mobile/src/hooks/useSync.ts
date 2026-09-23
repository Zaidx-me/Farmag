import { useCallback, useEffect, useRef, useState } from 'react';
import * as Network from 'expo-network';
import { AppState } from 'react-native';

import { syncCounts, syncNow } from '../services/sync';

export interface UseSyncResult {
  syncing: boolean;
  lastSyncAt: string | null;
  pendingCount: number;
  failedCount: number;
  refresh: () => Promise<void>;
}

export function useSync(): UseSyncResult {
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const inFlight = useRef(false);

  const refreshCounts = useCallback(async () => {
    const counts = await syncCounts();
    setPendingCount(counts.pending);
    setFailedCount(counts.failed);
  }, []);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSyncing(true);
    try {
      await syncNow();
      setLastSyncAt(new Date().toISOString());
    } catch {
      // sync failures surface via pendingCount/failedCount — never crash the UI
    } finally {
      inFlight.current = false;
      setSyncing(false);
      await refreshCounts();
    }
  }, [refreshCounts]);

  useEffect(() => {
    void refresh();

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });

    const networkSub = Network.addNetworkStateListener((state) => {
      if (state.isConnected) void refresh();
    });

    return () => {
      appStateSub.remove();
      networkSub.remove();
    };
  }, [refresh]);

  return { syncing, lastSyncAt, pendingCount, failedCount, refresh };
}