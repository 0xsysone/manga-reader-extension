/**
 * Popup: enables the reader on the current site, shows the chapter detected in the tab, and edits the
 * settings (applied live to an open reader through storage).
 */
import { i18n } from '#i18n';
import { browser, type Browser } from 'wxt/browser';
import { normalizeSettings } from '@/domain/settings';
import { siteHost } from '@/domain/site-host';
import { errorMessage, sendToTab, sendToWorker, type MessageReply } from '@/services/messages';
import { isSiteEnabled, requestSitePermission } from '@/services/sites';
import { loadSettings, saveSettings } from '@/services/storage';
import type { ChapterStatus, Settings } from '@/shared/types';

/** Texts set from `data-i18n` attributes (no substitutions). */
export const STATIC_TEXT_KEYS = [
  'popupTagline',
  'read',
  'hintOpenChapter',
  'legendDisplay',
  'modeSingle',
  'modeDouble',
  'modeAuto',
  'readingDirection',
  'dirJapanese',
  'dirWestern',
  'animation',
  'animFlip',
  'animSlide',
  'animNoneShort',
  'legendTheme',
  'themeDark',
  'themeLight',
  'coverAlone',
  'optCoverAloneSub',
  'optAutoOpen',
  'optAutoOpenSub',
  'footPages',
  'footMode',
  'footTheme',
  'footHelp',
] as const;

type StaticTextKey = (typeof STATIC_TEXT_KEYS)[number];

const PILL_CLASS = 'pill';
const SITE_ON_CLASS = 'is-on';
const ACCENT_CLASS = 'is-accent';
const WEB_PROTOCOLS = ['http:', 'https:'];

/** Elements of the popup. */
export interface PopupView {
  site: HTMLElement;
  siteHost: HTMLElement;
  siteSub: HTMLElement;
  siteButton: HTMLButtonElement;
  now: HTMLElement;
  nowTitle: HTMLElement;
  nowSub: HTMLElement;
  openButton: HTMLButtonElement;
  hint: HTMLElement;
  form: HTMLFormElement;
}

function byId<T extends HTMLElement>(root: Document, id: string, type: new () => T): T {
  const element = root.getElementById(id);
  if (!(element instanceof type)) throw new Error(`Popup element #${id} is missing`);
  return element;
}

/** Finds the popup elements; throws when the markup is incomplete. */
export function queryView(root: Document): PopupView {
  return {
    site: byId(root, 'site', HTMLElement),
    siteHost: byId(root, 'site-host', HTMLElement),
    siteSub: byId(root, 'site-sub', HTMLElement),
    siteButton: byId(root, 'site-btn', HTMLButtonElement),
    now: byId(root, 'now', HTMLElement),
    nowTitle: byId(root, 'now-title', HTMLElement),
    nowSub: byId(root, 'now-sub', HTMLElement),
    openButton: byId(root, 'open', HTMLButtonElement),
    hint: byId(root, 'hint', HTMLElement),
    form: byId(root, 'form', HTMLFormElement),
  };
}

function isStaticTextKey(key: string | undefined): key is StaticTextKey {
  return STATIC_TEXT_KEYS.some((candidate) => candidate === key);
}

/** Fills every `[data-i18n]` element with its translation. */
export function translatePage(root: ParentNode): void {
  for (const node of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = node.dataset.i18n;
    if (isStaticTextKey(key)) node.textContent = i18n.t(key);
  }
}

function movePill(segment: HTMLElement, instant: boolean): void {
  let pill = segment.querySelector<HTMLElement>(`.${PILL_CLASS}`);
  if (!pill) {
    pill = document.createElement('span');
    pill.className = PILL_CLASS;
    pill.setAttribute('aria-hidden', 'true');
    segment.prepend(pill);
  }
  const label = segment.querySelector('input:checked')?.closest('label');
  if (!label) return;
  if (instant) pill.style.transition = 'none';
  pill.style.width = `${label.offsetWidth}px`;
  pill.style.transform = `translateX(${label.offsetLeft}px)`;
  if (instant) {
    pill.getBoundingClientRect(); // Apply the position before restoring the transition.
    pill.style.transition = '';
  }
}

/** Checks the inputs matching `settings` and slides the segment pills (without animation if `instant`). */
export function renderSettings(form: HTMLFormElement, settings: Settings, instant: boolean): void {
  for (const input of form.querySelectorAll('input')) {
    const value: unknown = settings[input.name as keyof Settings];
    input.checked = typeof value === 'boolean' ? value : input.value === value;
  }
  for (const segment of form.querySelectorAll<HTMLElement>('.seg')) movePill(segment, instant);
}

/** Settings after the change of `input`. */
export function settingsWithInput(settings: Settings, input: HTMLInputElement): Settings {
  const value = input.type === 'checkbox' ? input.checked : input.value;
  return normalizeSettings({ ...settings, [input.name]: value });
}

function showHint(view: PopupView, text: string | null): void {
  view.now.hidden = true;
  view.hint.hidden = false;
  if (text !== null) view.hint.textContent = text;
}

