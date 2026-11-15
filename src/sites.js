/*
 * Manga Reader — sites activés par l'utilisateur. Partagé par le popup et le service worker.
 * Un site activé = une autorisation d'hôte accordée + un content script enregistré dynamiquement.
 */
(function (root) {
  'use strict';
  const C = root.MRCore;
  const SITES_KEY = 'yomuSites';
  const FILES = ['src/core.js', 'src/i18n.js', 'src/styles.js', 'src/reader.js', 'src/content.js'];
  const PREFIX = 'yomu-site-';

  const scriptId = (host) => PREFIX + host.replace(/[^a-z0-9]/g, '_');

  async function getSites() {
    const data = await chrome.storage.sync.get(SITES_KEY);
    const list = data && Array.isArray(data[SITES_KEY]) ? data[SITES_KEY] : [];
    return list.map(C.siteHost).filter(Boolean);
  }

  async function setSites(list) {
    await chrome.storage.sync.set({ [SITES_KEY]: [...new Set(list)].sort() });
  }

  const PENDING_KEY = 'yomuPending';

  /**
   * À appeler directement dans un clic (Chrome exige un geste utilisateur). Le popup peut se fermer
   * pendant la demande : on mémorise le site pour que le service worker termine l'activation.
   */
  function requestPermission(host, tabId) {
    const pattern = C.sitePattern(host);
    const request = chrome.permissions.request({ origins: [pattern] });
    chrome.storage.session.set({ [PENDING_KEY]: { host: C.siteHost(host), tabId } });
    return request;
  }

  /** Appelé par le service worker quand une autorisation vient d'être accordée. */
  async function completePending(origins) {
    const data = await chrome.storage.session.get(PENDING_KEY);
    const pending = data && data[PENDING_KEY];
    if (!pending || !(origins || []).includes(C.sitePattern(pending.host))) return;
    await chrome.storage.session.remove(PENDING_KEY);
    await enable(pending.host, pending.tabId);
  }

  function hasPermission(host) {
    return chrome.permissions.contains({ origins: [C.sitePattern(host)] });
  }

  async function register(host) {
    const id = scriptId(host);
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
    if (existing.length) return;
    try {
      await chrome.scripting.registerContentScripts([{
        id,
        matches: [C.sitePattern(host)],
        js: FILES,
        runAt: 'document_idle',
        persistAcrossSessions: true,
      }]);
    } catch (e) {
      // Popup et service worker peuvent activer le même site au même moment.
      if (!/duplicate/i.test(String(e && e.message))) throw e;
    }
  }

  async function unregister(host) {
    const id = scriptId(host);
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
    if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [id] });
  }

  /** Active un site (autorisation déjà accordée) et lance le lecteur tout de suite dans l'onglet courant. */
  async function enable(host, tabId) {
    const h = C.siteHost(host);
    if (!h) return;
    await register(h);
    await setSites([...(await getSites()), h]);
    if (tabId != null) {
      await chrome.scripting.executeScript({ target: { tabId }, files: FILES }).catch(() => { /* onglet fermé ou changé */ });
    }
  }

  async function disable(host) {
    const h = C.siteHost(host);
    if (!h) return;
    await unregister(h);
    await setSites((await getSites()).filter((s) => s !== h));
    await chrome.permissions.remove({ origins: [C.sitePattern(h)] }).catch(() => {});
  }

  async function isEnabled(host) {
    const h = C.siteHost(host);
    if (!h) return false;
    return (await getSites()).includes(h) && (await hasPermission(h));
  }

  /** Remet en cohérence la liste, les autorisations et les scripts enregistrés. */
  async function reconcile() {
    const sites = await getSites();
    const kept = [];
    for (const h of sites) {
      if (await hasPermission(h)) {
        await register(h);
        kept.push(h);
      } else {
        await unregister(h);
      }
    }
    const registered = await chrome.scripting.getRegisteredContentScripts();
    const keptIds = new Set(kept.map(scriptId));
    const stale = registered.filter((s) => s.id.startsWith(PREFIX) && !keptIds.has(s.id)).map((s) => s.id);
    if (stale.length) await chrome.scripting.unregisterContentScripts({ ids: stale });
    if (kept.length !== sites.length) await setSites(kept);
  }

  root.YomuSites = { getSites, requestPermission, completePending, hasPermission, enable, disable, isEnabled, reconcile };
})(typeof self !== 'undefined' ? self : this);
