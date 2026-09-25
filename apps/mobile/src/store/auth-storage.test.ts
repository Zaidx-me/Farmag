import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWebStorageAdapter, resolveAuthStorage, type WebStorageLike } from './auth-storage';

// `expo-secure-store`'s web bundle is `export default {}`, so every keychain call
// blows up in a browser. Reproduce that here instead of loading the real module:
// its native build transitively imports Flow-source `react-native`.
vi.mock('expo-secure-store', () => ({
  getItemAsync: async () => {
    throw new Error('SecureStore.getItemAsync is not a function');
  },
  setItemAsync: async () => {
    throw new Error('SecureStore.setItemAsync is not a function');
  },
  deleteItemAsync: async () => {
    throw new Error('SecureStore.deleteItemAsync is not a function');
  },
}));

const silentLogger = () => {};

function createFakeLocalStorage() {
  const entries = new Map<string, string>();
  const local: WebStorageLike = {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
  };
  return { entries, local };
}

const throwingLocalStorage: WebStorageLike = {
  getItem: () => {
    throw new Error('reading localStorage is denied');
  },
  setItem: () => {
    throw new Error('writing localStorage is denied');
  },
  removeItem: () => {
    throw new Error('clearing localStorage is denied');
  },
};

function stubBrowser(localStorage: WebStorageLike): void {
  Object.defineProperty(globalThis, 'window', { value: {}, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: localStorage, configurable: true });
}

function removeBrowserGlobals(): void {
  Reflect.deleteProperty(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'localStorage');
}

describe('createWebStorageAdapter', () => {
  afterEach(() => {
    removeBrowserGlobals();
  });

  it('reads back a value written through the same adapter', async () => {
    // Given
    const { local } = createFakeLocalStorage();
    const storage = createWebStorageAdapter(local, silentLogger);

    // When
    await storage.setItem('poultry-auth', '{"state":{"accessToken":"a"}}');

    // Then
    await expect(storage.getItem('poultry-auth')).resolves.toBe('{"state":{"accessToken":"a"}}');
  });

  it('forgets a value that was removed', async () => {
    // Given
    const { entries, local } = createFakeLocalStorage();
    entries.set('poultry-auth', '{"state":{}}');
    const storage = createWebStorageAdapter(local, silentLogger);

    // When
    await storage.removeItem('poultry-auth');

    // Then
    await expect(storage.getItem('poultry-auth')).resolves.toBeNull();
  });

  it('resolves null for a key that was never written', async () => {
    // Given
    const { local } = createFakeLocalStorage();
    const storage = createWebStorageAdapter(local, silentLogger);

    // When / Then
    await expect(storage.getItem('poultry-auth')).resolves.toBeNull();
  });

  it('resolves instead of rejecting when every underlying call throws', async () => {
    // Given
    const failures: string[] = [];
    const storage = createWebStorageAdapter(throwingLocalStorage, (message) => {
      failures.push(message);
    });

    // When / Then — a rejected promise here is what strands the app on its loading spinner
    await expect(storage.getItem('poultry-auth')).resolves.toBeNull();
    await expect(storage.setItem('poultry-auth', '{"state":{}}')).resolves.toBeUndefined();
    await expect(storage.removeItem('poultry-auth')).resolves.toBeUndefined();
    expect(failures).toHaveLength(3);
  });
});

describe('resolveAuthStorage', () => {
  afterEach(() => {
    removeBrowserGlobals();
  });

  it('writes through localStorage when the platform provides it', async () => {
    // Given
    const { entries, local } = createFakeLocalStorage();
    stubBrowser(local);

    // When
    const storage = resolveAuthStorage(silentLogger);
    await storage.setItem('poultry-auth', '{"state":{}}');

    // Then
    expect(entries.get('poultry-auth')).toBe('{"state":{}}');
  });

  it('falls back to the keychain when localStorage is unusable, and never rejects', async () => {
    // Given — a browser exposing a localStorage without any of the methods we need
    const partialLocalStorage = {} as WebStorageLike;
    stubBrowser(partialLocalStorage);

    // When
    const storage = resolveAuthStorage(silentLogger);

    // Then — no call may reject, or hydration is stranded
    await expect(storage.getItem('poultry-auth')).resolves.toBeNull();
    await expect(storage.setItem('poultry-auth', '{"state":{}}')).resolves.toBeUndefined();
    await expect(storage.removeItem('poultry-auth')).resolves.toBeUndefined();
  });
});
