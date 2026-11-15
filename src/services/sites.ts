/**
 * Sites enabled by the user. An enabled site = its host permission is granted + the reader content script
 * is registered for it. The enabled list is only written by the service worker, one operation at a time
 * (see {@link serialize}); the popup asks for changes through `site-messages.ts`.
 */
import { browser, type Browser } from 'wxt/browser';
import { siteHost, sitePatterns } from '@/domain/site-host';
import { enabledSitesItem, normalizeSiteList, pendingActivationItem } from './storage';

/**
 * Output path of the runtime-registered content script (`src/entrypoints/reader.content/`), in the form
 * WXT itself uses for content scripts (no leading slash), so its dev reloader recognises our registrations.
 */
export const READER_SCRIPT_FILE = 'content-scripts/reader.js';

/** Same file, as a public path for `scripting.executeScript`. */
const READER_SCRIPT_PUBLIC_PATH = `/${READER_SCRIPT_FILE}` as const;

/** Prefix of the ids of our registered content scripts. */
export const SCRIPT_ID_PREFIX = 'mr-site-';

/** Prefix used by version 1.x, whose registrations are replaced by {@link reconcileSites}. */
export const LEGACY_SCRIPT_ID_PREFIX = 'yomu-site-';

const RUN_AT: Browser.extensionTypes.RunAt = 'document_idle';

/** Content script id for a host (`mr-site-example_com`). */
export function scriptId(host: string): string {
  return SCRIPT_ID_PREFIX + host.replace(/[^a-z0-9]/g, '_');
}

/** 1.x permission pattern (`*://*.host/*`), still honoured and removed on disable. */
export function legacyPattern(host: string): string {
  return `*://*.${host}/*`;
}

let queue: Promise<unknown> = Promise.resolve();

/** Runs `task` after every previously serialized task, so read-modify-write cycles never interleave. */
export function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

function patternsOf(host: string): string[] {
  return sitePatterns(host) ?? [];
}

/** Enabled hosts, normalized. */
export async function getEnabledSites(): Promise<string[]> {
  return normalizeSiteList(await enabledSitesItem.getValue());
}

async function setEnabledSites(hosts: string[]): Promise<void> {
  await enabledSitesItem.setValue(normalizeSiteList(hosts));
}

/** `true` when the host permission covers the site (a 1.x `*://*.host/*` grant counts too). */
export async function hasSitePermission(host: string): Promise<boolean> {
  const origins = patternsOf(host);
  return origins.length > 0 && browser.permissions.contains({ origins });
}

async function findRegistration(id: string): Promise<Browser.scripting.RegisteredContentScript | undefined> {
  const [existing] = await browser.scripting.getRegisteredContentScripts({ ids: [id] });
  return existing;
}

function isCurrent(script: Browser.scripting.RegisteredContentScript, matches: string[]): boolean {
  const sameMatches = JSON.stringify(script.matches ?? []) === JSON.stringify(matches);
  const sameFiles = JSON.stringify(script.js ?? []) === JSON.stringify([READER_SCRIPT_FILE]);
  return sameMatches && sameFiles;
}

async function registerSite(host: string): Promise<void> {
  const id = scriptId(host);
  const matches = patternsOf(host);
  const script = { id, matches, js: [READER_SCRIPT_FILE], runAt: RUN_AT, persistAcrossSessions: true };
  const existing = await findRegistration(id);
  if (existing) {
    if (!isCurrent(existing, matches)) await browser.scripting.updateContentScripts([script]);
    return;
  }
  try {
    await browser.scripting.registerContentScripts([script]);
  } catch (error) {
    // Registered meanwhile by another context (duplicate id): fine. Anything else is a real failure.
    if (!(await findRegistration(id))) throw error;
  }
}

async function unregisterSite(host: string): Promise<void> {
  const id = scriptId(host);
  if (await findRegistration(id)) await browser.scripting.unregisterContentScripts({ ids: [id] });
}

async function injectReader(tabId: number): Promise<void> {
  try {
    await browser.scripting.executeScript({ target: { tabId }, files: [READER_SCRIPT_PUBLIC_PATH] });
  } catch {
    // Tab closed, navigated elsewhere or showing a page we can't script: the registration covers next load.
  }
}

