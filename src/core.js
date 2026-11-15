/*
 * Manga Reader — logique pure (sans DOM) : extraction des pages, appariement en
 * doubles pages, mapping clavier selon le sens de lecture, mise en page.
 * Chargé comme content script (global `MRCore`) et testable sous Node.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MRCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_SETTINGS = Object.freeze({
    mode: 'auto',          // 'auto' | 'single' | 'double'
    direction: 'rtl',      // 'rtl' (japonais) | 'ltr'
    animation: 'flip',     // 'flip' | 'slide' | 'none'
    theme: 'dark',         // 'dark' | 'light'
    firstPageAlone: true,  // couverture seule en double page
    autoOpen: true,        // ouvrir le lecteur automatiquement
  });

  const ALLOWED = {
    mode: ['auto', 'single', 'double'],
    direction: ['rtl', 'ltr'],
    animation: ['flip', 'slide', 'none'],
    theme: ['dark', 'light'],
  };

  /** Fusionne des réglages stockés avec les valeurs par défaut, en ignorant les valeurs invalides. */
  function normalizeSettings(raw) {
    const out = { ...DEFAULT_SETTINGS };
    if (!raw || typeof raw !== 'object') return out;
    for (const key of Object.keys(ALLOWED)) {
      if (ALLOWED[key].includes(raw[key])) out[key] = raw[key];
    }
    for (const key of ['firstPageAlone', 'autoOpen']) {
      if (typeof raw[key] === 'boolean') out[key] = raw[key];
    }
    return out;
  }

  /** Une image est « large » (double page dessinée d'un seul tenant) si elle est paysage. */
  const WIDE_RATIO = 1.0;
  function isWide(page) {
    return !!page && page.ratio > WIDE_RATIO;
  }

  /**
   * Extrait l'objet passé à `ts_reader.run({...})` (thème WordPress MangaReader).
   * Retourne null si absent ou illisible.
   */
  /**
   * Valeur JSON (objet ou tableau) qui suit `marker` dans un texte de script, en respectant les chaînes.
   * Retourne null si absente ou illisible.
   */
  function extractJsonAfter(text, marker) {
    if (typeof text !== 'string') return null;
    const start = text.indexOf(marker);
    if (start === -1) return null;
    const from = start + marker.length;
    const rel = text.slice(from).search(/[[{]/);
    if (rel === -1) return null;
    const open = from + rel;
    const closer = text[open] === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    for (let i = open; i < text.length; i++) {
      const c = text[i];
      if (inString) {
        if (c === '\\') i++;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === text[open]) depth++;
      else if (c === closer) {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(text.slice(open, i + 1));
          } catch (_) {
            return null;
          }
        }
      }
    }
    return null;
  }

  /** Extrait l'objet passé à `ts_reader.run({...})` (thème WordPress MangaReader). */
  function parseTsReader(scriptText) {
    const v = extractJsonAfter(scriptText, 'ts_reader.run(');
    return v && !Array.isArray(v) ? v : null;
  }

  /** Valeur d'une variable chaîne `var name = "..."` dans un script (null si absente). */
  function parseJsString(text, name) {
    if (typeof text !== 'string') return null;
    const m = text.match(new RegExp(`(?:var|let|const)\\s+${name}\\s*=\\s*("(?:[^"\\\\]|\\\\.)*")`));
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch (_) { return null; }
  }

  /** Liste d'URLs d'images de la source par défaut d'une config ts_reader. */
  function imagesFromTsReader(config) {
    if (!config || !Array.isArray(config.sources) || config.sources.length === 0) return [];
    const preferred = config.sources.find((s) => s && s.source === config.defaultSource);
    const source = preferred || config.sources[0];
    if (!source || !Array.isArray(source.images)) return [];
    return source.images.filter((u) => typeof u === 'string' && /^https?:\/\//.test(u));
  }

  /** « Sakamoto Days 66 » → { title: 'Sakamoto Days', chapter: '66' }. */
  function parseChapterTitle(text) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    // « One Piece #1198: L'île… » (CMS my Manga Reader)
    const hash = clean.match(/^(.+?)\s*#\s*(\d+(?:[.,]\d+)?)\b/);
    if (hash) return { title: hash[1].trim(), chapter: hash[2].replace(',', '.') };
    const m = clean.match(/^(.*?)[\s\-–—:]*(?:chapitre|chapter|ch\.?)?\s*(\d+(?:[.,]\d+)?)\s*$/i);
    if (m && m[1]) return { title: m[1].trim(), chapter: m[2].replace(',', '.') };
    return { title: clean, chapter: '' };
  }

  /**
   * Découpe les pages en « planches » affichées ensemble.
   * Chaque planche : { pages: [indices dans l'ordre de lecture], kind }
   *   kind = 'single' (mode une page), 'pair', 'wide' (image paysage seule),
   *          'lead' (page seule qui se tourne en avant : couverture, page isolée),
   *          'trail' (dernière page isolée).
   */
  function buildSpreads(pages, opts) {
    const double = !!(opts && opts.double);
    const firstAlone = !(opts && opts.firstPageAlone === false);
    const n = pages.length;
    const spreads = [];
    if (!double) {
      for (let i = 0; i < n; i++) spreads.push({ pages: [i], kind: 'single' });
      return spreads;
    }
    let i = 0;
    if (firstAlone && n > 0 && !isWide(pages[0])) {
      spreads.push({ pages: [0], kind: 'lead' });
      i = 1;
    }
    while (i < n) {
      if (isWide(pages[i])) {
        spreads.push({ pages: [i], kind: 'wide' });
        i += 1;
      } else if (i + 1 < n && !isWide(pages[i + 1])) {
        spreads.push({ pages: [i, i + 1], kind: 'pair' });
        i += 2;
      } else {
        spreads.push({ pages: [i], kind: i === n - 1 ? 'trail' : 'lead' });
        i += 1;
      }
    }
    return spreads;
  }

  /** Index de la planche qui contient la page `pageIndex` (0 si introuvable). */
  function spreadIndexForPage(spreads, pageIndex) {
    const idx = spreads.findIndex((s) => s.pages.includes(pageIndex));
    return idx === -1 ? 0 : idx;
  }

  /**
   * Contenu des deux côtés physiques (gauche / droite) d'une planche double.
   * Un contenu = { page, part: 'full' | 'left' | 'right' } ou null.
   * En japonais (rtl) la première page lue est à droite.
   */
  function spreadSides(spread, direction) {
    const rtl = direction === 'rtl';
    const full = (page) => ({ page, part: 'full' });
    switch (spread.kind) {
      case 'pair': {
        const [first, second] = spread.pages;
        return rtl ? { left: full(second), right: full(first) } : { left: full(first), right: full(second) };
      }
      case 'wide': {
        const p = spread.pages[0];
        return { left: { page: p, part: 'left' }, right: { page: p, part: 'right' } };
      }
      case 'lead': {
        // Côté qui se tourne vers l'avant : gauche en rtl, droite en ltr.
        const p = full(spread.pages[0]);
        return rtl ? { left: p, right: null } : { left: null, right: p };
      }
      case 'trail': {
        // Côté lu en premier : droite en rtl, gauche en ltr.
        const p = full(spread.pages[0]);
        return rtl ? { left: null, right: p } : { left: p, right: null };
      }
      default:
        return { left: null, right: null };
    }
  }

  /** Décalage horizontal (en largeurs de page) qui centre une page seule. */
  function spreadShift(sides) {
    if (sides.left && !sides.right) return 0.5;
    if (!sides.left && sides.right) return -0.5;
    return 0;
  }

  /**
   * Côté de la feuille qui pivote lors d'un tournage de page en double.
   * rtl + avancer → la page de gauche passe à droite.
   */
  function leafSide(direction, forward) {
    return (direction === 'rtl') === forward ? 'left' : 'right';
  }

  /** Ratio largeur/hauteur de référence (médiane des pages portrait). */
  function referenceRatio(pages) {
    const ratios = pages.filter((p) => p && p.ratio > 0 && !isWide(p)).map((p) => p.ratio).sort((a, b) => a - b);
    if (ratios.length === 0) return 0.7;
    const mid = Math.floor(ratios.length / 2);
    return ratios.length % 2 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2;
  }

  /** Le mode auto passe en double page quand deux pages tiennent confortablement. */
  function resolveDouble(mode, viewportW, viewportH, ratio) {
    if (mode === 'double') return true;
    if (mode === 'single') return false;
    const pageW = (viewportH || 1) * (ratio || 0.7);
    return viewportW >= pageW * 2 * 0.92;
  }

  /** Taille d'une page (et du livre) ajustée à la hauteur, contrainte par la largeur. */
  function fitPage(viewportW, viewportH, ratio, pagesAcross, padding) {
    const pad = padding == null ? 0 : padding;
    const availW = Math.max(1, viewportW - pad * 2);
    const availH = Math.max(1, viewportH - pad * 2);
    let h = availH;
    let w = h * ratio;
    if (w * pagesAcross > availW) {
      w = availW / pagesAcross;
      h = w / ratio;
    }
    return { width: Math.round(w), height: Math.round(h) };
  }

  /**
   * Traduit une touche en action. Les flèches suivent le sens physique du livre :
   * en japonais, ← avance (on va vers la gauche), → recule.
   */
  function keyToAction(event, direction) {
    const key = event.key;
    const rtl = direction === 'rtl';
    if (event.metaKey || event.ctrlKey || event.altKey) return null;
    switch (key) {
      case 'ArrowLeft':
        return rtl ? 'next' : 'prev';
      case 'ArrowRight':
        return rtl ? 'prev' : 'next';
      case ' ':
      case 'Spacebar':
        return event.shiftKey ? 'prev' : 'next';
      case 'PageDown':
      case 'ArrowDown':
        return 'next';
      case 'PageUp':
      case 'ArrowUp':
        return 'prev';
      case 'Home':
        return 'first';
      case 'End':
        return 'last';
      case 'Escape':
        return 'escape';
    }
    switch (key.toLowerCase()) {
      case 'd':
        return 'cycleMode';
      case 'm':
      case 't':
        return 'toggleTheme';
      case 's':
        return 'toggleDirection';
      case 'o':
        return 'toggleOffset';
      case 'a':
        return 'cycleAnimation';
      case 'f':
        return 'fullscreen';
      case 'z':
        return 'zoom';
      case 'n':
        return 'nextChapter';
      case 'p':
        return 'prevChapter';
      case 'h':
      case '?':
        return 'help';
    }
    return null;
  }

  /** Côté écran (0..1 depuis la gauche) → action de navigation selon le sens de lecture. */
  function zoneToAction(x, direction) {
    const rtl = direction === 'rtl';
    if (x < 0.38) return rtl ? 'next' : 'prev';
    if (x > 0.62) return rtl ? 'prev' : 'next';
    return 'toggleUi';
  }

  /** Glissement tactile horizontal → action (tirer la page comme dans un livre). */
  function swipeToAction(dx, dy, direction) {
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.3) return null;
    const towardRight = dx > 0;
    return (direction === 'rtl') === towardRight ? 'next' : 'prev';
  }

  const MODES = ['auto', 'double', 'single'];
  const ANIMATIONS = ['flip', 'slide', 'none'];
  function cycle(list, value) {
    const i = list.indexOf(value);
    return list[(i + 1) % list.length];
  }

  /** Libellé « 6–7 / 19 » d'une planche (numérotation humaine). */
  function spreadLabel(spread, total) {
    if (!spread) return `0 / ${total}`;
    const nums = spread.pages.map((p) => p + 1).sort((a, b) => a - b);
    const range = nums.length > 1 ? `${nums[0]}–${nums[nums.length - 1]}` : `${nums[0]}`;
    return `${range} / ${total}`;
  }

  /* ------------------------------------------------------------------ multi-sites */

  /** « www.Example.com » → « example.com » ; null si l'hôte n'est pas un domaine web. */
  function siteHost(hostname) {
    const host = String(hostname || '').toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;
    return host;
  }

  /** Motif d'autorisation couvrant le domaine, www et ses sous-domaines. */
  function sitePattern(host) {
    const h = siteHost(host);
    if (!h) return null;
    return /^\d+(\.\d+){3}$/.test(h) ? `*://${h}/*` : `*://*.${h}/*`;
  }

  /** Conteneurs de lecture des thèmes/lecteurs de scans les plus répandus, du plus sûr au moins sûr. */
  const READER_SELECTORS = [
    '#readerarea img',                     // WordPress « MangaReader » (Themesia)
    '.reading-content img',                // WordPress « Madara »
    '.wp-manga-chapter-img',               // Madara (variante)
    '.container-chapter-reader img',       // Manganato & clones
    '#chapter-images img', '.chapter-images img',
    '.reader-area img', '.chapter-content img', '.chapter-container img',
    '#images img', '.page-chapter img', '.reading-detail img',
  ];

  const PLACEHOLDER = /(^data:|\.svg(\?|$)|placeholder|lazy[-_.]?load|loading\.gif|blank\.(gif|png))/i;
  const LAZY_ATTRS = ['data-src', 'data-lazy-src', 'data-original', 'data-url', 'data-cfsrc', 'data-srcset', 'srcset', 'src'];

  /** Vraie URL d'une image, en tenant compte du chargement paresseux. `attrs` : nom → valeur. */
  function resolveImageSrc(attrs, baseUrl) {
    for (const name of LAZY_ATTRS) {
      let v = attrs && attrs[name];
      if (!v || typeof v !== 'string') continue;
      v = v.trim();
      if (name.endsWith('srcset')) v = v.split(',')[0].trim().split(/\s+/)[0];
      if (!v || PLACEHOLDER.test(v)) continue;
      try {
        const url = new URL(v, baseUrl);
        if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
      } catch (_) { /* URL invalide : attribut suivant */ }
    }
    return null;
  }

  /**
   * Détection générique : parmi les images de la page, le plus grand groupe de grandes images
   * partageant le même conteneur. Candidat : { src, group, w (largeur affichée), natW, natH, attrW }.
   */
  function pickImageGroup(candidates, viewportW) {
    const minW = Math.min(480, (viewportW || 1280) * 0.4);
    const size = (c) => (c.w > 0 ? c.w : Math.max(c.natW || 0, c.attrW || 0));
    const groups = new Map();
    for (const c of candidates) {
      if (!c || !c.src || size(c) < minW) continue;
      if (c.natW > 0 && c.natH > 0) {
        const r = c.natW / c.natH;
        if (r > 2.2 || r < 0.25) continue; // bannières publicitaires, bandes de webtoon
      }
      if (!groups.has(c.group)) groups.set(c.group, []);
      groups.get(c.group).push(c.src);
    }
    let best = [];
    for (const list of groups.values()) {
      const unique = [...new Set(list)];
      if (unique.length > best.length) best = unique;
    }
    return best.length >= 3 ? best : [];
  }

  /**
   * Liens vers les chapitres précédent / suivant. `links` : [{ href, text, rel, className }].
   * Score : classe (3) > rel (2) > texte (1). Ancres internes et page courante ignorées.
   */
  function pickNavLinks(links, currentUrl) {
    const best = { next: null, prev: null };
    const score = { next: 0, prev: 0 };
    let here;
    try { here = new URL(currentUrl); } catch (_) { return best; }
    for (const l of links || []) {
      if (!l || !l.href) continue;
      let url;
      try { url = new URL(l.href, here); } catch (_) { continue; }
      if (url.origin !== here.origin) continue;
      if (url.pathname === here.pathname && url.search === here.search) continue;
      const cls = String(l.className || '').toLowerCase();
      const rel = String(l.rel || '').toLowerCase();
      const text = String(l.text || '').replace(/\s+/g, ' ').trim().toLowerCase();
      for (const kind of ['next', 'prev']) {
        const clsRe = kind === 'next' ? /(^|[\s_-])next([\s_-]|$)/ : /(^|[\s_-])prev(ious)?([\s_-]|$)/;
        const textRe = kind === 'next' ? /(suivant|next|prochain)/ : /(précédent|precedent|prev|previous)/;
        let s = 0;
        if (clsRe.test(cls)) s = 3;
        else if (new RegExp(`(^|\\s)${kind}(\\s|$)`).test(rel)) s = 2;
        else if (text.length <= 40 && textRe.test(text)) s = 1;
        if (s > score[kind]) { score[kind] = s; best[kind] = url.href; }
      }
    }
    if (best.next && best.next === best.prev) best.prev = null;
    return best;
  }

  /* ------------------------------------------------------------------ Scan-Manga */

  /** URL d'un autre chapitre : le serveur route sur l'identifiant final (`…-Chapitre-173-FR_575315.html`). */
  function scanMangaUrl(currentUrl, id, num) {
    if (!/^\d+$/.test(String(id))) return null;
    let url;
    try { url = new URL(currentUrl); } catch (_) { return null; }
    const m = url.pathname.match(/^(.*)-Chapitre-[^/]*?-([A-Za-z]{2,3})_\d+\.html$/);
    if (!m) return null;
    const label = String(num == null || num === '' ? id : num).trim().replace(/[^\w.-]+/g, '-');
    return `${url.origin}${m[1]}-Chapitre-${label}-${m[2]}_${id}.html`;
  }

  /** Écarte un « chapitre suivant » dont le numéro est inférieur (ou l'inverse) au chapitre courant. */
  function isAdjacentChapter(current, candidate, kind) {
    const a = parseFloat(String(current).replace(',', '.'));
    const b = parseFloat(String(candidate).replace(',', '.'));
    if (Number.isNaN(a) || Number.isNaN(b)) return true;
    return kind === 'next' ? b > a : b < a;
  }

  /* ------------------------------------------------------------------ my Manga Reader (Scan-VF…) */

  /** `var pages = [...]`, `next_chapter`, `prev_chapter`, `current_page` du CMS my Manga Reader. */
  function parseMyMangaReader(scriptText) {
    const raw = extractJsonAfter(scriptText, 'var pages =');
    if (!Array.isArray(raw)) return null;
    const pages = raw
      .filter((p) => p && typeof p.page_image === 'string' && p.page_image.trim())
      .map((p) => ({ image: p.page_image.trim(), external: Number(p.external) === 1 }));
    if (!pages.length) return null;
    const current = parseInt((String(scriptText).match(/var\s+current_page\s*=\s*(\d+)/) || [])[1], 10);
    return {
      pages,
      next: parseJsString(scriptText, 'next_chapter') || null,
      prev: parseJsString(scriptText, 'prev_chapter') || null,
      current: current > 0 ? current : 1,
    };
  }

  /** URL de chaque page : relative au dossier de la page affichée, ou absolue si `external`. */
  function myMangaReaderUrls(pages, shownImageUrl) {
    let dir;
    try { dir = new URL('.', String(shownImageUrl || '').trim()).href; } catch (_) { return []; }
    const out = [];
    for (const p of pages || []) {
      try {
        const u = p.external ? new URL(p.image) : new URL(p.image, dir);
        if (u.protocol === 'http:' || u.protocol === 'https:') out.push(u.href);
      } catch (_) { /* page ignorée */ }
    }
    return out;
  }

  /** « …/chapitre-1197/15 » → « …/chapitre-1197 » (on retire le numéro de page, pas un identifiant). */
  function stripPageSuffix(url) {
    let u;
    try { u = new URL(url); } catch (_) { return null; }
    const m = u.pathname.match(/^(.*\/([^/]*[a-z][^/]*))\/\d+\/?$/i);
    if (m) u.pathname = m[1];
    return u.href;
  }

  /* ------------------------------------------------------------------ MangaDex (API publique) */

  /** URLs des pages depuis la réponse `/at-home/server/{id}`. */
  function mangadexImageUrls(atHome, dataSaver) {
    if (!atHome || typeof atHome.baseUrl !== 'string' || !atHome.chapter) return [];
    const ch = atHome.chapter;
    const files = dataSaver ? ch.dataSaver : ch.data;
    if (!ch.hash || !Array.isArray(files)) return [];
    const kind = dataSaver ? 'data-saver' : 'data';
    return files.filter((f) => typeof f === 'string' && f).map((f) => `${atHome.baseUrl}/${kind}/${ch.hash}/${f}`);
  }

  /** Chapitres voisins (ids) depuis `/manga/{id}/aggregate`, triés par numéro. */
  function mangadexNeighbours(aggregate, currentId) {
    const list = [];
    for (const vol of Object.values((aggregate && aggregate.volumes) || {})) {
      for (const ch of Object.values((vol && vol.chapters) || {})) {
        if (!ch || !ch.id || ch.isUnavailable) continue;
        list.push({ num: parseFloat(ch.chapter), label: ch.chapter, ids: [ch.id, ...(Array.isArray(ch.others) ? ch.others : [])] });
      }
    }
    list.sort((a, b) => (Number.isNaN(a.num) ? Infinity : a.num) - (Number.isNaN(b.num) ? Infinity : b.num));
    const i = list.findIndex((c) => c.ids.includes(currentId));
    if (i === -1) return { prev: null, next: null };
    const pick = (c) => (c ? { id: c.ids[0], chapter: c.label } : null);
    return { prev: pick(list[i - 1]), next: pick(list[i + 1]) };
  }

  return {
    DEFAULT_SETTINGS,
    MODES,
    ANIMATIONS,
    normalizeSettings,
    isWide,
    parseTsReader,
    imagesFromTsReader,
    parseChapterTitle,
    buildSpreads,
    spreadIndexForPage,
    spreadSides,
    spreadShift,
    leafSide,
    referenceRatio,
    resolveDouble,
    fitPage,
    keyToAction,
    zoneToAction,
    swipeToAction,
    cycle,
    spreadLabel,
    READER_SELECTORS,
    siteHost,
    sitePattern,
    resolveImageSrc,
    pickImageGroup,
    pickNavLinks,
    scanMangaUrl,
    isAdjacentChapter,
    extractJsonAfter,
    parseJsString,
    parseMyMangaReader,
    myMangaReaderUrls,
    stripPageSuffix,
    mangadexImageUrls,
    mangadexNeighbours,
  };
});
