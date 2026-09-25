/**
 * Platform-aware async key/value storage for the persisted auth session.
 *
 * `expo-secure-store` is the right store on a device (keychain / keystore), but its
 * web bundle is literally `export default {}`, so every keychain call throws in a
 * browser. zustand's `persist` treats a rejected storage read as "hydration failed"
 * and never reports it, which used to strand `status` on `'restoring'` forever.
 * Every method below therefore swallows failures and degrades to "no session".
 */

/** Synchronous key/value surface — structurally satisfied by `window.localStorage`. */
export interface WebStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Async surface consumed by zustand's `persist`; it satisfies zustand's `StateStorage`. */
export interface AuthStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type StorageLogger = (message: string, error: unknown) => void;

const consoleLogger: StorageLogger = (message, error) => {
  console.warn(`[auth-storage] ${message}`, error);
};

export function createWebStorageAdapter(
  local: WebStorageLike,
  log: StorageLogger = consoleLogger
): AuthStorage {
  return {
    async getItem(key) {
      try {
        return local.getItem(key);
      } catch (error) {
        log(`read of "${key}" failed, treating the session as absent`, error);
        return null;
      }
    },
    async setItem(key, value) {
      try {
        local.setItem(key, value);
      } catch (error) {
        log(`write of "${key}" failed, the session will not survive a restart`, error);
      }
    },
    async removeItem(key) {
      try {
        local.removeItem(key);
      } catch (error) {
        log(`removal of "${key}" failed`, error);
      }
    },
  };
}

type SecureStoreModule = typeof import('expo-secure-store');

let secureStore: Promise<SecureStoreModule> | undefined;

/**
 * Loaded on first use, not at import time: the native build of `expo-secure-store`
 * reaches `react-native` at module scope, which only a Metro/babel pipeline can parse.
 */
function loadSecureStore(): Promise<SecureStoreModule> {
  secureStore ??= import('expo-secure-store');
  return secureStore;
}

export function createSecureStoreAdapter(log: StorageLogger = consoleLogger): AuthStorage {
  return {
    async getItem(key) {
      try {
        const { getItemAsync } = await loadSecureStore();
        return await getItemAsync(key);
      } catch (error) {
        log(`keychain read of "${key}" failed, treating the session as absent`, error);
        return null;
      }
    },
    async setItem(key, value) {
      try {
        const { setItemAsync } = await loadSecureStore();
        await setItemAsync(key, value);
      } catch (error) {
        log(`keychain write of "${key}" failed, the session will not survive a restart`, error);
      }
    },
    async removeItem(key) {
      try {
        const { deleteItemAsync } = await loadSecureStore();
        await deleteItemAsync(key);
      } catch (error) {
        log(`keychain removal of "${key}" failed`, error);
      }
    },
  };
}

function readLocalStorage(log: StorageLogger): WebStorageLike | null {
  // `window` exists in browsers and in React Native, but React Native has no localStorage.
  if (typeof window === 'undefined') return null;

  let local: WebStorageLike | undefined;
  try {
    // Browsers throw from this getter alone when storage is blocked (private mode, policy).
    local = (globalThis as { localStorage?: WebStorageLike }).localStorage;
  } catch (error) {
    log('localStorage is not reachable on this platform', error);
    return null;
  }

  if (!local) return null;
  const usable =
    typeof local.getItem === 'function' &&
    typeof local.setItem === 'function' &&
    typeof local.removeItem === 'function';
  return usable ? local : null;
}

/** Browser storage when the platform has it, the keychain otherwise. Never rejects. */
export function resolveAuthStorage(log: StorageLogger = consoleLogger): AuthStorage {
  const local = readLocalStorage(log);
  return local ? createWebStorageAdapter(local, log) : createSecureStoreAdapter(log);
}
