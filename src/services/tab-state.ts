/**
 * Hand-off between two page loads of the same tab, kept in the page's `sessionStorage` (tab-scoped and
 * readable synchronously before the next page detects its chapter).
 */

/** What the previous page asked the next one to do. */
export interface NavigationIntent {
  /** Open the reader without waiting for the launcher (the user navigated from inside the reader). */
  autostart: boolean;
  /** Pathname of the chapter to open on its last page (the user went back to the previous chapter). */
  openAtEndPath: string | null;
}

/** State inherited from version 1.x keys, consumed once. */
export interface LegacyTabState {
  /** Page saved by 1.x for the current pathname. */
  position: number | null;
}

/** Keys of the hand-off, in the page's `sessionStorage`. */
export const TAB_KEYS = {
  autostart: 'mr:autostart',
  openAtEnd: 'mr:openAtEnd',
} as const;

const LEGACY_TAB_KEYS = {
  autostart: 'yomu:autostart',
  openAtEnd: 'yomu:startAtEnd',
  positionPrefix: 'yomu:pos:',
} as const;

const AUTOSTART_VALUE = '1';

/** Minimal `Storage` surface, so tests can pass a fake. */
export type TabStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

function safeGet(store: TabStorage, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function safeRemove(store: TabStorage, key: string): void {
  try {
    store.removeItem(key);
  } catch {
    // Storage blocked (private mode, sandboxed frame): nothing to clean.
  }
}

function safeSet(store: TabStorage, key: string, value: string): void {
  try {
    store.setItem(key, value);
  } catch {
    // Storage blocked or full: the next page simply won't auto-open.
  }
}

/** Reads and clears the intent left by the previous page (new keys first, then the 1.x ones). */
export function takeNavigationIntent(store: TabStorage): NavigationIntent {
  const autostart =
    safeGet(store, TAB_KEYS.autostart) === AUTOSTART_VALUE ||
    safeGet(store, LEGACY_TAB_KEYS.autostart) === AUTOSTART_VALUE;
  const openAtEndPath = safeGet(store, TAB_KEYS.openAtEnd) ?? safeGet(store, LEGACY_TAB_KEYS.openAtEnd);
  for (const key of [
    TAB_KEYS.autostart,
    TAB_KEYS.openAtEnd,
    LEGACY_TAB_KEYS.autostart,
    LEGACY_TAB_KEYS.openAtEnd,
  ]) {
    safeRemove(store, key);
  }
  return { autostart, openAtEndPath };
}

/** Leaves an intent for the page about to be loaded in this tab. */
export function leaveNavigationIntent(store: TabStorage, intent: NavigationIntent): void {
  if (intent.autostart) safeSet(store, TAB_KEYS.autostart, AUTOSTART_VALUE);
  if (intent.openAtEndPath !== null) safeSet(store, TAB_KEYS.openAtEnd, intent.openAtEndPath);
}

function legacyPositionKeys(store: TabStorage): string[] {
  const keys: string[] = [];
  try {
    for (let index = 0; index < store.length; index++) {
      const key = store.key(index);
      if (key?.startsWith(LEGACY_TAB_KEYS.positionPrefix)) keys.push(key);
    }
  } catch {
    // Storage blocked: nothing to migrate.
  }
  return keys;
}

/**
 * One-time migration of the 1.x `yomu:pos:<pathname>` keys: returns the position saved for `pathname`
 * and deletes every legacy position key of this tab.
 */
export function takeLegacyTabState(store: TabStorage, pathname: string): LegacyTabState {
  const raw = safeGet(store, LEGACY_TAB_KEYS.positionPrefix + pathname);
  const page = raw === null ? Number.NaN : Number.parseInt(raw, 10);
  for (const key of legacyPositionKeys(store)) safeRemove(store, key);
  return { position: Number.isInteger(page) && page >= 0 ? page : null };
}