function chapterSubtitle(status: ChapterStatus): string {
  const pages = i18n.t('pagesCount', [status.pageCount]);
  return status.chapter ? `${i18n.t('chapterN', [status.chapter])} · ${pages}` : pages;
}

/**
 * Shows the chapter card, or a hint when the tab has no chapter (`null`: no content script answered).
 * `onOpen` runs when the user clicks "Read".
 */
export function renderChapter(
  view: PopupView,
  reply: MessageReply<ChapterStatus> | null,
  onOpen: () => void,
): void {
  if (reply === null) {
    showHint(view, null);
    return;
  }
  if (!reply.ok) {
    showHint(view, i18n.t('failed', [reply.error]));
    return;
  }
  const status = reply.value;
  if (!status.found) {
    showHint(view, i18n.t('noPagesHere'));
    return;
  }
  view.hint.hidden = true;
  view.now.hidden = false;
  view.nowTitle.textContent = status.title || i18n.t('chapter');
  view.nowSub.textContent = chapterSubtitle(status);
  view.openButton.textContent = i18n.t(status.open ? 'opened' : 'read');
  view.openButton.disabled = status.open;
  view.openButton.onclick = onOpen;
}

/** Paints the site card for an enabled (`true`) or disabled site. */
export function paintSite(view: PopupView, enabled: boolean): void {
  view.site.classList.toggle(SITE_ON_CLASS, enabled);
  view.siteButton.hidden = false;
  view.siteButton.disabled = false;
  view.siteButton.classList.toggle(ACCENT_CLASS, !enabled);
  view.siteButton.setAttribute('aria-pressed', String(enabled));
  view.siteButton.textContent = i18n.t(enabled ? 'disable' : 'enable');
  view.siteSub.textContent = i18n.t(enabled ? 'siteOn' : 'siteOff');
}

/** Host of a tab, when it shows a web page. */
export function tabHost(tab: Browser.tabs.Tab): string | null {
  try {
    const url = new URL(tab.url ?? '');
    return WEB_PROTOCOLS.includes(url.protocol) ? siteHost(url.hostname) : null;
  } catch {
    return null; // Internal browser page.
  }
}

async function refreshChapter(view: PopupView, tabId: number): Promise<void> {
  const reply = await sendToTab(tabId, { type: 'mr:status' });
  renderChapter(view, reply, () => {
    void sendToTab(tabId, { type: 'mr:open' }).then(() => {
      window.close();
    });
  });
}

/** Wires the enable/disable button of the site card. */
function setupSite(view: PopupView, host: string, tabId: number, initiallyEnabled: boolean): void {
  let enabled = initiallyEnabled;
  const enable = async (): Promise<void> => {
    // Straight from the click: Chrome only shows the permission prompt during a user gesture.
    const granted = await requestSitePermission(host, tabId).catch(() => false);
    if (!granted) return;
    view.siteButton.disabled = true;
    view.siteSub.textContent = i18n.t('enabling');
    try {
      // Resolves once the worker registered the script and started it in this tab.
      await sendToWorker({ type: 'mr:enableSite', host, tabId });
    } catch (error) {
      view.siteSub.textContent = i18n.t('failed', [errorMessage(error)]);
    }
    enabled = await isSiteEnabled(host);
    paintSite(view, enabled);
    if (enabled) await refreshChapter(view, tabId);
  };
  const disable = async (): Promise<void> => {
    view.siteButton.disabled = true;
    await sendToWorker({ type: 'mr:disableSite', host });
    enabled = false;
    paintSite(view, false);
    showHint(view, i18n.t('hintDisabled'));
  };
  view.siteButton.addEventListener('click', () => {
    const task = enabled ? disable() : enable();
    task.catch((error: unknown) => {
      view.siteButton.disabled = false;
      view.siteSub.textContent = i18n.t('failed', [errorMessage(error)]);
    });
  });
}

async function initSite(view: PopupView, tab: Browser.tabs.Tab): Promise<void> {
  const host = tabHost(tab);
  if (host === null || tab.id === undefined) return;
  view.site.hidden = false;
  view.siteHost.textContent = host;
  const enabled = await isSiteEnabled(host);
  paintSite(view, enabled);
  setupSite(view, host, tab.id, enabled);
  if (enabled) await refreshChapter(view, tab.id);
  else view.hint.textContent = i18n.t('hintEnable');
}

async function initSettings(form: HTMLFormElement): Promise<void> {
  let settings = await loadSettings();
  renderSettings(form, settings, true); // No pill animation on first paint.
  form.addEventListener('change', (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    settings = settingsWithInput(settings, event.target);
    void saveSettings(settings);
    renderSettings(form, settings, false);
  });
}

/** Builds the popup in `root`. */
export async function initPopup(root: Document): Promise<void> {
  root.documentElement.lang = browser.i18n.getUILanguage();
  translatePage(root);
  const view = queryView(root);
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  await Promise.all([initSettings(view.form), tab ? initSite(view, tab) : Promise.resolve()]);
}
