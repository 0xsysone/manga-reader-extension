/* Manga Reader — popup de réglages. Les changements sont appliqués en direct dans le lecteur ouvert. */
(function () {
  'use strict';
  const C = self.MRCore;
  const T = self.MRI18n ? self.MRI18n.t : (k) => k;
  document.documentElement.lang = self.MRI18n ? self.MRI18n.uiLang() : 'en';
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = T(node.dataset.i18n);
  const KEY = 'yomuSettings';
  const form = document.getElementById('form');
  let settings = C.normalizeSettings(null);

  function render(instant) {
    for (const [name, value] of Object.entries(settings)) {
      const inputs = form.elements[name];
      if (!inputs) continue;
      if (typeof value === 'boolean') inputs.checked = value;
      else for (const input of form.querySelectorAll(`input[name="${name}"]`)) input.checked = input.value === value;
    }
    for (const seg of form.querySelectorAll('.seg')) movePill(seg, instant);
  }

  function movePill(seg, instant) {
    let pill = seg.querySelector('.pill');
    if (!pill) {
      pill = document.createElement('span');
      pill.className = 'pill';
      seg.prepend(pill);
    }
    const checked = seg.querySelector('input:checked');
    if (!checked) return;
    const label = checked.closest('label');
    if (instant) pill.style.transition = 'none';
    pill.style.width = `${label.offsetWidth}px`;
    pill.style.transform = `translateX(${label.offsetLeft}px)`;
    if (instant) {
      void pill.offsetWidth;
      pill.style.transition = '';
    }
  }

  form.addEventListener('change', (e) => {
    const input = e.target;
    const next = { ...settings, [input.name]: input.type === 'checkbox' ? input.checked : input.value };
    settings = C.normalizeSettings(next);
    chrome.storage.sync.set({ [KEY]: settings });
    render();
  });

  chrome.storage.sync.get(KEY, (data) => {
    settings = C.normalizeSettings(data && data[KEY]);
    render(true); // pas d'animation de la pastille au premier rendu
  });

  /* ------------------------------------------------------------------ onglet courant */
  const $ = (id) => document.getElementById(id);
  const S = self.YomuSites;

  function queryStatus(tabId) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { type: 'yomu:status' }, (res) => resolve(chrome.runtime.lastError ? null : res));
    });
  }

  function showChapter(tab, res) {
    const hint = $('hint');
    const now = $('now');
    if (!res || !res.ok || !res.chapter) {
      now.hidden = true;
      hint.hidden = false;
      if (res && res.ok) hint.textContent = T('noPagesHere');
      return;
    }
    hint.hidden = true;
    now.hidden = false;
    const m = res.chapter;
    $('now-title').textContent = m.title || T('chapter');
    $('now-sub').textContent = `${m.chapter ? T('chapterN', m.chapter) + ' · ' : ''}${T('pagesCount', res.pages)}`;
    const open = $('open');
    open.textContent = T(res.open ? 'opened' : 'read');
    open.disabled = !!res.open;
    open.onclick = () => chrome.tabs.sendMessage(tab.id, { type: 'yomu:open' }, () => window.close());
  }

  async function refreshChapter(tab, tries) {
    for (let i = 0; i < (tries || 1); i++) {
      const res = await queryStatus(tab.id);
      if (res || i === tries - 1) return showChapter(tab, res);
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  async function setupSite(tab) {
    let host = null;
    try {
      const url = new URL(tab.url || '');
      if (url.protocol === 'http:' || url.protocol === 'https:') host = C.siteHost(url.hostname);
    } catch (_) { /* page interne du navigateur */ }
    if (!host) return;

    const card = $('site');
    const sub = $('site-sub');
    const btn = $('site-btn');
    card.hidden = false;
    $('site-host').textContent = host;
    const paint = (state) => {
      card.classList.toggle('is-on', state === 'on');
      btn.hidden = false;
      btn.disabled = false;
      btn.classList.toggle('is-accent', state === 'off');
      btn.textContent = T(state === 'on' ? 'disable' : 'enable');
      sub.textContent = T(state === 'on' ? 'siteOn' : 'siteOff');
    };

    let on = await S.isEnabled(host);
    paint(on ? 'on' : 'off');
    if (on) refreshChapter(tab);
    else $('hint').textContent = T('hintEnable');

    btn.addEventListener('click', async () => {
      if (!on) {
        // Doit partir directement du clic : pas d'await avant la demande d'autorisation.
        const granted = await S.requestPermission(host, tab.id).catch(() => false);
        if (!granted) return;
        btn.disabled = true;
        sub.textContent = T('enabling');
        // Le service worker active le site dès l'autorisation accordée ; si elle l'était déjà, on le fait ici.
        await new Promise((r) => setTimeout(r, 500));
        if (!(await S.isEnabled(host))) await S.enable(host, tab.id).catch((e) => { sub.textContent = T('failed', e.message); });
        on = await S.isEnabled(host);
        paint(on ? 'on' : 'off');
        if (on) refreshChapter(tab, 6);
      } else {
        btn.disabled = true;
        await S.disable(host);
        on = false;
        paint('off');
        $('now').hidden = true;
        $('hint').hidden = false;
        $('hint').textContent = T('hintDisabled');
      }
    });
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (tab && tab.id != null) setupSite(tab);
  });
})();
