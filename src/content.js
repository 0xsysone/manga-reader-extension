/* Manga Reader — détection d'un chapitre sur un site activé, extraction des scans, lancement du lecteur. */
(function () {
  'use strict';
  // Le script peut être injecté deux fois (déclaration dynamique + injection immédiate à l'activation).
  if (self.__yomuContent) return;
  self.__yomuContent = true;

  const C = self.MRCore;
  const T = self.MRI18n ? self.MRI18n.t : (k) => k;
  const KEY = 'yomuSettings';
  const SS_AUTOSTART = 'yomu:autostart';
  const SS_START_END = 'yomu:startAtEnd';
  const posKey = () => `yomu:pos:${location.pathname}`;

  const hasChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync;

  function readSettings() {
    if (!hasChrome) return Promise.resolve(C.normalizeSettings(null));
    return new Promise((resolve) => {
      chrome.storage.sync.get(KEY, (data) => resolve(C.normalizeSettings(data && data[KEY])));
    });
  }

  function writeSettings(settings) {
    if (hasChrome) chrome.storage.sync.set({ [KEY]: settings });
  }

  const ss = {
    get(k) { try { return sessionStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (_) { /* navigation privée */ } },
    del(k) { try { sessionStorage.removeItem(k); } catch (_) { /* idem */ } },
  };

  const attrsOf = (img) => {
    const out = {};
    for (const a of img.attributes) out[a.name] = a.value;
    return out;
  };
  const attrRatio = (img) => {
    const w = parseInt(img.getAttribute('width'), 10);
    const h = parseInt(img.getAttribute('height'), 10);
    return w > 0 && h > 0 ? w / h : 0;
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /**
   * 0) Scan-Manga : le lecteur du site décode lui-même les pages (URL blob révoquées aussitôt).
   * Le lecteur ne récupère pas les images : il affiche celles que le site a déjà décodées et fait avancer
   * le lecteur du site en arrière-plan pour qu'il continue à précharger la suite.
   */
  function fromScanManga() {
    const container = document.querySelector('#container.img_lel');
    if (!container) return null;
    const boxes = [...container.querySelectorAll('.image-container[data-page]')]
      .sort((a, b) => Number(a.dataset.page) - Number(b.dataset.page));
    if (!boxes.length) return null;
    const imgOf = (box) => {
      const img = box.querySelector('img');
      return img && img.complete && img.naturalWidth ? img : null;
    };
    const pages = boxes.map((box) => {
      const w = Number(box.dataset.width);
      const h = Number(box.dataset.height);
      return { src: null, el: imgOf(box), ratio: w > 0 && h > 0 ? w / h : 0 };
    });

    const select = document.querySelector('#select_chapter');
    const numOf = (id) => {
      const opt = select && [...select.options].find((o) => o.value === String(id));
      return opt ? opt.textContent.trim() : null;
    };
    const currentId = (location.pathname.match(/_(\d+)\.html$/) || [])[1];
    const current = numOf(currentId);
    const neighbour = (kind) => {
      const arrow = document.querySelector(`.navigation .arrow.${kind === 'prev' ? 'left' : 'right'}[data-chapter]`);
      if (!arrow || arrow.style.visibility === 'hidden') return null;
      const id = arrow.dataset.chapter;
      const num = numOf(id);
      return C.isAdjacentChapter(current, num, kind) ? C.scanMangaUrl(location.href, id, num) : null;
    };
    const og = document.querySelector('meta[property="og:title"]');
    const title = (og && og.content ? og.content : document.title).split('»')[0].trim();
    return {
      pages,
      confident: true,
      live: { boxes, imgOf },
      meta: { title, chapter: current || '', prevUrl: neighbour('prev'), nextUrl: neighbour('next'), mangaUrl: null },
    };
  }

  /** Clic « humain » simulé sur une commande du lecteur du site (souris : down → up → click). */
  function pressSiteControl(el) {
    const r = el.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0, isPrimary: true, pointerType: 'mouse' };
    el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, buttons: 1 }));
    el.dispatchEvent(new MouseEvent('mousedown', { ...opts, buttons: 1 }));
    el.dispatchEvent(new PointerEvent('pointerup', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
  }

  /** Branche un chapitre « vivant » : pages remises au lecteur à mesure, lecteur du site synchronisé. */
  function attachLive(ch) {
    const { boxes, imgOf } = ch.live;
    let pending = false;
    const collect = () => {
      pending = false;
      let any = false;
      boxes.forEach((box, i) => {
        const img = imgOf(box);
        if (!img) return;
        any = true;
        ch.pages[i].el = img;
        if (reader) reader.setPageElement(i, img);
      });
      if (any && reader && waitingNotice) {
        waitingNotice = false;
        reader.hideToast();
      }
    };
    const schedule = () => {
      if (!pending) { pending = true; setTimeout(collect, 60); }
    };
    const container = boxes[0].parentElement;
    new MutationObserver(schedule).observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'data-loaded'] });
    container.addEventListener('load', schedule, true);

    // Position du lecteur du site (page visible) et commande de navigation, avec détection du sens.
    const sitePage = () => {
      const i = boxes.findIndex((b) => !b.classList.contains('hidden'));
      return i === -1 ? 0 : i;
    };
    const control = { next: 'right', prev: 'left' };
    let target = 0;
    let syncing = false;
    ch.live.sync = async (page) => {
      target = Math.max(0, Math.min(boxes.length - 1, page));
      if (syncing) return;
      syncing = true;
      try {
        for (let guard = 0; guard < boxes.length * 2; guard++) {
          const cur = sitePage();
          if (cur === target) break;
          const kind = cur < target ? 'next' : 'prev';
          const btn = document.querySelector(`.reader_click_nav .${control[kind]}-cursor`);
          if (!btn) break;
          pressSiteControl(btn);
          await sleep(80);
          let now = sitePage();
          if (now === cur) { await sleep(260); now = sitePage(); }
          if (now === cur) {
            // Le site n'avance pas : pas encore d'activité utilisateur, ou bandeau cookies en attente de réponse.
            if (reader && !consentNotice && consentBannerVisible()) {
              consentNotice = true;
              reader.notice(
                T('consentTitle'),
                T('consentSub'),
                { label: T('consentAction'), onClick: () => reader && reader.close() },
              );
            }
            break;
          }
          if (consentNotice && reader) {
            consentNotice = false;
            reader.hideToast();
          }
          if (Math.abs(now - target) > Math.abs(cur - target)) {
            // Lecteur du site en sens inverse : on inverse les commandes.
            control.next = control.next === 'right' ? 'left' : 'right';
            control.prev = control.prev === 'right' ? 'left' : 'right';
          }
        }
      } finally {
        syncing = false;
      }
    };
    // Dès que le site réagit (après le premier mouvement de souris), on cale sa position sur le lecteur.
    setInterval(() => {
      if (reader && !syncing && sitePage() !== target) ch.live.sync(target);
    }, 1500);
    collect();
  }

  /** 1) Thème MangaReader : config `ts_reader.run({...})` (images + chapitres voisins). */
  function fromTsReader() {
    for (const s of document.querySelectorAll('script:not([src])')) {
      if (!s.textContent.includes('ts_reader.run(')) continue;
      const config = C.parseTsReader(s.textContent);
      if (config && C.imagesFromTsReader(config).length) return config;
    }
    return null;
  }

  /** 2) Conteneurs de lecture connus (Madara, Manganato, …). */
  function fromSelectors() {
    for (const selector of C.READER_SELECTORS) {
      const seen = new Set();
      const pages = [];
      for (const img of document.querySelectorAll(selector)) {
        const src = C.resolveImageSrc(attrsOf(img), location.href);
        if (!src || seen.has(src)) continue;
        seen.add(src);
        pages.push({ src, ratio: attrRatio(img) });
      }
      if (pages.length >= 3) return pages;
    }
    return null;
  }

  /** Conteneur d'une image, en remontant les enveloppes à enfant unique (<div><img></div>). */
  function containerOf(img) {
    let node = img;
    while (node.parentElement && node.parentElement !== document.body && node.parentElement.childElementCount === 1) {
      node = node.parentElement;
    }
    return node.parentElement || node;
  }

  /** 3) Heuristique : le plus grand groupe de grandes images d'un même conteneur. */
  function fromHeuristic() {
    const ids = new Map();
    const ratios = new Map();
    const candidates = [];
    for (const img of document.images) {
      const src = C.resolveImageSrc(attrsOf(img), location.href);
      if (!src) continue;
      const box = containerOf(img);
      if (!ids.has(box)) ids.set(box, ids.size);
      if (!ratios.has(src)) ratios.set(src, attrRatio(img));
      candidates.push({
        src,
        group: ids.get(box),
        w: img.getBoundingClientRect().width,
        natW: img.naturalWidth,
        natH: img.naturalHeight,
        attrW: parseInt(img.getAttribute('width'), 10) || 0,
      });
    }
    const srcs = C.pickImageGroup(candidates, innerWidth);
    return srcs.length ? srcs.map((src) => ({ src, ratio: ratios.get(src) || 0 })) : null;
  }

  function sameSite(u) {
    try {
      const url = new URL(u, location.href);
      return url.origin === location.origin ? url.href : null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Récupère les pages (avec ratios quand le HTML les déclare) et les métadonnées.
   * `confident` : détection par une structure connue (ouverture automatique autorisée).
   */
  /** my Manga Reader (Scan-VF et clones) : toutes les pages sont listées dans `var pages = [...]`. */
  function fromMyMangaReader() {
    for (const script of document.querySelectorAll('script:not([src])')) {
      if (!script.textContent.includes('var pages')) continue;
      const mmr = C.parseMyMangaReader(script.textContent);
      if (!mmr) continue;
      const shown = document.querySelector('img.scan-page, #ppp img, #all img');
      const urls = C.myMangaReaderUrls(mmr.pages, shown && C.resolveImageSrc(attrsOf(shown), location.href));
      if (!urls.length) continue;
      const strip = (u) => (u ? sameSite(C.stripPageSuffix(u)) : null);
      return {
        pages: urls.map((src) => ({ src, ratio: 0 })),
        startPage: mmr.current - 1,
        prevUrl: strip(mmr.prev),
        nextUrl: strip(mmr.next),
      };
    }
    return null;
  }

  /** Anime-Sama : lecteur d'une seule page, chapitres changés par ses boutons sans changer d'URL. */
  function fromAnimeSama() {
    const box = document.getElementById('scansPlacement');
    const select = document.getElementById('selectChapitres');
    if (!box || !select || !select.options.length) return null;
    const seen = new Set();
    const pages = [];
    for (const img of box.querySelectorAll('img')) {
      const src = C.resolveImageSrc(attrsOf(img), location.href);
      if (src && !seen.has(src)) { seen.add(src); pages.push({ src, ratio: attrRatio(img) }); }
    }
    if (!pages.length) return null;
    const i = select.selectedIndex;
    const n = select.options.length;
    const label = (k) => {
      const t = select.options[k].textContent.trim();
      return (t.match(/(\d+(?:[.,]\d+)?)/) || [])[1] || t;
    };
    const title = document.getElementById('titreOeuvre');
    return {
      pages,
      title: title ? title.textContent.trim() : null,
      chapter: label(i),
      prevUrl: i > 0 ? '#yomu-prev' : null,
      nextUrl: i < n - 1 ? '#yomu-next' : null,
      prevLabel: i > 0 ? label(i - 1) : null,
      nextLabel: i < n - 1 ? label(i + 1) : null,
      inPage: {
        go: (which) => new Promise((resolve) => {
          const first = () => { const f = box.querySelector('img'); return f && f.getAttribute('src'); };
          const before = first();
          const btn = document.getElementById(which === 'next' ? 'nextChapitre' : 'prevChapitre');
          if (!btn) { resolve(false); return; }
          let timer = null;
          const mo = new MutationObserver(() => {
            if (first() !== before) { clearTimeout(timer); timer = setTimeout(() => { mo.disconnect(); resolve(true); }, 200); }
          });
          mo.observe(box, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
          setTimeout(() => { mo.disconnect(); resolve(first() !== before); }, 8000);
          btn.click();
        }),
      },
    };
  }

  /** MangaDex : pages et chapitres voisins via son API publique (celle qu'utilise le site). */
  async function fromMangaDex() {
    if (!/(^|\.)mangadex\.org$/.test(location.hostname)) return null;
    const id = (location.pathname.match(/\/chapter\/([0-9a-f-]{36})/i) || [])[1];
    if (!id) return null;
    const get = (path) => fetch(`https://api.mangadex.org${path}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const [atHome, ch] = await Promise.all([get(`/at-home/server/${id}`), get(`/chapter/${id}?includes[]=manga`)]);
    const urls = C.mangadexImageUrls(atHome);
    if (!urls.length) return null;
    const data = ch && ch.data;
    const attrs = (data && data.attributes) || {};
    const manga = data && (data.relationships || []).find((r) => r.type === 'manga');
    const titles = (manga && manga.attributes && manga.attributes.title) || {};
    let nb = { prev: null, next: null };
    if (manga) {
      const lang = encodeURIComponent(attrs.translatedLanguage || 'en');
      nb = C.mangadexNeighbours(await get(`/manga/${manga.id}/aggregate?translatedLanguage[]=${lang}`), id);
    }
    const link = (c) => (c ? `${location.origin}/chapter/${c.id}` : null);
    return {
      pages: urls.map((src) => ({ src, ratio: 0 })),
      title: titles.en || titles['ja-ro'] || Object.values(titles)[0] || null,
      chapter: attrs.chapter || '',
      prevUrl: link(nb.prev),
      nextUrl: link(nb.next),
      prevLabel: nb.prev && nb.prev.chapter,
      nextLabel: nb.next && nb.next.chapter,
      mangaUrl: manga ? `${location.origin}/title/${manga.id}` : null,
    };
  }

  /** Stratégies synchrones, de la plus précise à la plus générique. */
  function detectSync() {
    const live = fromScanManga();
    if (live) return live;
    const anime = fromAnimeSama();
    if (anime) return anime;

    const config = fromTsReader();
    if (config) {
      // Dimensions éventuellement encore présentes dans #readerarea (avant réécriture par le thème).
      const dims = new Map();
      for (const img of document.querySelectorAll('#readerarea img')) {
        const src = C.resolveImageSrc(attrsOf(img), location.href);
        if (src && attrRatio(img)) dims.set(src.split('?')[0], attrRatio(img));
      }
      return {
        pages: C.imagesFromTsReader(config).map((src) => ({ src, ratio: dims.get(src.split('?')[0]) || 0 })),
        prevUrl: config.prevUrl ? sameSite(config.prevUrl) : null,
        nextUrl: config.nextUrl ? sameSite(config.nextUrl) : null,
      };
    }
    const mmr = fromMyMangaReader();
    if (mmr) return mmr;

    let pages = fromSelectors();
    let confident = true;
    if (!pages) {
      pages = fromHeuristic();
      confident = false;
    }
    if (!pages) return null;
    const links = [...document.querySelectorAll('a[href]')].slice(0, 3000).map((a) => ({
      href: a.getAttribute('href'),
      text: a.textContent,
      rel: a.getAttribute('rel'),
      className: typeof a.className === 'string' ? a.className : '',
    }));
    const nav = C.pickNavLinks(links, location.href);
    return { pages, confident, prevUrl: nav.prev, nextUrl: nav.next };
  }

  /** Met en forme le résultat d'une stratégie : métadonnées complétées depuis la page si besoin. */
  function finish(found) {
    if (!found || !found.pages || !found.pages.length) return null;
    if (found.meta) return found; // déjà complet (Scan-Manga)
    const h1 = document.querySelector('h1.entry-title, .headpost h1, #chapter-heading, h1');
    const parsed = C.parseChapterTitle(h1 && h1.textContent.trim() ? h1.textContent : document.title);
    const mangaLink = document.querySelector('.allc a[href], .headpost .allc a[href]');
    return {
      pages: found.pages,
      confident: found.confident !== false,
      startPage: found.startPage || 0,
      inPage: found.inPage || null,
      meta: {
        title: found.title || (mangaLink ? mangaLink.textContent.trim() : parsed.title),
        chapter: found.chapter != null && found.chapter !== '' ? String(found.chapter) : parsed.chapter,
        prevUrl: found.prevUrl || null,
        nextUrl: found.nextUrl || null,
        prevLabel: found.prevLabel || null,
        nextLabel: found.nextLabel || null,
        mangaUrl: found.mangaUrl || (mangaLink ? sameSite(mangaLink.href) : null),
      },
    };
  }

  function extractChapter() {
    return finish(detectSync());
  }

  async function extractChapterAsync() {
    return finish(await fromMangaDex()) || extractChapter();
  }

  let reader = null;
  let launcher = null;
  let settings = C.normalizeSettings(null);
  let chapter = null;
  let waitingNotice = false;
  let consentNotice = false;

  /** Bandeau de consentement cookies visible (Quantcast, OneTrust, Didomi, Funding Choices…). */
  function consentBannerVisible() {
    const sel = '.qc-cmp2-container, #qc-cmp2-container, #onetrust-banner-sdk, #didomi-host, .fc-consent-root, #cmpbox, .cmp-container';
    return [...document.querySelectorAll(sel)].some((el) => el.offsetParent !== null || el.getClientRects().length > 0);
  }

  function openReader(opts) {
    if (reader || !chapter) return;
    let start = parseInt(ss.get(posKey()), 10);
    if (!(start >= 0) && chapter.startPage > 0) start = chapter.startPage;
    if (ss.get(SS_START_END) === location.pathname) start = chapter.pages.length - 1;
    ss.del(SS_START_END);
    if (opts && opts.fromStart) start = 0;
    if (!(start >= 0)) start = 0;

    hideLauncher();
    consentNotice = false;
    reader = new self.MRReader({
      pages: chapter.pages,
      meta: chapter.meta,
      settings,
      startPage: start,
      onSettingsChange: (s) => { settings = s; writeSettings(s); },
      onPageChange: (p) => {
        ss.set(posKey(), String(p));
        if (chapter.live && chapter.live.sync) chapter.live.sync(p);
      },
      onChapter: (url, which) => {
        if (chapter.inPage) {
          switchInPage(which);
          return;
        }
        ss.set(SS_AUTOSTART, '1');
        if (which === 'prev') ss.set(SS_START_END, new URL(url).pathname);
        location.href = url;
      },
      onClose: () => { reader = null; showLauncher(); },
    });
    reader.mount();
    if (chapter.live) {
      if (chapter.live.sync) chapter.live.sync(start);
      setTimeout(() => {
        if (reader && !chapter.pages.some((p) => p.el)) {
          waitingNotice = true;
          reader.notice(T('loadingPages'), T('loadingPagesSub'));
        }
      }, 1200);
    }
  }

  /** Changement de chapitre sans rechargement (sites d'une seule page) : le lecteur reste ouvert. */
  async function switchInPage(which) {
    const ok = await chapter.inPage.go(which);
    const fresh = ok ? extractChapter() : null;
    if (!reader) return;
    if (fresh) {
      chapter = fresh;
      if (launcher) { launcher.host.remove(); launcher = null; }
      reader.replaceChapter(fresh.pages, fresh.meta, which === 'prev' ? fresh.pages.length - 1 : 0);
    } else {
      reader.replaceChapter(chapter.pages, chapter.meta, reader.pageIndex);
      reader.notice(T('chapterUnavailable'), T('chapterUnavailableSub'));
    }
  }

  function buildLauncher() {
    const host = document.createElement('div');
    host.id = 'yomu-launcher-host';
    host.style.cssText = 'position:fixed;right:22px;bottom:22px;z-index:2147483646;';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        button {
          all: unset; cursor: pointer; display: flex; align-items: center; gap: 10px;
          padding: 8px 18px 8px 8px; border-radius: 999px;
          font: 600 13.5px/1 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
          color: #f3f1ed; background: rgba(16,16,19,.82);
          backdrop-filter: blur(18px) saturate(1.5); -webkit-backdrop-filter: blur(18px) saturate(1.5);
          border: 1px solid rgba(255,255,255,.09);
          box-shadow: 0 18px 40px -16px rgba(0,0,0,.7);
          transform: translateY(16px) scale(.96); opacity: 0;
          transition: transform .6s cubic-bezier(.34,1.4,.64,1), opacity .4s ease, box-shadow .3s ease;
        }
        button.in { transform: none; opacity: 1; }
        button:hover { box-shadow: 0 22px 50px -14px rgba(229,72,45,.55); }
        button:active { transform: scale(.96); }
        .seal {
          width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center;
          background: #e5482d; color: #fff; font: 600 15px/1 "Hiragino Mincho ProN", "Yu Mincho", serif;
        }
        small { display: block; font-weight: 500; font-size: 11px; opacity: .55; margin-top: 3px; }
      </style>
      <button type="button"><span class="seal">読</span><span></span></button>`;
    const btn = shadow.querySelector('button');
    btn.title = T('launcherTitle');
    const label = btn.lastElementChild;
    label.append(T('launcherLabel'));
    const count = document.createElement('small');
    count.textContent = T('pagesCount', chapter.pages.length);
    label.append(count);
    btn.addEventListener('click', (e) => { e.stopPropagation(); openReader(); });
    host.addEventListener('click', (e) => e.stopPropagation());
    return { host, btn };
  }

  function showLauncher() {
    if (!chapter) return;
    if (!launcher) launcher = buildLauncher();
    if (!launcher.host.isConnected) document.documentElement.append(launcher.host);
    void launcher.btn.offsetWidth;
    launcher.btn.classList.add('in');
  }

  function hideLauncher() {
    if (!launcher) return;
    launcher.btn.classList.remove('in');
    launcher.host.remove();
  }

  async function ensureChapter() {
    if (chapter) return chapter;
    const found = await extractChapterAsync();
    if (chapter) return chapter; // trouvé entre-temps par un autre appel
    chapter = found;
    if (chapter && chapter.live) attachLive(chapter);
    return chapter;
  }

  /** Détection, avec deux nouvelles tentatives pour les pages qui chargent leurs images tardivement. */
  async function detect(attempt) {
    await ensureChapter();
    if (!chapter) {
      if (attempt < 2) setTimeout(() => detect(attempt + 1), attempt === 0 ? 1200 : 3000);
      return;
    }
    const autostart = ss.get(SS_AUTOSTART) === '1';
    ss.del(SS_AUTOSTART);
    // Détection heuristique : on propose le lecteur plutôt que de l'imposer.
    if (autostart || (settings.autoOpen && chapter.confident)) openReader();
    else showLauncher();
  }

  async function init() {
    if (hasChrome) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync' || !changes[KEY]) return;
        settings = C.normalizeSettings(changes[KEY].newValue);
        if (reader) reader.applySettings(settings);
      });
      chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
        if (!msg) return;
        if (msg.type === 'yomu:open') {
          ensureChapter().then(() => {
            if (chapter) openReader();
            reply({ ok: !!chapter });
          });
          return true; // réponse asynchrone
        }
        if (msg.type === 'yomu:status') {
          ensureChapter().then(() => {
            if (chapter && !reader && !launcher) showLauncher();
            reply({ ok: true, chapter: chapter ? chapter.meta : null, pages: chapter ? chapter.pages.length : 0, open: !!reader });
          });
          return true;
        }
        return undefined;
      });
    }
    settings = await readSettings();
    detect(0);

    // Sites d'une seule page (MangaDex…) : l'URL change sans rechargement quand on navigue sur le site.
    let lastPath = location.pathname + location.search;
    setInterval(() => {
      const path = location.pathname + location.search;
      if (path === lastPath || reader) return;
      lastPath = path;
      chapter = null;
      if (launcher) { launcher.host.remove(); launcher = null; }
      detect(0);
    }, 1000);
  }

  init();
})();
