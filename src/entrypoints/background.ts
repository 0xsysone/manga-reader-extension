/**
 * Service worker: keeps enabled sites consistent with granted permissions, finishes activations started in
 * the popup, and is the single writer of the enabled-sites list.
 */
import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { siteMessageListener } from '@/services/site-messages';
import { completePending, reconcileSites } from '@/services/sites';
import { allowSessionStorageInContentScripts, migrateLegacyStorage } from '@/services/storage';

const LOG_PREFIX = '[manga-reader]';

function run(label: string, task: () => Promise<void>): void {
  task().catch((error: unknown) => {
    console.warn(LOG_PREFIX, label, error);
  });
}

async function migrateAndReconcile(): Promise<void> {
  await migrateLegacyStorage();
  await reconcileSites();
}

export default defineBackground(() => {
  run('session storage access', allowSessionStorageInContentScripts);

  browser.runtime.onInstalled.addListener(() => {
    run('install', migrateAndReconcile);
  });
  browser.runtime.onStartup.addListener(() => {
    run('startup', migrateAndReconcile);
  });
  // Permission revoked from chrome://extensions: the matching site is disabled.
  browser.permissions.onRemoved.addListener(() => {
    run('permission removed', reconcileSites);
  });
  // Permission granted from the popup, which may have closed meanwhile: the activation is finished here.
  browser.permissions.onAdded.addListener((permissions) => {
    run('permission added', () => completePending(permissions.origins ?? []));
  });
  browser.runtime.onMessage.addListener(siteMessageListener);
});
