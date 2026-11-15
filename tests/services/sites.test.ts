/* eslint-disable @typescript-eslint/no-misused-promises -- the Chrome typings also declare callback overloads */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  completePending,
  disableSite,
  enableSite,
  getEnabledSites,
  isSiteEnabled,
  READER_SCRIPT_FILE,
  reconcileSites,
  requestSitePermission,
  scriptId,
} from '@/services/sites';
import { enabledSitesItem, pendingActivationItem } from '@/services/storage';
import { installFakeExtensionApis, type FakeExtensionApis } from './fake-extension-apis';

const HOST = 'manga.test';
const PATTERNS = ['*://manga.test/*', '*://www.manga.test/*'];

let apis: FakeExtensionApis;

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  apis = installFakeExtensionApis();
});

function grant(...origins: string[]): void {
  for (const origin of origins) apis.granted.add(origin);
}

describe('enableSite', () => {
  it('registers the reader for the exact host and its www variant, saves the site and injects once', async () => {
    grant(...PATTERNS);

    expect(await enableSite('www.Manga.test', 3)).toBe(true);
    expect(await enableSite(HOST, 3)).toBe(true);

    expect(apis.scripts.get('mr-site-manga_test')).toMatchObject({
      matches: PATTERNS,
      js: [READER_SCRIPT_FILE],
      persistAcrossSessions: true,
    });
    expect(await getEnabledSites()).toEqual([HOST]);
    expect(apis.injectedTabs).toEqual([3]);
    expect(await isSiteEnabled(HOST)).toBe(true);
  });

  it('does not lose a site when two enables run at the same time', async () => {
    grant(...PATTERNS, '*://other.test/*', '*://www.other.test/*');

    await Promise.all([enableSite(HOST), enableSite('other.test')]);

    expect(await getEnabledSites()).toEqual(['manga.test', 'other.test']);
  });

  it('accepts a registration made concurrently elsewhere (duplicate id)', async () => {
    grant(...PATTERNS);
    const original = apis.scripts;
    vi.mocked(fakeBrowser.scripting.getRegisteredContentScripts).mockImplementationOnce(() =>
      Promise.resolve([]),
    );
    original.set(scriptId(HOST), { id: scriptId(HOST), matches: PATTERNS, js: [READER_SCRIPT_FILE] });

    await expect(enableSite(HOST)).resolves.toBe(true);
  });

  it('rethrows a registration failure that is not a duplicate', async () => {
    grant(...PATTERNS);
    vi.mocked(fakeBrowser.scripting.registerContentScripts).mockRejectedValueOnce(new Error('boom'));

    await expect(enableSite(HOST)).rejects.toThrow('boom');
    expect(await getEnabledSites()).toEqual([]);
  });

  it('rejects an invalid host', async () => {
    expect(await enableSite('localhost')).toBe(false);
  });
});

describe('disableSite', () => {
  it('unregisters, forgets the site and gives the permissions back (1.x wildcard included)', async () => {
    grant(...PATTERNS, '*://*.manga.test/*');
    await enableSite(HOST);

    await disableSite(HOST);

    expect(apis.scripts.size).toBe(0);
    expect(await getEnabledSites()).toEqual([]);
    expect(apis.granted.size).toBe(0);
    expect(await isSiteEnabled(HOST)).toBe(false);
  });
});

describe('reconcileSites', () => {
  it('drops sites without permission, keeps 1.x wildcard grants and replaces 1.x registrations', async () => {
    await enabledSitesItem.setValue(['kept.test', 'revoked.test']);
    grant('*://*.kept.test/*');
    apis.scripts.set('yomu-site-kept_test', { id: 'yomu-site-kept_test', js: ['src/content.js'] });
    apis.scripts.set('mr-site-revoked_test', { id: 'mr-site-revoked_test', js: [READER_SCRIPT_FILE] });
    apis.scripts.set('someone-else', { id: 'someone-else', js: ['other.js'] });

    await reconcileSites();

    expect(await getEnabledSites()).toEqual(['kept.test']);
    expect([...apis.scripts.keys()].sort()).toEqual(['mr-site-kept_test', 'someone-else']);
  });

  it('updates a registration pointing at an outdated file', async () => {
    await enabledSitesItem.setValue([HOST]);
    grant(...PATTERNS);
    apis.scripts.set(scriptId(HOST), { id: scriptId(HOST), matches: ['*://*.manga.test/*'], js: ['old.js'] });

    await reconcileSites();

    expect(apis.scripts.get(scriptId(HOST))).toMatchObject({ matches: PATTERNS, js: [READER_SCRIPT_FILE] });
  });
});

describe('pending activation', () => {
  it('records the activation and completes it when the permission lands', async () => {
    expect(await requestSitePermission('www.manga.test', 9)).toBe(true);
    await vi.waitFor(async () => {
      expect(await pendingActivationItem.getValue()).toEqual({ host: HOST, tabId: 9 });
    });

    await completePending(['*://unrelated.test/*']);
    expect(await getEnabledSites()).toEqual([]);

    await completePending(PATTERNS);
    expect(await getEnabledSites()).toEqual([HOST]);
    expect(apis.injectedTabs).toEqual([9]);
    expect(await pendingActivationItem.getValue()).toBeNull();
  });
});
