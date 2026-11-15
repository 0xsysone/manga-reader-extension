/*
 * Traductions de l'interface : chrome.i18n suit la langue du navigateur (_locales/<lang>/messages.json),
 * avec repli sur l'anglais (default_locale) géré par Chrome.
 * Hors extension (page de démo, tests), sans chrome.i18n, la clé elle-même est renvoyée.
 */
(function (root) {
  'use strict';

  function t(key, ...subs) {
    try {
      const i18n = root.chrome && root.chrome.i18n;
      const msg = i18n && i18n.getMessage(key, subs.map(String));
      if (msg) return msg;
    } catch (_) { /* contexte d'extension invalidé */ }
    return key;
  }

  function uiLang() {
    try { return root.chrome.i18n.getUILanguage() || 'en'; } catch (_) { return 'en'; }
  }

  root.MRI18n = { t, uiLang };
})(typeof self !== 'undefined' ? self : this);
