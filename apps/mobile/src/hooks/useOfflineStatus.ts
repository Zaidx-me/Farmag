import { useCallback, useEffect, useRef, useState } from 'react';
import * as Network from 'expo-network';
import { AppState } from 'react-native';

import { syncCounts, syncNow } from '../services/sync';

export type OfflinePhase = 'none' | 'queued' | 'syncing' | 'error' | 'synced';

export interface UseOfflineStatusResult {
  isOffline: boolean;
  queueCount: number;
  failedCount: number;
  syncing: boolean;
  lastSyncedAt: string | null;
  offlinePhase: OfflinePhase;
  refresh: () => Promise<void>;
}

/**
 * Global offline/sync status for the app shell. Combines the live network
 * state (expo-network) with the durable sync outbox counts (T29 queue over
 * T28 sqlite) and derives a single `offlinePhase` for the top-right indicator:
 * syncing > error (failed ops) > queued (pending ops) > synced > none.
 */
export function useOfflineStatus(): UseOfflineStatusResult {
  const [isOffline, setIsOffline] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [queueCount, setQueueCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const inFlight = useRef(false);

  const refreshCounts = useCallback(async () => {
    const counts = await syncCounts();
    setQueueCount(counts.pending);
    setFailedCount(counts.failed);
  }, []);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSyncing(true);
    try {
      await syncNow();
      setLastSyncedAt(new Date().toISOString());
    } catch {
      // sync failures surface via failedCount — never crash the UI
    } finally {
      inFlight.current = false;
      setSyncing(false);
      await refreshCounts();
    }
  }, [refreshCounts]);

  useEffect(() => {
    let mounted = true;

    const updateNetwork = (state: Network.NetworkState) => {
      setIsOffline(state.isConnected !== true || state.isInternetReachable === false);
    };

    void Network.getNetworkStateAsync().then((state) => {
      if (mounted) updateNetwork(state);
    });

    const networkSub = Network.addNetworkStateListener((state) => {
      updateNetwork(state);
      if (state.isConnected) void refresh();
    });

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });

    void refresh();

    return () => {
      mounted = false;
      networkSub.remove();
      appStateSub.remove();
    };
  }, [refresh]);

  const offlinePhase: OfflinePhase = syncing
    ? 'syncing'
    : failedCount > 0
      ? 'error'
      : queueCount > 0
        ? 'queued'
        : lastSyncedAt !== null
          ? 'synced'
          : 'none';

  return { isOffline, queueCount, failedCount, syncing, lastSyncedAt, offlinePhase, refresh };
}