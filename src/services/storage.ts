/**
 * Typed extension storage: one item per piece of persisted state, plus the one-time migration from the
 * legacy `yomu*` keys written by version 1.x.
 */
import { storage } from '@wxt-dev/storage';
import { browser, type Browser } from 'wxt/browser';
import { normalizeSettings } from '@/domain/settings';
import { siteHost } from '@/domain/site-host';
import { isRecord } from '@/domain/guards';
import type { Settings } from '@/shared/types';

/** A site activation started in the popup and finished by the service worker once the permission lands. */
export interface PendingActivation {
  host: string;
  /** Tab to start the reader in right away, when known. */
  tabId?: number;
}

/** Last page seen in one chapter. */
export interface ReadingPosition {
  page: number;
  /** `Date.now()` of the last update, used to evict the oldest entries. */
  savedAt: number;
}

/** Saved positions, keyed by {@link chapterPositionKey}. */
export type ReadingPositions = Record<string, ReadingPosition>;

/** Above this many chapters, the least recently read positions are dropped. */
export const MAX_READING_POSITIONS = 300;

/** Reader settings, synced across the user's browsers. Read through {@link loadSettings} to normalize. */
export const settingsItem = storage.defineItem<unknown>('sync:settings', { fallback: null });

/** Hosts (normalized by `siteHost`) where the user enabled the reader. */
export const enabledSitesItem = storage.defineItem<string[]>('sync:enabledSites', { fallback: [] });

/** Activation waiting for its host permission (the popup may close while Chrome asks). */
export const pendingActivationItem = storage.defineItem<PendingActivation | null>(
  'session:pendingActivation',
  { fallback: null },
);

/**
 * Reading positions for the browser session. `storage.session` is opened to content scripts by the
 * service worker (see {@link allowSessionStorageInContentScripts}); reads fail softly until then.
 */
export const readingPositionsItem = storage.defineItem<ReadingPositions>('session:readingPositions', {
  fallback: {},
});

/** Legacy keys of version 1.x, removed by {@link migrateLegacyStorage}. */
export const LEGACY_KEYS = {
  settings: 'sync:yomuSettings',
  sites: 'sync:yomuSites',
  pending: 'session:yomuPending',
} as const;

/** Current settings, with invalid or missing values replaced by the defaults. */
export async function loadSettings(): Promise<Settings> {
  return normalizeSettings(await settingsItem.getValue());
}

/** Persists the settings (the popup and every open reader are notified through {@link watchSettings}). */
export async function saveSettings(settings: Settings): Promise<void> {
  await settingsItem.setValue(normalizeSettings(settings));
}

/** Calls `onChange` with normalized settings whenever they change. Returns the function that stops it. */
export function watchSettings(onChange: (settings: Settings) => void): () => void {
  return settingsItem.watch((value) => {
    onChange(normalizeSettings(value));
  });
}

/** Normalizes, de-duplicates and sorts a list of hosts read from storage. */
export function normalizeSiteList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const hosts = raw.map((value: unknown) => (typeof value === 'string' ? siteHost(value) : null));
  return [...new Set(hosts.filter((host): host is string => host !== null))].sort();
}

function parsePending(raw: unknown): PendingActivation | null {
  if (!isRecord(raw) || typeof raw.host !== 'string') return null;
  const host = siteHost(raw.host);
  if (host === null) return null;
  return typeof raw.tabId === 'number' ? { host, tabId: raw.tabId } : { host };
}

/** Key identifying one chapter: the page URL without its hash, plus the chapter label (same-URL sites). */
export function chapterPositionKey(url: URL, chapterLabel: string): string {
  return `${url.origin}${url.pathname}${url.search}|${chapterLabel}`;
}

/** Saved page for a chapter, or `null`. Never throws (session storage may not be open to us yet). */
export async function loadReadingPosition(key: string): Promise<number | null> {
  try {
    const positions = await readingPositionsItem.getValue();
    return positions[key]?.page ?? null;
  } catch {
    return null;
  }
}

function evictOldest(positions: ReadingPositions): ReadingPositions {
  const entries = Object.entries(positions);
  if (entries.length <= MAX_READING_POSITIONS) return positions;
  entries.sort(([, a], [, b]) => b.savedAt - a.savedAt);
  return Object.fromEntries(entries.slice(0, MAX_READING_POSITIONS));
}

/** Remembers the page reached in a chapter. Never throws. */
export async function saveReadingPosition(key: string, page: number, now = Date.now()): Promise<void> {
  try {
    const positions = await readingPositionsItem.getValue();
    await readingPositionsItem.setValue(evictOldest({ ...positions, [key]: { page, savedAt: now } }));
  } catch {
    // Session storage not open to content scripts yet: the position is simply not remembered.
  }
}

async function migrateSettings(): Promise<void> {
  const legacy = await storage.getItem<unknown>(LEGACY_KEYS.settings);
  if (legacy === null) return;
  if ((await settingsItem.getValue()) === null) await settingsItem.setValue(normalizeSettings(legacy));
  await storage.removeItem(LEGACY_KEYS.settings);
}

async function migrateSites(): Promise<void> {
  const legacy = await storage.getItem<unknown>(LEGACY_KEYS.sites);
  if (legacy === null) return;
  const current = await enabledSitesItem.getValue();
  await enabledSitesItem.setValue(normalizeSiteList([...current, ...normalizeSiteList(legacy)]));
  await storage.removeItem(LEGACY_KEYS.sites);
}

async function migratePending(): Promise<void> {
  const legacy = await storage.getItem<unknown>(LEGACY_KEYS.pending);
  if (legacy === null) return;
  const pending = parsePending(legacy);
  if (pending !== null && (await pendingActivationItem.getValue()) === null) {
    await pendingActivationItem.setValue(pending);
  }
  await storage.removeItem(LEGACY_KEYS.pending);
}

/**
 * Moves the 1.x keys (`yomuSettings`, `yomuSites`, `yomuPending`) to their new names, then deletes them.
 * Idempotent: values already present under the new names win. Run by the service worker.
 */
export async function migrateLegacyStorage(): Promise<void> {
  await migrateSettings();
  await migrateSites();
  await migratePending();
}

/** Lets content scripts use `storage.session` (reading positions). Called by the service worker. */
export async function allowSessionStorageInContentScripts(): Promise<void> {
  // Optional: missing in Firefox before 115 and in test doubles.
  const area: Partial<Pick<Browser.storage.StorageArea, 'setAccessLevel'>> = browser.storage.session;
  await area.setAccessLevel?.({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });
}
