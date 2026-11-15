import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULT_SETTINGS } from '@/domain/settings';
import {
  chapterPositionKey,
  enabledSitesItem,
  loadReadingPosition,
  loadSettings,
  MAX_READING_POSITIONS,
  migrateLegacyStorage,
  pendingActivationItem,
  readingPositionsItem,
  saveReadingPosition,
  saveSettings,
  settingsItem,
  watchSettings,
} from '@/services/storage';

describe('migrateLegacyStorage', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('moves yomuSettings to sync:settings, normalized, and deletes the legacy key', async () => {
    await fakeBrowser.storage.sync.set({
      yomuSettings: { mode: 'double', direction: 'sideways', autoOpen: false },
    });

    await migrateLegacyStorage();

    expect(await loadSettings()).toEqual({ ...DEFAULT_SETTINGS, mode: 'double', autoOpen: false });
    expect(await fakeBrowser.storage.sync.get('yomuSettings')).toEqual({});
  });

  it('keeps settings already stored under the new key', async () => {
    await settingsItem.setValue({ ...DEFAULT_SETTINGS, theme: 'light' });
    await fakeBrowser.storage.sync.set({ yomuSettings: { theme: 'dark', mode: 'single' } });

    await migrateLegacyStorage();

    expect((await loadSettings()).theme).toBe('light');
    expect((await loadSettings()).mode).toBe(DEFAULT_SETTINGS.mode);
  });

  it('merges yomuSites into sync:enabledSites, normalized and without duplicates', async () => {
    await enabledSitesItem.setValue(['example.com']);
    await fakeBrowser.storage.sync.set({ yomuSites: ['www.Example.com', 'manga.test', 42, 'localhost'] });

    await migrateLegacyStorage();

    expect(await enabledSitesItem.getValue()).toEqual(['example.com', 'manga.test']);
    expect(await fakeBrowser.storage.sync.get('yomuSites')).toEqual({});
  });

  it('moves yomuPending from session storage', async () => {
    await fakeBrowser.storage.session.set({ yomuPending: { host: 'www.manga.test', tabId: 7 } });

    await migrateLegacyStorage();

    expect(await pendingActivationItem.getValue()).toEqual({ host: 'manga.test', tabId: 7 });
    expect(await fakeBrowser.storage.session.get('yomuPending')).toEqual({});
  });

  it('is idempotent', async () => {
    await fakeBrowser.storage.sync.set({ yomuSettings: { mode: 'single' }, yomuSites: ['a.test'] });

    await migrateLegacyStorage();
    await migrateLegacyStorage();

    expect((await loadSettings()).mode).toBe('single');
    expect(await enabledSitesItem.getValue()).toEqual(['a.test']);
  });
});

describe('settings', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('falls back to the defaults and normalizes stored values', async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
    await settingsItem.setValue({ mode: 'nope' });
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('notifies watchers with normalized settings', async () => {
    const seen: string[] = [];
    const unwatch = watchSettings((settings) => seen.push(settings.direction));

    await saveSettings({ ...DEFAULT_SETTINGS, direction: 'ltr' });
    unwatch();
    await saveSettings({ ...DEFAULT_SETTINGS, direction: 'rtl' });

    expect(seen).toEqual(['ltr']);
  });
});

describe('reading positions', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('keys positions on the URL (without hash) and the chapter label', () => {
    const url = new URL('https://manga.test/read?id=3#page');
    expect(chapterPositionKey(url, '12')).toBe('https://manga.test/read?id=3|12');
    expect(chapterPositionKey(url, '13')).not.toBe(chapterPositionKey(url, '12'));
  });

  it('saves and loads a page', async () => {
    await saveReadingPosition('k', 4);
    expect(await loadReadingPosition('k')).toBe(4);
    expect(await loadReadingPosition('other')).toBeNull();
  });

  it('evicts the least recently saved positions above the limit', async () => {
    const positions = Object.fromEntries(
      Array.from({ length: MAX_READING_POSITIONS }, (_, index) => [
        `k${index}`,
        { page: 1, savedAt: index + 1 },
      ]),
    );
    await readingPositionsItem.setValue(positions);

    await saveReadingPosition('newest', 2, 10_000);

    const stored = await readingPositionsItem.getValue();
    expect(Object.keys(stored)).toHaveLength(MAX_READING_POSITIONS);
    expect(stored.k0).toBeUndefined();
    expect(stored.newest?.page).toBe(2);
  });
});
