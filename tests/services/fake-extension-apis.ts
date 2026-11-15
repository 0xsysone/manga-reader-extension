/** In-memory `scripting` and `permissions` for tests (fakeBrowser does not implement them). */
/* eslint-disable @typescript-eslint/no-misused-promises -- the Chrome typings also declare callback overloads */
import { vi } from 'vitest';
import type { Browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';

type Script = Browser.scripting.RegisteredContentScript;

/** State of the fake APIs, inspectable by tests. */
export interface FakeExtensionApis {
  scripts: Map<string, Script>;
  granted: Set<string>;
  injectedTabs: number[];
}

/** `*://*.host/*` grants also cover `*://host/*` and `*://www.host/*`, like in Chrome. */
function covers(granted: Set<string>, origin: string): boolean {
  if (granted.has(origin)) return true;
  const host = /^\*:\/\/([^/]+)\/\*$/.exec(origin)?.[1];
  if (host === undefined) return false;
  const parts = host.split('.');
  return parts.some((_, index) => granted.has(`*://*.${parts.slice(index).join('.')}/*`));
}

/** Installs the fakes on `fakeBrowser` and returns their state. Call after `fakeBrowser.reset()`. */
export function installFakeExtensionApis(): FakeExtensionApis {
  const state: FakeExtensionApis = { scripts: new Map(), granted: new Set(), injectedTabs: [] };
  const { scripting, permissions } = fakeBrowser;

  vi.spyOn(scripting, 'getRegisteredContentScripts').mockImplementation((filter?: { ids?: string[] }) => {
    const all = [...state.scripts.values()];
    return Promise.resolve(filter?.ids ? all.filter((script) => filter.ids?.includes(script.id)) : all);
  });
  vi.spyOn(scripting, 'registerContentScripts').mockImplementation((scripts: Script[]) => {
    for (const script of scripts) {
      if (state.scripts.has(script.id))
        return Promise.reject(new Error(`Duplicate script ID '${script.id}'`));
      state.scripts.set(script.id, script);
    }
    return Promise.resolve();
  });
  vi.spyOn(scripting, 'updateContentScripts').mockImplementation((scripts: Script[]) => {
    for (const script of scripts) state.scripts.set(script.id, script);
    return Promise.resolve();
  });
  vi.spyOn(scripting, 'unregisterContentScripts').mockImplementation((filter?: { ids?: string[] }) => {
    for (const id of filter?.ids ?? []) state.scripts.delete(id);
    return Promise.resolve();
  });
  vi.spyOn(scripting, 'executeScript').mockImplementation((injection: { target: { tabId: number } }) => {
    state.injectedTabs.push(injection.target.tabId);
    return Promise.resolve([]);
  });

  vi.spyOn(permissions, 'contains').mockImplementation((request: Browser.permissions.Permissions) =>
    Promise.resolve((request.origins ?? []).every((origin) => covers(state.granted, origin))),
  );
  vi.spyOn(permissions, 'request').mockImplementation((request: Browser.permissions.Permissions) => {
    for (const origin of request.origins ?? []) state.granted.add(origin);
    return Promise.resolve(true);
  });
  vi.spyOn(permissions, 'remove').mockImplementation((request: Browser.permissions.Permissions) => {
    for (const origin of request.origins ?? []) state.granted.delete(origin);
    return Promise.resolve(true);
  });
  return state;
}

/** Makes `tabs.query` answer `tabs`. */
export function stubTabsQuery(tabs: Browser.tabs.Tab[]): void {
  vi.spyOn(fakeBrowser.tabs, 'query').mockImplementation(() => Promise.resolve(tabs));
}
