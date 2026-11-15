/** The real {@link SessionEnvironment}: this page, its storage, the reader and the site adapters. */
import { i18n } from '#i18n';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { openReader } from '@/reader';
import {
  loadReadingPosition,
  loadSettings,
  saveReadingPosition,
  saveSettings,
  watchSettings,
} from '@/services/storage';
import {
  leaveNavigationIntent,
  takeLegacyTabState,
  takeNavigationIntent,
  type TabStorage,
} from '@/services/tab-state';
import { detectChapter } from '@/sites/registry';
import type { DetectContext } from '@/shared/types';
import type { SessionEnvironment, SessionTimers } from './environment';
import { createLauncher } from './launcher';

/** Prefix of every log line of the extension. */
export const LOG_PREFIX = '[manga-reader]';

/** JSON from a public API, without the user's cookies. */
export async function fetchPublicJson(url: string): Promise<unknown> {
  const response = await fetch(url, { credentials: 'omit' });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

function tabStorage(): TabStorage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function detectContext(): DetectContext {
  return {
    document,
    url: new URL(location.href),
    viewportWidth: window.innerWidth,
    fetchJson: fetchPublicJson,
  };
}

function contextTimers(ctx: ContentScriptContext): SessionTimers {
  return {
    setTimeout: (handler, delayMs) => ctx.setTimeout(handler, delayMs),
    clearTimeout: (id) => {
      clearTimeout(id);
    },
    setInterval: (handler, delayMs) => ctx.setInterval(handler, delayMs),
    clearInterval: (id) => {
      clearInterval(id);
    },
  };
}

/** Wires the session to this page; everything it creates is released with `ctx`. */
export function createPageEnvironment(ctx: ContentScriptContext): SessionEnvironment {
  const store = tabStorage();
  return {
    detect: () => detectChapter(detectContext()),
    openReader: (options) => openReader(ctx, options),
    launcher: createLauncher(ctx, {
      label: i18n.t('launcherLabel'),
      title: i18n.t('launcherTitle'),
      pageCount: (count) => i18n.t('pagesCount', [count]),
    }),
    settings: { load: loadSettings, save: saveSettings, watch: watchSettings },
    positions: { load: loadReadingPosition, save: saveReadingPosition },
    navigation: {
      takeIntent: () => (store ? takeNavigationIntent(store) : { autostart: false, openAtEndPath: null }),
      takeLegacyPosition: () => (store ? takeLegacyTabState(store, location.pathname).position : null),
      leaveIntent: (intent) => {
        if (store) leaveNavigationIntent(store, intent);
      },
      go: (url) => {
        location.href = url;
      },
    },
    location: () => new URL(location.href),
    timers: contextTimers(ctx),
    text: (key) => i18n.t(key),
    log: (message, error) => {
      console.warn(LOG_PREFIX, message, error);
    },
  };
}
