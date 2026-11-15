/**
 * Notices for chapters whose pages keep arriving from the site (Scan-Manga): the site waits for a cookie
 * choice, or for user activity, before handing over the next pages.
 */
import type { LivePages, ReaderHandle, ReaderNotice } from '@/shared/types';
import type { SessionEnvironment } from './environment';

/** How often the site's blocking state is checked while the reader is open. */
export const LIVE_CHECK_INTERVAL_MS = 1500;

/** Without any page after this delay, the "loading pages" notice is shown. */
export const LOADING_NOTICE_DELAY_MS = 1200;

type LiveNoticeKind = 'consent' | 'loading' | null;

/** Handle returned by {@link watchLivePages}. */
export interface LiveWatch {
  /** Stops listening to the site and clears the timers. */
  dispose(): void;
}

function noticeFor(
  kind: LiveNoticeKind,
  env: SessionEnvironment,
  closeReader: () => void,
): ReaderNotice | null {
  if (kind === 'consent') {
    return {
      title: env.text('consentTitle'),
      detail: env.text('consentSub'),
      action: { label: env.text('consentAction'), run: closeReader },
    };
  }
  if (kind === 'loading') return { title: env.text('loadingPages'), detail: env.text('loadingPagesSub') };
  return null;
}

/**
 * Keeps the reader's notice in line with the site's state until disposed: consent banner, waiting for
 * activity, or nothing. Subscribes to the live pages only to know whether any arrived.
 */
export function watchLivePages(live: LivePages, reader: ReaderHandle, env: SessionEnvironment): LiveWatch {
  let received = false;
  let loadingDue = false;
  let shown: LiveNoticeKind = null;

  const currentKind = (): LiveNoticeKind => {
    const blocker = live.blocker();
    if (blocker === 'consent') return 'consent';
    if (blocker === 'activation' || (loadingDue && !received)) return 'loading';
    return null;
  };
  const refresh = (): void => {
    const kind = currentKind();
    if (kind === shown) return;
    shown = kind;
    reader.showNotice(noticeFor(kind, env, () => reader.close()));
  };

  const unsubscribe = live.subscribe(() => {
    received = true;
    if (shown === 'loading') refresh();
  });
  const interval = env.timers.setInterval(refresh, LIVE_CHECK_INTERVAL_MS);
  const loadingTimer = env.timers.setTimeout(() => {
    loadingDue = true;
    refresh();
  }, LOADING_NOTICE_DELAY_MS);

  return {
    dispose() {
      unsubscribe();
      env.timers.clearInterval(interval);
      env.timers.clearTimeout(loadingTimer);
    },
  };
}
