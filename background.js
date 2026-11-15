/* Manga Reader — service worker : garde les sites activés en cohérence avec les autorisations accordées. */
importScripts('src/core.js', 'src/sites.js');

const sync = () => self.YomuSites.reconcile().catch((e) => console.warn('[Yomu] reconcile', e));

chrome.runtime.onInstalled.addListener(sync);
chrome.runtime.onStartup.addListener(sync);
// Autorisation retirée depuis chrome://extensions : on désactive le site correspondant.
chrome.permissions.onRemoved.addListener(sync);
// Autorisation accordée depuis le popup (qui a pu se fermer entre-temps) : on termine l'activation.
chrome.permissions.onAdded.addListener((perms) => {
  self.YomuSites.completePending(perms.origins).catch((e) => console.warn('[Yomu] activation', e));
});
