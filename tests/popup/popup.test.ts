import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import popupHtml from '@/entrypoints/popup/index.html?raw';
import { initPopup, queryView, renderChapter, tabHost } from '@/entrypoints/popup/popup';
import { DEFAULT_SETTINGS } from '@/domain/settings';
import { siteMessageListener } from '@/services/site-messages';
import { enabledSitesItem, loadSettings, settingsItem } from '@/services/storage';
import {
  installFakeExtensionApis,
  stubTabsQuery,
  type FakeExtensionApis,
} from '../services/fake-extension-apis';
import type { Browser } from 'wxt/browser';

vi.mock('#i18n', () => ({
  i18n: {
    t: (key: string, substitutions?: unknown[]) =>
      substitutions ? `${key}(${substitutions.map(String).join(',')})` : key,
  },
}));

const TAB_URL = 'https://www.manga.test/chapter-3';
const STATUS = { found: true, open: false, title: 'Series', chapter: '3', pageCount: 20 };

let apis: FakeExtensionApis;
let sendToTab: ReturnType<typeof vi.fn>;

function mountMarkup(): void {
  const parsed = new DOMParser().parseFromString(popupHtml, 'text/html');
  for (const script of parsed.querySelectorAll('script')) script.remove();
  document.body.replaceChildren(...parsed.body.childNodes);
}

const TAB_ID = 5;

function openTab(): number {
  stubTabsQuery([{ id: TAB_ID, url: TAB_URL } as Browser.tabs.Tab]);
  return TAB_ID;
}

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  apis = installFakeExtensionApis();
  vi.spyOn(fakeBrowser.i18n, 'getUILanguage').mockReturnValue('en');
  sendToTab = vi.fn(() => Promise.resolve({ ok: true, value: STATUS }));
  vi.spyOn(fakeBrowser.tabs, 'sendMessage').mockImplementation(sendToTab as never);
  fakeBrowser.runtime.onMessage.addListener(siteMessageListener);
  mountMarkup();
});

describe('popup', () => {
  it('translates the page and checks the stored settings', async () => {
    await settingsItem.setValue({ ...DEFAULT_SETTINGS, mode: 'double', autoOpen: false });
    await initPopup(document);

    expect(document.querySelector('[data-i18n="legendDisplay"]')?.textContent).toBe('legendDisplay');
    expect(document.querySelector<HTMLInputElement>('input[name="mode"][value="double"]')?.checked).toBe(
      true,
    );
    expect(document.querySelector<HTMLInputElement>('input[name="autoOpen"]')?.checked).toBe(false);
  });

  it('saves a setting changed in the form', async () => {
    await initPopup(document);
    const light = document.querySelector<HTMLInputElement>('input[name="theme"][value="light"]');
    if (!light) throw new Error('missing input');

    light.checked = true;
    light.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(async () => expect((await loadSettings()).theme).toBe('light'));
  });

  it('shows an enabled site and the chapter of the tab', async () => {
    const tabId = openTab();
    await enabledSitesItem.setValue(['manga.test']);
    apis.granted.add('*://manga.test/*').add('*://www.manga.test/*');

    await initPopup(document);
    const view = queryView(document);

    expect(view.site.hidden).toBe(false);
    expect(view.siteHost.textContent).toBe('manga.test');
    expect(view.siteButton.getAttribute('aria-pressed')).toBe('true');
    expect(view.siteSub.textContent).toBe('siteOn');
    expect(sendToTab).toHaveBeenCalledWith(tabId, { type: 'mr:status' });
    expect(view.now.hidden).toBe(false);
    expect(view.nowTitle.textContent).toBe('Series');
    expect(view.nowSub.textContent).toBe('chapterN(3) · pagesCount(20)');
    expect(view.openButton.textContent).toBe('read');
  });

  it('enables the site through the worker, then shows the chapter without waiting a fixed delay', async () => {
    const tabId = openTab();
    await initPopup(document);
    const view = queryView(document);
    expect(view.siteButton.getAttribute('aria-pressed')).toBe('false');
    expect(view.hint.textContent).toBe('hintEnable');

    view.siteButton.click();

    await vi.waitFor(() => expect(view.siteButton.getAttribute('aria-pressed')).toBe('true'));
    expect(await enabledSitesItem.getValue()).toEqual(['manga.test']);
    expect(apis.injectedTabs).toEqual([tabId]);
    await vi.waitFor(() => expect(view.now.hidden).toBe(false));
  });

  it('disables an enabled site', async () => {
    openTab();
    await enabledSitesItem.setValue(['manga.test']);
    apis.granted.add('*://manga.test/*').add('*://www.manga.test/*');
    await initPopup(document);
    const view = queryView(document);

    view.siteButton.click();

    await vi.waitFor(() => expect(view.hint.textContent).toBe('hintDisabled'));
    expect(view.siteButton.getAttribute('aria-pressed')).toBe('false');
    expect(await enabledSitesItem.getValue()).toEqual([]);
  });

  it('explains when the tab has no chapter or the content script failed', () => {
    const view = queryView(document);
    renderChapter(view, { ok: true, value: { ...STATUS, found: false } }, vi.fn());
    expect(view.hint.textContent).toBe('noPagesHere');
    expect(view.now.hidden).toBe(true);

    renderChapter(view, { ok: false, error: 'boom' }, vi.fn());
    expect(view.hint.textContent).toBe('failed(boom)');
  });

  it('only offers web pages', () => {
    expect(tabHost({ url: 'chrome://extensions' } as never)).toBeNull();
    expect(tabHost({ url: 'https://www.Example.com/x' } as never)).toBe('example.com');
  });

  it('marks status texts as live regions', () => {
    const view = queryView(document);
    expect(view.hint.getAttribute('aria-live')).toBe('polite');
    expect(view.siteSub.getAttribute('aria-live')).toBe('polite');
  });
});