async function removePermission(origins: string[]): Promise<void> {
  try {
    await browser.permissions.remove({ origins });
  } catch {
    // Not granted in this exact form: nothing to remove.
  }
}

/**
 * Enables a site whose permission is already granted, and starts the reader in `tabId` right away.
 * The reader is injected only when the site was not enabled yet (the popup and `completePending` may
 * both enable the same site). Returns `false` for an invalid host.
 */
export function enableSite(host: string, tabId?: number): Promise<boolean> {
  return serialize(async () => {
    const normalized = siteHost(host);
    if (normalized === null) return false;
    const sites = await getEnabledSites();
    await registerSite(normalized);
    if (sites.includes(normalized)) return true;
    await setEnabledSites([...sites, normalized]);
    if (tabId !== undefined) await injectReader(tabId);
    return true;
  });
}

/** Disables a site: unregisters the script, forgets the site and gives its permission back. */
export function disableSite(host: string): Promise<void> {
  return serialize(async () => {
    const normalized = siteHost(host);
    if (normalized === null) return;
    await unregisterSite(normalized);
    await setEnabledSites((await getEnabledSites()).filter((site) => site !== normalized));
    await removePermission(patternsOf(normalized));
    await removePermission([legacyPattern(normalized)]);
  });
}

/** `true` when the site is in the list and its permission is still granted. */
export async function isSiteEnabled(host: string): Promise<boolean> {
  const normalized = siteHost(host);
  if (normalized === null) return false;
  return (await getEnabledSites()).includes(normalized) && hasSitePermission(normalized);
}

/**
 * Asks for the site's permission. Must be called synchronously from a click (Chrome requires a user
 * gesture). The popup may close while Chrome asks, so the activation is recorded for the service worker.
 */
export function requestSitePermission(host: string, tabId: number | undefined): Promise<boolean> {
  const normalized = siteHost(host);
  if (normalized === null) return Promise.resolve(false);
  const request = browser.permissions.request({ origins: patternsOf(normalized) });
  void pendingActivationItem.setValue(
    tabId === undefined ? { host: normalized } : { host: normalized, tabId },
  );
  return request;
}

/** Forgets the recorded activation of `host` (finished by the popup itself). */
export async function clearPending(host: string): Promise<void> {
  const pending = await pendingActivationItem.getValue();
  if (pending !== null && pending.host === siteHost(host)) await pendingActivationItem.removeValue();
}

/** Finishes the recorded activation when the permission just granted covers it (service worker). */
export async function completePending(origins: readonly string[]): Promise<void> {
  const pending = await pendingActivationItem.getValue();
  if (pending === null || !patternsOf(pending.host).some((pattern) => origins.includes(pattern))) return;
  await pendingActivationItem.removeValue();
  await enableSite(pending.host, pending.tabId);
}

async function staleScriptIds(keptHosts: string[]): Promise<string[]> {
  const keptIds = new Set(keptHosts.map(scriptId));
  const registered = await browser.scripting.getRegisteredContentScripts();
  return registered
    .map((script) => script.id)
    .filter((id) => id.startsWith(SCRIPT_ID_PREFIX) || id.startsWith(LEGACY_SCRIPT_ID_PREFIX))
    .filter((id) => !keptIds.has(id));
}

/**
 * Brings the list, the permissions and the registered scripts back in line: sites without permission are
 * dropped, kept sites are (re)registered under the current id and file, 1.x registrations are removed.
 */
export function reconcileSites(): Promise<void> {
  return serialize(async () => {
    const sites = await getEnabledSites();
    const kept: string[] = [];
    for (const host of sites) {
      if (await hasSitePermission(host)) {
        await registerSite(host);
        kept.push(host);
      } else {
        await unregisterSite(host);
      }
    }
    const stale = await staleScriptIds(kept);
    if (stale.length > 0) await browser.scripting.unregisterContentScripts({ ids: stale });
    if (kept.length !== sites.length) await setEnabledSites(kept);
  });
}
