/* Manga Reader — lecteur plein écran : rendu en livre, tournage de page 3D, interface. */
(function (root) {
  'use strict';
  const C = root.MRCore;

  const PAD = 12;                 // marge autour du livre (px)
  const FLIP_MS = 820;            // tournage de page
  const FLIP_FAST_MS = 360;       // tournages enchaînés (touche maintenue)
  const SLIDE_MS = 480;
  const FADE_MS = 260;
  const UI_IDLE_MS = 2600;
  const FLIP_EASE = 'cubic-bezier(.5, .04, .24, 1)';
  const OUT_EASE = 'cubic-bezier(.16, 1, .3, 1)';

  const svg = (body, extra = '') =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</svg>`;
  const ICONS = {
    close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
    left: svg('<path d="m15 18-6-6 6-6"/>'),
    right: svg('<path d="m9 18 6-6-6-6"/>'),
    single: svg('<rect x="6.5" y="3" width="11" height="18" rx="1.8"/>'),
    double: svg('<rect x="2.5" y="4" width="9" height="16" rx="1.6"/><rect x="12.5" y="4" width="9" height="16" rx="1.6"/>'),
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    moon: svg('<path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.6 6.6 0 0 0 10.7 10.7z"/>'),
    expand: svg('<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M16 21h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>'),
    shrink: svg('<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/>'),
    help: svg('<circle cx="12" cy="12" r="9.5"/><path d="M9.2 9.2a2.9 2.9 0 0 1 5.6 1c0 1.9-2.8 2.6-2.8 2.6M12 17h.01"/>'),
    flip: svg('<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>'),
    slide: svg('<path d="m5 9-3 3 3 3M19 9l3 3-3 3M2 12h20"/>'),
    instant: svg('<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>'),
    offset: svg('<rect x="2" y="6" width="5" height="12" rx="1"/><rect x="10" y="4" width="5.5" height="16" rx="1"/><rect x="16.5" y="4" width="5.5" height="16" rx="1"/>'),
    rtl: svg('<path d="M19 12H5M11 18l-6-6 6-6"/>'),
    ltr: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    list: svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
  };

  const T = root.MRI18n ? root.MRI18n.t : (k) => k;
  const MODE_LABEL = { auto: () => T('modeAuto'), single: () => T('modeSingle'), double: () => T('modeDouble') };
  const ANIM_LABEL = { flip: () => T('animFlip'), slide: () => T('animSlide'), none: () => T('animNone') };
  const ANIM_ICON = { flip: 'flip', slide: 'slide', none: 'instant' };

  function h(tag, cls, html) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Attend la fin des animations ; si la timeline est gelée (onglet en arrière-plan), on les termine
  // d'office après leur durée prévue pour ne jamais bloquer la navigation.
  const settle = (anims) => {
    const all = Promise.all(anims.map((a) => a.finished.catch(() => {})));
    const longest = Math.max(0, ...anims.map((a) => {
      const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {};
      return (Number(t.duration) || 0) / Math.abs(a.playbackRate || 1);
    }));
    const guard = sleep(longest + 250).then(() => anims.forEach((a) => { try { a.finish(); } catch (_) { /* déjà annulée */ } }));
    return Promise.race([all, guard.then(() => all)]);
  };
  const chapterFromUrl = (url) => {
    const s = String(url || '');
    const named = s.match(/chap(?:itre|ter)?[-_ ]?(\d+(?:[.,]\d+)?)/i);
    if (named) return named[1].replace(',', '.');
    const m = s.replace(/\/+$/, '').match(/(\d+(?:[.-]\d+)?)$/);
    return m ? m[1].replace('-', '.') : '';
  };
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  class Reader {
    constructor(opts) {
      // Une page a soit une URL (`src`), soit une <img> du site déjà décodée (`el`, URL révoquée par le site).
      this.pages = opts.pages.map((p) => ({ src: p.src || null, el: p.el || null, ratio: p.ratio || 0 }));
      this.meta = opts.meta || {};
      this.settings = C.normalizeSettings(opts.settings);
      this.onSettingsChange = opts.onSettingsChange || (() => {});
      this.onClose = opts.onClose || (() => {});
      this.onPageChange = opts.onPageChange || (() => {});
      this.onChapter = opts.onChapter || ((url) => { location.href = url; });
      this.pageIndex = clamp(opts.startPage || 0, 0, Math.max(0, this.pages.length - 1));
      this.spreadIndex = 0;
      this.queue = [];
      this.animating = false;
      this.cache = new Map();
      this.zoomed = false;
      this.boundary = null;
      this.reduceMotion = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.listeners = [];
    }

    /* ------------------------------------------------------------------ montage */
    mount() {
      const host = document.createElement('div');
      host.id = 'yomu-reader-host';
      host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:block;margin:0;padding:0;border:0;';
      const shadow = host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = root.MRStyles;
      shadow.append(style);
      this.host = host;
      this.shadow = shadow;
      this.buildDom();
      shadow.append(this.el.root);
      document.documentElement.append(host);

      this.savedOverflow = [document.documentElement.style.overflow, document.body && document.body.style.overflow];
      document.documentElement.style.overflow = 'hidden';
      if (document.body) document.body.style.overflow = 'hidden';

      this.bindEvents();
      this.mounted = true;
      this.spreads = [];
      // Reflow forcé : l'état initial est calculé, la transition d'ouverture peut partir.
      void this.el.root.offsetWidth;
      this.el.root.classList.add('is-open');

      // Le thème du site réécrit #readerarea : les dimensions des scans ne sont souvent connues
      // qu'au chargement. On les sonde (quelques octets suffisent) avant de composer le livre.
      if (this.pages.some((p) => !p.ratio)) this.el.loader.classList.add('is-visible');
      this.probeRatios(1600).then(() => {
        if (!this.mounted) return;
        this.ready = true;
        this.el.loader.classList.remove('is-visible');
        this.relayout();
        this.renderCurrent();
        this.updateChrome(0);
        this.preloadAround();
        void this.el.root.offsetWidth;
        this.el.root.classList.add('is-ready');
        this.positionSegPill();
        this.showUi(3200);
      });
    }

    /** Attend que le ratio de chaque page soit connu (naturalWidth arrive avant la fin du téléchargement). */
    probeRatios(timeout) {
      const pending = this.pages.map((p, i) => i).filter((i) => !this.pages[i].ratio && this.pages[i].src);
      if (!pending.length) return Promise.resolve();
      const entries = pending.map((i) => [i, this.load(i).img]);
      const start = performance.now();
      return new Promise((resolve) => {
        const tick = () => {
          let missing = 0;
          for (const [i, img] of entries) {
            if (this.pages[i].ratio) continue;
            if (img.naturalWidth && img.naturalHeight) this.pages[i].ratio = img.naturalWidth / img.naturalHeight;
            else if (!img.complete) missing++;
          }
          if (!missing || performance.now() - start > timeout) resolve();
          else setTimeout(tick, 25);
        };
        tick();
      });
    }

    close() {
      if (!this.mounted) return;
      this.mounted = false;
      this.el.root.classList.remove('is-open');
      if (document.fullscreenElement === this.host) document.exitFullscreen().catch(() => {});
      for (const [target, type, fn, opt] of this.listeners) target.removeEventListener(type, fn, opt);
      this.listeners = [];
      clearTimeout(this.uiTimer);
      clearTimeout(this.toastTimer);
      setTimeout(() => {
        this.host.remove();
        document.documentElement.style.overflow = this.savedOverflow[0] || '';
        if (document.body) document.body.style.overflow = this.savedOverflow[1] || '';
        this.onClose();
      }, 420);
    }

    on(target, type, fn, opt) {
      target.addEventListener(type, fn, opt);
      this.listeners.push([target, type, fn, opt]);
    }

    /* ------------------------------------------------------------------ DOM */
    buildDom() {
      const el = (this.el = {});
      el.root = h('div', 'mr');
      el.root.append(h('div', 'mr-bg'), h('div', 'mr-grain'));

      el.stage = h('div', 'mr-stage');
      el.zoom = h('div', 'mr-zoom');
      el.stage.append(el.zoom);
      el.root.append(el.stage);

      el.zoneL = h('div', 'mr-zone left', `<div class="mr-hint"><div class="mr-hint-btn">${ICONS.left}</div><div class="mr-hint-label"></div></div>`);
      el.zoneR = h('div', 'mr-zone right', `<div class="mr-hint"><div class="mr-hint-btn">${ICONS.right}</div><div class="mr-hint-label"></div></div>`);
      el.root.append(el.zoneL, el.zoneR);

      // Barre du haut
      const top = h('header', 'mr-top');
      const title = this.meta.title || document.title;
      el.title = h('a', 'mr-title mr-glass', `
        <span class="mr-seal">読</span>
        <span class="mr-title-text">
          <span class="mr-title-name">${escapeHtml(title)}</span>
          <span class="mr-title-ch">${this.meta.chapter ? escapeHtml(T('chapterN', this.meta.chapter)) : escapeHtml(T('reading'))}</span>
        </span>`);
      if (this.meta.mangaUrl) {
        el.title.href = this.meta.mangaUrl;
        el.title.title = T('allChapters');
      }
      el.title.style.textDecoration = 'none';
      el.title.style.color = 'inherit';

      const tools = h('div', 'mr-tools mr-glass');
      el.seg = h('div', 'mr-seg');
      el.segPill = h('span', 'mr-seg-pill');
      el.seg.append(el.segPill);
      el.modeBtns = {};
      for (const [mode, inner, tip] of [
        ['single', ICONS.single, T('modeSingle')],
        ['double', ICONS.double, T('modeDouble')],
        ['auto', `<span>${escapeHtml(T('modeAuto'))}</span>`, T('modeAutoTip')],
      ]) {
        const b = this.button(inner, tip, mode === 'auto' ? 'D' : null);
        b.addEventListener('click', () => this.setSetting('mode', mode));
        el.modeBtns[mode] = b;
        el.seg.append(b);
      }
      el.offsetBtn = this.button(ICONS.offset, T('offsetTip'), 'O');
      el.offsetBtn.addEventListener('click', () => this.perform('toggleOffset'));
      el.dirBtn = this.button('', '', 'S');
      el.dirBtn.addEventListener('click', () => this.perform('toggleDirection'));
      el.animBtn = this.button('', '', 'A');
      el.animBtn.addEventListener('click', () => this.perform('cycleAnimation'));
      el.themeBtn = this.button('', '', 'M');
      el.themeBtn.addEventListener('click', () => this.perform('toggleTheme'));
      el.fsBtn = this.button(ICONS.expand, T('fullscreen'), 'F');
      el.fsBtn.addEventListener('click', () => this.perform('fullscreen'));
      el.helpBtn = this.button(ICONS.help, T('shortcuts'), '?');
      el.helpBtn.addEventListener('click', () => this.perform('help'));
      el.closeBtn = this.button(ICONS.close, T('backToSite'), T('keyEsc'));
      el.closeBtn.addEventListener('click', () => this.close());
      el.dirBtn.classList.add('mr-dir');
      el.offsetBtn.classList.add('mr-hide-sm');
      el.animBtn.classList.add('mr-hide-sm');
      el.helpBtn.classList.add('mr-hide-sm');
      tools.append(el.seg, el.offsetBtn, h('span', 'mr-sep mr-hide-sm'), el.dirBtn, el.animBtn, el.themeBtn,
        h('span', 'mr-sep'), el.fsBtn, el.helpBtn, el.closeBtn);
      top.append(el.title, tools);
      el.root.append(top);
      el.top = top;

      // Barre du bas
      const bottom = h('footer', 'mr-bottom');
      el.dock = h('div', 'mr-dock mr-glass');
      el.prevCh = h('button', 'mr-btn mr-ch-btn');
      el.nextCh = h('button', 'mr-btn mr-ch-btn');
      el.prevCh.addEventListener('click', () => this.perform('prevChapter'));
      el.nextCh.addEventListener('click', () => this.perform('nextChapter'));
      el.counter = h('div', 'mr-counter', '<span class="mr-counter-now"></span><span class="mr-counter-total"></span>');
      el.scrub = h('div', 'mr-scrub', '<div class="mr-track"><div class="mr-fill"></div><div class="mr-ticks"></div><div class="mr-knob"></div></div>');
      el.preview = h('div', 'mr-preview mr-glass', '<div class="mr-preview-img"></div><div class="mr-preview-label"></div>');
      el.scrub.append(el.preview);
      el.dock.append(el.prevCh, el.counter, el.scrub, el.nextCh);
      bottom.append(el.dock);
      el.root.append(bottom);
      el.bottom = bottom;
      const ticks = el.scrub.querySelector('.mr-ticks');
      if (this.pages.length <= 80) for (let i = 0; i < this.pages.length; i++) ticks.append(h('span', 'mr-tick'));

      el.toast = h('div', 'mr-toast mr-glass');
      el.flash = h('div', 'mr-flash mr-glass');
      el.loader = h('div', 'mr-loader');
      el.help = h('div', 'mr-help');
      el.root.append(el.toast, el.flash, el.loader, el.help);
      this.applyThemeAttrs();
    }

    button(inner, tip, key) {
      const b = h('button', 'mr-btn', inner);
      b.type = 'button';
      if (tip) this.setTip(b, tip, key);
      return b;
    }

    setTip(b, tip, key) {
      let t = b.querySelector('.mr-tip');
      if (!t) { t = h('span', 'mr-tip'); b.append(t); }
      t.innerHTML = escapeHtml(tip) + (key ? `<kbd>${escapeHtml(key)}</kbd>` : '');
      b.setAttribute('aria-label', tip);
    }

    /* ------------------------------------------------------------------ événements */
    bindEvents() {
      const el = this.el;
      // Rien ne doit remonter jusqu'au site (pubs « popunder » sur clic, raccourcis du thème…)
      for (const type of ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'contextmenu', 'wheel', 'auxclick']) {
        this.on(this.host, type, (e) => e.stopPropagation());
      }
      this.on(window, 'keydown', (e) => this.onKey(e), true);
      this.on(window, 'keyup', (e) => {
        if (C.keyToAction(e, this.settings.direction)) { e.stopImmediatePropagation(); }
      }, true);
      this.on(window, 'resize', () => {
        clearTimeout(this.resizeTimer);
        this.resizeTimer = setTimeout(() => this.refresh(false), 120);
      });
      this.on(document, 'fullscreenchange', () => this.updateChrome(0));

      const zoneClick = (zone) => (e) => {
        if (this.zoomed) return;
        const x = zone === 'left' ? 0.1 : 0.9;
        this.perform(C.zoneToAction(x, this.settings.direction));
        e.preventDefault();
      };
      el.zoneL.addEventListener('click', zoneClick('left'));
      el.zoneR.addEventListener('click', zoneClick('right'));

      el.stage.addEventListener('click', (e) => {
        if (this.zoomed) return;
        this.toggleUi();
        e.preventDefault();
      });
      el.stage.addEventListener('dblclick', (e) => this.toggleZoom(e.clientX, e.clientY));

      this.on(el.root, 'mousemove', (e) => {
        if (this.zoomed) this.panZoom(e.clientX, e.clientY);
        const dx = Math.abs(e.clientX - (this.lastMouse ? this.lastMouse[0] : e.clientX));
        const dy = Math.abs(e.clientY - (this.lastMouse ? this.lastMouse[1] : e.clientY));
        this.lastMouse = [e.clientX, e.clientY];
        if (dx + dy > 2) this.showUi();
      });
      for (const bar of [el.top, el.bottom]) {
        bar.addEventListener('mouseenter', () => { this.hoverBar = true; this.showUi(); });
        bar.addEventListener('mouseleave', () => { this.hoverBar = false; this.showUi(); });
      }

      // Molette / trackpad : une page par geste, inertie absorbée.
      this.wheelAcc = 0;
      this.wheelLock = 0;
      this.on(el.root, 'wheel', (e) => {
        if (e.ctrlKey) return;
        e.preventDefault();
        const now = performance.now();
        if (now < this.wheelLock) { this.wheelLock = Math.max(this.wheelLock, now + 160); return; }
        const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
        // Sur trackpad, glisser deux doigts vers la droite = deltaX négatif = tirer la page vers la droite.
        const delta = horizontal ? (this.settings.direction === 'rtl' ? -e.deltaX : e.deltaX) : e.deltaY;
        this.wheelAcc += delta;
        clearTimeout(this.wheelReset);
        this.wheelReset = setTimeout(() => { this.wheelAcc = 0; }, 220);
        if (Math.abs(this.wheelAcc) > 42) {
          this.perform(this.wheelAcc > 0 ? 'next' : 'prev');
          this.wheelAcc = 0;
          this.wheelLock = now + 480;
        }
      }, { passive: false });

      // Tactile : balayage
      let touch = null;
      el.root.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) touch = [e.touches[0].clientX, e.touches[0].clientY];
      }, { passive: true });
      el.root.addEventListener('touchend', (e) => {
        if (!touch || this.zoomed) return;
        const t = e.changedTouches[0];
        const action = C.swipeToAction(t.clientX - touch[0], t.clientY - touch[1], this.settings.direction);
        touch = null;
        if (action) { this.perform(action); e.preventDefault(); }
      });

      // Progression
      const scrubPage = (e) => {
        const r = el.scrub.getBoundingClientRect();
        let f = clamp((e.clientX - r.left) / r.width, 0, 0.9999);
        if (this.settings.direction === 'rtl') f = 1 - f;
        return { page: clamp(Math.floor(f * this.pages.length), 0, this.pages.length - 1), x: e.clientX - r.left };
      };
      el.scrub.addEventListener('pointermove', (e) => {
        const { page, x } = scrubPage(e);
        this.showPreview(page, x);
        if (this.scrubbing) this.jumpToPage(page, 'none');
      });
      el.scrub.addEventListener('pointerleave', () => { if (!this.scrubbing) el.preview.classList.remove('is-visible'); });
      el.scrub.addEventListener('pointerdown', (e) => {
        this.scrubbing = true;
        el.scrub.classList.add('is-dragging');
        el.scrub.setPointerCapture(e.pointerId);
        this.scrubStart = this.spreadIndex;
        this.jumpToPage(scrubPage(e).page, 'none');
      });
      const endScrub = () => {
        if (!this.scrubbing) return;
        this.scrubbing = false;
        el.scrub.classList.remove('is-dragging');
        el.preview.classList.remove('is-visible');
      };
      el.scrub.addEventListener('pointerup', endScrub);
      el.scrub.addEventListener('pointercancel', endScrub);
      el.help.addEventListener('click', (e) => { if (e.target === el.help) this.toggleHelp(false); });
    }

    onKey(e) {
      if (!this.mounted) return;
      const action = C.keyToAction(e, this.settings.direction);
      if (!action) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat && this.queue.length >= 2 && (action === 'next' || action === 'prev')) return;
      this.perform(action);
    }

    perform(action) {
      const s = this.settings;
      if (this.helpOpen && action !== 'help' && action !== 'escape') this.toggleHelp(false);
      switch (action) {
        case 'next': return this.go(1);
        case 'prev': return this.go(-1);
        case 'first': return this.jumpToSpread(0, 'fade');
        case 'last': return this.jumpToSpread(this.spreads.length - 1, 'fade');
        case 'toggleUi': return this.toggleUi();
        case 'cycleMode': return this.setSetting('mode', C.cycle(C.MODES, s.mode), true);
        case 'toggleTheme': return this.setSetting('theme', s.theme === 'dark' ? 'light' : 'dark');
        case 'toggleDirection': return this.setSetting('direction', s.direction === 'rtl' ? 'ltr' : 'rtl', true);
        case 'toggleOffset':
          if (!this.double) return this.flash(ICONS.offset, T('onlyInDouble'));
          return this.setSetting('firstPageAlone', !s.firstPageAlone, true);
        case 'cycleAnimation': return this.setSetting('animation', C.cycle(C.ANIMATIONS, s.animation), true);
        case 'fullscreen': return this.toggleFullscreen();
        case 'zoom': {
          const m = this.lastMouse || [innerWidth / 2, innerHeight / 2];
          return this.toggleZoom(m[0], m[1]);
        }
        case 'nextChapter': return this.chapter('next', true);
        case 'prevChapter': return this.chapter('prev', true);
        case 'help': return this.toggleHelp();
        case 'escape':
          if (this.helpOpen) return this.toggleHelp(false);
          if (this.zoomed) return this.toggleZoom();
          if (this.boundary) return this.hideToast();
          return this.close();
      }
    }

    /* ------------------------------------------------------------------ réglages */
    setSetting(key, value, flash) {
      if (this.settings[key] === value) return;
      const next = { ...this.settings, [key]: value };
      this.applySettings(next, flash ? key : null);
      this.onSettingsChange(this.settings);
    }

    /** Appelé aussi quand le popup modifie les réglages. */
    applySettings(raw, flashKey) {
      const next = C.normalizeSettings(raw);
      const prev = this.settings;
      this.settings = next;
      const layoutChanged = prev.mode !== next.mode || prev.direction !== next.direction || prev.firstPageAlone !== next.firstPageAlone;
      if (prev.theme !== next.theme) this.applyThemeAttrs();
      if (layoutChanged) this.refresh(true);
      else this.updateChrome(0);
      if (flashKey === 'mode') {
        const label = next.mode === 'auto' ? T(this.double ? 'autoDoubleFlash' : 'autoSingleFlash') : MODE_LABEL[next.mode]();
        this.flash(this.double ? ICONS.double : ICONS.single, label);
      } else if (flashKey === 'direction') {
        this.flash(next.direction === 'rtl' ? ICONS.rtl : ICONS.ltr,
          T(next.direction === 'rtl' ? 'dirRtlFlash' : 'dirLtrFlash'));
      } else if (flashKey === 'firstPageAlone') {
        this.flash(ICONS.offset, T(next.firstPageAlone ? 'coverAlone' : 'pairedFromStart'));
      } else if (flashKey === 'animation') {
        this.flash(ICONS[ANIM_ICON[next.animation]], ANIM_LABEL[next.animation]());
      }
    }

    applyThemeAttrs() {
      this.el.root.dataset.theme = this.settings.theme;
    }

    /* ------------------------------------------------------------------ mise en page */
    relayout() {
      const vw = innerWidth;
      const vh = innerHeight;
      this.vw = vw;
      this.vh = vh;
      this.refRatio = C.referenceRatio(this.pages);
      this.double = C.resolveDouble(this.settings.mode, vw - PAD * 2, vh - PAD * 2, this.refRatio);
      this.spreads = C.buildSpreads(this.pages, { double: this.double, firstPageAlone: this.settings.firstPageAlone });
      this.spreadIndex = C.spreadIndexForPage(this.spreads, this.pageIndex);
      this.pageSize = C.fitPage(vw, vh, this.refRatio, this.double ? 2 : 1, PAD);
    }

    /** Recalcule et ré-affiche la planche courante (fondu si `animate`). */
    async refresh(animate) {
      if (this.animating) { this.pendingRefresh = animate ? 'fade' : 'none'; return; }
      this.relayout();
      if (animate) await this.runTransition(this.spreadIndex, 'fade');
      else this.renderCurrent();
      this.updateChrome(0);
      this.positionSegPill();
    }

    renderCurrent() {
      const book = this.createBook(this.spreadIndex);
      this.el.zoom.replaceChildren(book);
      this.book = book;
    }

    sidesOf(index) {
      return C.spreadSides(this.spreads[index], this.settings.direction);
    }

    createBook(index) {
      const spread = this.spreads[index];
      const book = h('div', 'mr-book');
      book._index = index;
      if (!spread) return book;
      if (this.double) {
        const { width: W, height: H } = this.pageSize;
        Object.assign(book.style, { width: `${W * 2}px`, height: `${H}px`, marginLeft: `${-W}px`, marginTop: `${-H / 2}px` });
        const sides = this.sidesOf(index);
        book._slots = { left: this.makeSlot(0, W, 'left'), right: this.makeSlot(W, W, 'right') };
        book.append(book._slots.left, book._slots.right);
        this.fillSlot(book._slots.left, sides.left, 'left', !!(sides.left && sides.right));
        this.fillSlot(book._slots.right, sides.right, 'right', !!(sides.left && sides.right));
        book._shift = C.spreadShift(sides) * W;
        book.style.transform = `translateX(${book._shift}px)`;
      } else {
        const page = this.pages[spread.pages[0]];
        const { width: W, height: H } = C.fitPage(this.vw, this.vh, page.ratio || this.refRatio, 1, PAD);
        Object.assign(book.style, { width: `${W}px`, height: `${H}px`, marginLeft: `${-W / 2}px`, marginTop: `${-H / 2}px` });
        book._slots = { single: this.makeSlot(0, W, 'single') };
        book.append(book._slots.single);
        this.fillSlot(book._slots.single, { page: spread.pages[0], part: 'full' }, 'single', false);
        book._shift = 0;
      }
      return book;
    }

    makeSlot(left, width, side) {
      const slot = h('div', 'mr-slot');
      slot.style.left = `${left}px`;
      slot.style.width = `${width}px`;
      slot._side = side;
      slot._cast = h('div', `mr-cast ${side === 'left' ? 'from-right' : 'from-left'}`);
      slot.append(slot._cast);
      return slot;
    }

    fillSlot(slot, content, side, gutter) {
      for (const child of [...slot.children]) if (child !== slot._cast) child.remove();
      if (content) slot.prepend(this.makePage(content, side, gutter));
    }

    makePage(content, side, gutter) {
      const page = h('div', 'mr-page');
      const img = this.makeImg(content.page, page);
      if (content.part === 'full') page.append(img);
      else {
        const half = h('div', 'mr-half');
        half.style.left = content.part === 'left' ? '0' : '-100%';
        half.append(img);
        page.append(half);
        page.classList.add('is-wide-half');
      }
      if (gutter && side !== 'single') page.classList.add('has-gutter', side === 'left' ? 'gutter-right' : 'gutter-left');
      return page;
    }

    makeImg(index, page) {
      if (!this.pages[index].src) return this.makeCanvas(index, page);
      const img = document.createElement('img');
      img.alt = '';
      img.draggable = false;
      img.decoding = 'async';
      const entry = this.load(index);
      const ready = () => { img.classList.add('is-ready'); page.classList.remove('is-loading'); };
      img.src = this.pages[index].src;
      if (entry.ok && img.complete) ready();
      else {
        page.classList.add('is-loading');
        img.addEventListener('load', ready, { once: true });
        img.addEventListener('error', () => page.classList.remove('is-loading'), { once: true });
      }
      return img;
    }

    /**
     * Page fournie par le site sous forme d'<img> déjà décodée : on la dessine à la résolution d'affichage,
     * sans en créer de copie téléchargeable (clic droit bloqué, comme sur le site).
     */
    makeCanvas(index, page) {
      const canvas = document.createElement('canvas');
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      const el = this.pages[index].el;
      if (el && el.complete && el.naturalWidth) {
        const cap = Math.ceil(Math.max(innerWidth, innerHeight) * Math.min(devicePixelRatio || 1, 2));
        const scale = Math.min(1, cap / Math.max(el.naturalWidth, el.naturalHeight));
        canvas.width = Math.max(1, Math.round(el.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(el.naturalHeight * scale));
        try {
          canvas.getContext('2d').drawImage(el, 0, 0, canvas.width, canvas.height);
          canvas.classList.add('is-ready');
        } catch (_) {
          page.classList.add('is-loading');
        }
      } else {
        page.classList.add('is-loading');
      }
      return canvas;
    }

    /** Le site vient de décoder une page : on l'affiche si elle est visible. */
    setPageElement(index, el) {
      const p = this.pages[index];
      if (!p || p.el === el) return;
      p.el = el;
      if (!p.ratio && el.naturalWidth) p.ratio = el.naturalWidth / el.naturalHeight;
      const entry = this.cache.get(index);
      if (entry && !entry.ok) {
        entry.ok = true;
        if (entry.resolve) entry.resolve(null);
      }
      if (!this.ready) return;
      if (this.animating) { this.pendingRepaint = true; return; }
      const spread = this.spreads[this.spreadIndex];
      if (spread && spread.pages.includes(index)) this.renderCurrent();
    }

    /* ------------------------------------------------------------------ préchargement */
    load(index) {
      let entry = this.cache.get(index);
      if (entry) return entry;
      if (!this.pages[index].src) {
        entry = { img: null, ok: !!this.pages[index].el };
        entry.promise = entry.ok ? Promise.resolve(null) : new Promise((resolve) => { entry.resolve = resolve; });
        this.cache.set(index, entry);
        return entry;
      }
      const img = new Image();
      img.decoding = 'async';
      entry = { img, ok: false };
      entry.promise = new Promise((resolve) => {
        img.onload = () => {
          entry.ok = true;
          const page = this.pages[index];
          const ratio = img.naturalWidth / img.naturalHeight;
          if (ratio && Math.abs(ratio - page.ratio) > 0.02) {
            const wasWide = C.isWide(page);
            page.ratio = ratio;
            if (wasWide !== C.isWide(page) || !this.double) this.scheduleRefresh();
          }
          resolve(img);
        };
        img.onerror = () => resolve(null);
      });
      img.src = this.pages[index].src;
      this.cache.set(index, entry);
      return entry;
    }

    scheduleRefresh() {
      if (!this.ready) return;
      clearTimeout(this.ratioTimer);
      this.ratioTimer = setTimeout(() => this.refresh(false), 60);
    }

    async ensureReady(index, timeout) {
      const spread = this.spreads[index];
      if (!spread) return;
      const waits = spread.pages.map((p) => this.load(p).promise.then((img) => img && img.decode ? img.decode().catch(() => {}) : null));
      await Promise.race([Promise.all(waits), sleep(timeout)]);
    }

    preloadAround() {
      const s = this.spreads[this.spreadIndex];
      if (!s) return;
      const first = s.pages[0];
      const order = [];
      for (let d = 0; d < this.pages.length; d++) {
        for (const i of [first + d, first - d]) if (i >= 0 && i < this.pages.length && !order.includes(i)) order.push(i);
      }
      // Les 6 plus proches tout de suite, le reste en tâche de fond.
      order.slice(0, 6).forEach((i) => this.load(i));
      const rest = order.slice(6);
      const idle = root.requestIdleCallback || ((fn) => setTimeout(fn, 200));
      const step = () => {
        const next = rest.shift();
        if (next == null) return;
        this.load(next).promise.then(() => idle(step));
      };
      idle(step);
    }

    /* ------------------------------------------------------------------ navigation */
    go(delta) {
      if (!this.spreads.length) return;
      if (this.zoomed) this.toggleZoom();
      if (this.animating) {
        if (this.queue.length < 3) this.queue.push(delta);
        return;
      }
      const to = this.spreadIndex + delta;
      if (to < 0) return this.hitBoundary('start');
      if (to >= this.spreads.length) return this.hitBoundary('end');
      if (this.boundary) this.hideToast();
      return this.runTransition(to, delta > 0 ? 'forward' : 'back');
    }

    jumpToPage(page, kind) {
      const idx = C.spreadIndexForPage(this.spreads, page);
      if (idx === this.spreadIndex) return;
      if (kind === 'none' && !this.animating) {
        this.spreadIndex = idx;
        this.pageIndex = this.spreads[idx].pages[0];
        this.renderCurrent();
        this.updateChrome(0);
        this.onPageChange(this.pageIndex);
        return;
      }
      return this.jumpToSpread(idx, kind);
    }

    jumpToSpread(idx, kind) {
      if (this.animating || idx === this.spreadIndex || !this.spreads[idx]) return;
      if (this.boundary) this.hideToast();
      return this.runTransition(idx, kind || 'fade');
    }

    async runTransition(to, kind, fast) {
      this.animating = true;
      const from = this.spreadIndex;
      const bookFrom = this.book;
      try {
        await this.ensureReady(to, fast ? 140 : 380);
        this.spreadIndex = to;
        this.pageIndex = this.spreads[to].pages[0];
        const turning = kind === 'forward' || kind === 'back';
        this.updateChrome(turning ? (kind === 'forward' ? 1 : -1) : 0);
        this.onPageChange(this.pageIndex);
        let anim = this.settings.animation;
        if (this.reduceMotion && anim !== 'none') anim = 'fade';
        if (!bookFrom || !bookFrom.isConnected || bookFrom._index !== from) anim = 'none';
        if (!turning && anim !== 'none') anim = 'fade';
        if (kind === 'fade' && this.settings.animation === 'none') anim = 'none';
        const forward = kind === 'forward';
        if (anim === 'flip') {
          if (this.double) await this.flipDouble(from, to, forward, fast ? FLIP_FAST_MS : FLIP_MS);
          else await this.flipSingle(to, forward, fast ? FLIP_FAST_MS : FLIP_MS * 0.85);
        } else if (anim === 'slide') {
          await this.slide(to, forward, fast ? SLIDE_MS * 0.6 : SLIDE_MS);
        } else if (anim === 'fade') {
          await this.crossfade(to);
        } else {
          this.renderCurrent();
        }
      } finally {
        this.animating = false;
      }
      this.preloadAround();
      if (this.pendingRepaint && !this.pendingRefresh && !this.queue.length) {
        this.pendingRepaint = false;
        this.renderCurrent();
      }
      if (this.pendingRefresh) {
        const mode = this.pendingRefresh;
        this.pendingRefresh = null;
        this.queue = [];
        return this.refresh(mode === 'fade');
      }
      if (this.queue.length) {
        const delta = this.queue.shift();
        const next = this.spreadIndex + delta;
        if (next < 0 || next >= this.spreads.length) {
          this.queue = [];
          return this.hitBoundary(next < 0 ? 'start' : 'end');
        }
        return this.runTransition(next, delta > 0 ? 'forward' : 'back', true);
      }
    }

    /* Tournage réaliste en double page : la feuille pivote autour du dos du livre. */
    async flipDouble(from, to, forward, duration) {
      const book = this.book;
      const W = this.pageSize.width;
      const A = this.sidesOf(from);
      const B = this.sidesOf(to);
      const side = C.leafSide(this.settings.direction, forward);
      const other = side === 'left' ? 'right' : 'left';
      const bothA = !!(A.left && A.right);
      const bothB = !!(B.left && B.right);

      // Sous la feuille : la page qui sera découverte.
      this.fillSlot(book._slots[side], B[side], side, bothB);

      const leaf = h('div', 'mr-leaf');
      leaf.style.left = side === 'left' ? '0' : `${W}px`;
      leaf.style.width = `${W}px`;
      leaf.style.transformOrigin = side === 'left' ? '100% 50%' : '0% 50%';
      const spineFront = side === 'left' ? 'spine-right' : 'spine-left';
      const spineBack = side === 'left' ? 'spine-left' : 'spine-right';
      const front = h('div', 'mr-face front');
      const back = h('div', 'mr-face back');
      // Une face vide (page seule) reste transparente : la feuille apparaît ou disparaît de profil.
      const hasFront = !!A[side];
      const hasBack = !!B[other];
      if (hasFront) front.append(this.makePage(A[side], side, bothA));
      if (hasBack) back.append(this.makePage(B[other], other, bothB));
      const shadeF = h('div', `mr-shade ${spineFront}`);
      const sheenF = h('div', `mr-sheen ${spineFront}`);
      const shadeB = h('div', `mr-shade ${spineBack}`);
      const sheenB = h('div', `mr-sheen ${spineBack}`);
      if (hasFront) front.append(shadeF, sheenF);
      if (hasBack) back.append(shadeB, sheenB);
      leaf.append(front, back);
      book.append(leaf);

      const angle = side === 'left' ? 180 : -180;
      const opts = { duration, easing: FLIP_EASE };
      const shiftTo = C.spreadShift(B) * W;
      const shiftFrom = book._shift;
      book._shift = shiftTo;
      book.style.transform = `translateX(${shiftTo}px)`;

      const anims = [
        leaf.animate([
          { transform: 'rotateY(0deg)' },
          { transform: `rotateY(${angle * 0.5}deg) translateZ(1px)`, offset: 0.5 },
          { transform: `rotateY(${angle}deg)` },
        ], opts),
        book.animate([{ transform: `translateX(${shiftFrom}px)` }, { transform: `translateX(${shiftTo}px)` }],
          { duration, easing: 'cubic-bezier(.45, 0, .2, 1)' }),
        // Ombre portée de la feuille sur la page qu'elle va recouvrir…
        book._slots[other]._cast.animate([{ opacity: 0 }, { opacity: 0, offset: 0.42 }, { opacity: 0.55, offset: 0.82 }, { opacity: 0 }], opts),
        // …et pénombre sur la page découverte, qui s'éclaire.
        book._slots[side]._cast.animate([{ opacity: 0.6 }, { opacity: 0, offset: 0.55 }, { opacity: 0 }], opts),
      ];
      if (hasFront) {
        anims.push(shadeF.animate([{ opacity: 0 }, { opacity: 0.5, offset: 0.5 }, { opacity: 0.5 }], opts));
        anims.push(sheenF.animate([{ opacity: 0 }, { opacity: 0.35, offset: 0.32 }, { opacity: 0, offset: 0.5 }, { opacity: 0 }], opts));
      }
      if (hasBack) {
        anims.push(shadeB.animate([{ opacity: 0.5 }, { opacity: 0.5, offset: 0.5 }, { opacity: 0 }], opts));
        anims.push(sheenB.animate([{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 0.3, offset: 0.66 }, { opacity: 0 }], opts));
      }
      await settle(anims);
      this.fillSlot(book._slots[other], B[other], other, bothB);
      leaf.remove();
      book._index = to;
    }

    /* Tournage en mode une page : la page se soulève et pivote autour de son dos. */
    async flipSingle(to, forward, duration) {
      const rtl = this.settings.direction === 'rtl';
      const oldBook = this.book;
      const newBook = this.createBook(to);
      const origin = rtl ? '100% 50%' : '0% 50%';
      const angle = rtl ? 90 : -90;
      const shadeCls = rtl ? 'spine-right' : 'spine-left';
      if (forward) {
        this.el.zoom.insertBefore(newBook, oldBook);
        oldBook.style.transformOrigin = origin;
        oldBook.style.zIndex = '2';
        const shade = h('div', `mr-shade ${shadeCls}`);
        oldBook._slots.single.append(shade);
        const cast = newBook._slots.single._cast;
        const opts = { duration, easing: 'cubic-bezier(.55, .02, .75, .45)', fill: 'forwards' };
        await settle([
          oldBook.animate([{ transform: 'rotateY(0deg)', opacity: 1 }, { transform: `rotateY(${angle * 0.82}deg)`, opacity: 1, offset: 0.85 }, { transform: `rotateY(${angle}deg)`, opacity: 0 }], opts),
          shade.animate([{ opacity: 0 }, { opacity: 0.65 }], opts),
          cast.animate([{ opacity: 0.55 }, { opacity: 0 }], { duration, easing: 'ease-out' }),
        ]);
        oldBook.remove();
      } else {
        this.el.zoom.append(newBook);
        newBook.style.transformOrigin = origin;
        newBook.style.zIndex = '2';
        const shade = h('div', `mr-shade ${shadeCls}`);
        newBook._slots.single.append(shade);
        const cast = oldBook._slots.single._cast;
        const opts = { duration, easing: 'cubic-bezier(.2, .55, .3, 1)' };
        await settle([
          newBook.animate([{ transform: `rotateY(${angle}deg)`, opacity: 0 }, { transform: `rotateY(${angle * 0.82}deg)`, opacity: 1, offset: 0.15 }, { transform: 'rotateY(0deg)', opacity: 1 }], opts),
          shade.animate([{ opacity: 0.65 }, { opacity: 0 }], opts),
          cast.animate([{ opacity: 0 }, { opacity: 0.5 }], opts),
        ]);
        shade.remove();
        newBook.style.transformOrigin = '';
        newBook.style.zIndex = '';
        oldBook.remove();
      }
      this.book = newBook;
    }

    async slide(to, forward, duration) {
      const rtl = this.settings.direction === 'rtl';
      const sign = rtl === forward ? 1 : -1; // en japonais, avancer fait glisser le contenu vers la droite
      const dx = Math.min(this.vw * 0.16, 240);
      const oldBook = this.book;
      const newBook = this.createBook(to);
      this.el.zoom.append(newBook);
      const t = (b, x, s) => `translateX(${b._shift + x}px) scale(${s})`;
      const opts = { duration, easing: OUT_EASE };
      await settle([
        oldBook.animate([{ transform: t(oldBook, 0, 1), opacity: 1 }, { transform: t(oldBook, sign * dx, 0.965), opacity: 0 }], { ...opts, fill: 'forwards' }),
        newBook.animate([{ transform: t(newBook, -sign * dx, 0.965), opacity: 0 }, { transform: t(newBook, 0, 1), opacity: 1 }], opts),
      ]);
      oldBook.remove();
      this.book = newBook;
    }

    async crossfade(to) {
      const oldBook = this.book;
      const newBook = this.createBook(to);
      this.el.zoom.append(newBook);
      const tr = (b, s) => `translateX(${b._shift}px) scale(${s})`;
      await settle([
        ...(oldBook ? [oldBook.animate([{ opacity: 1, transform: tr(oldBook, 1) }, { opacity: 0, transform: tr(oldBook, 0.985) }], { duration: FADE_MS, easing: 'ease-out', fill: 'forwards' })] : []),
        newBook.animate([{ opacity: 0, transform: tr(newBook, 1.015) }, { opacity: 1, transform: tr(newBook, 1) }], { duration: FADE_MS + 60, easing: OUT_EASE }),
      ]);
      if (oldBook) oldBook.remove();
      this.book = newBook;
    }

    /* Résistance élastique en début/fin de chapitre. */
    nudge(direction) {
      if (!this.book || this.settings.animation === 'none' || this.reduceMotion) return;
      const rtl = this.settings.direction === 'rtl';
      const sign = (direction === 'end') === rtl ? 1 : -1;
      const x = this.book._shift;
      this.book.animate([
        { transform: `translateX(${x}px)` },
        { transform: `translateX(${x + sign * 14}px)`, offset: 0.3 },
        { transform: `translateX(${x}px)` },
      ], { duration: 420, easing: 'cubic-bezier(.3, .7, .4, 1)' });
    }

    hitBoundary(which) {
      const url = which === 'end' ? this.meta.nextUrl : this.meta.prevUrl;
      if (this.boundary === which && url) return this.chapter(which === 'end' ? 'next' : 'prev');
      this.nudge(which);
      this.boundary = which;
      const rtl = this.settings.direction === 'rtl';
      const nextKey = rtl ? '←' : '→';
      const prevKey = rtl ? '→' : '←';
      const num = this.chapterLabel(which === 'end' ? 'next' : 'prev');
      let title;
      let sub;
      let cta = '';
      if (which === 'end') {
        title = escapeHtml(this.meta.chapter ? T('endOfChapterN', this.meta.chapter) : T('endOfChapter'));
        if (url) {
          sub = escapeHtml(T('pressAgainNext', '\u0001')).replace('\u0001', `<kbd>${nextKey}</kbd>`);
          cta = escapeHtml(num ? T('chapterN', num) : T('nextChapter'));
        } else sub = escapeHtml(T('lastChapter'));
      } else {
        title = escapeHtml(T('startOfChapter'));
        if (url) {
          sub = escapeHtml(T('pressAgainPrev', '\u0001')).replace('\u0001', `<kbd>${prevKey}</kbd>`);
          cta = escapeHtml(num ? T('chapterN', num) : T('prevChapter'));
        } else sub = escapeHtml(T('firstChapter'));
      }
      const el = this.el.toast;
      el.innerHTML = `<div class="mr-toast-text"><div class="mr-toast-title">${title}</div><div class="mr-toast-sub">${sub}</div></div>`;
      if (cta) {
        const b = h('button', 'mr-cta', which === 'end'
          ? (rtl ? `${ICONS.left}<span>${cta}</span>` : `<span>${cta}</span>${ICONS.right}`)
          : (rtl ? `<span>${cta}</span>${ICONS.right}` : `${ICONS.left}<span>${cta}</span>`));
        b.addEventListener('click', () => this.chapter(which === 'end' ? 'next' : 'prev'));
        el.append(b);
      } else if (this.meta.mangaUrl) {
        const b = h('button', 'mr-cta', `${ICONS.list}<span>${escapeHtml(T('chapters'))}</span>`);
        b.addEventListener('click', () => { location.href = this.meta.mangaUrl; });
        el.append(b);
      }
      el.classList.add('is-visible');
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => this.hideToast(), 5200);
    }

    /** Message d'information persistant (ex. chargement des pages par le site). */
    notice(title, sub, action) {
      this.boundary = null;
      clearTimeout(this.toastTimer);
      this.el.toast.innerHTML = `<div class="mr-toast-text"><div class="mr-toast-title">${escapeHtml(title)}</div><div class="mr-toast-sub">${escapeHtml(sub)}</div></div>`;
      if (action) {
        const b = h('button', 'mr-cta', `<span>${escapeHtml(action.label)}</span>`);
        b.addEventListener('click', action.onClick);
        this.el.toast.append(b);
      }
      this.el.toast.classList.add('is-visible');
    }

    hideToast() {
      this.boundary = null;
      clearTimeout(this.toastTimer);
      this.el.toast.classList.remove('is-visible');
    }

    chapterLabel(which) {
      const label = which === 'next' ? this.meta.nextLabel : this.meta.prevLabel;
      if (label) return String(label);
      return chapterFromUrl(which === 'next' ? this.meta.nextUrl : this.meta.prevUrl);
    }

    /**
     * Nouveau chapitre chargé sans rechargement de la page (sites d'une seule page) :
     * le livre reste ouvert, la scène revient en fondu.
     */
    replaceChapter(pages, meta, startPage) {
      this.pages = pages.map((p) => ({ src: p.src || null, el: p.el || null, ratio: p.ratio || 0 }));
      this.meta = meta || {};
      this.cache = new Map();
      this.queue = [];
      this.pageIndex = clamp(startPage || 0, 0, Math.max(0, this.pages.length - 1));
      this.el.title.querySelector('.mr-title-name').textContent = this.meta.title || document.title;
      this.el.title.querySelector('.mr-title-ch').textContent = this.meta.chapter ? T('chapterN', this.meta.chapter) : T('reading');
      const ticks = this.el.scrub.querySelector('.mr-ticks');
      ticks.replaceChildren();
      if (this.pages.length <= 80) for (let i = 0; i < this.pages.length; i++) ticks.append(h('span', 'mr-tick'));
      this.probeRatios(1600).then(() => {
        if (!this.mounted) return;
        this.el.loader.classList.remove('is-visible');
        this.relayout();
        this.renderCurrent();
        this.updateChrome(0);
        this.preloadAround();
        const stage = this.el.stage;
        stage.style.transition = 'none';
        stage.style.transform = 'translateX(0) scale(.985)';
        void stage.offsetWidth;
        stage.style.transition = 'opacity .45s ease, transform .6s cubic-bezier(.16,1,.3,1)';
        stage.style.opacity = '1';
        stage.style.transform = '';
        this.onPageChange(this.pageIndex);
      });
    }

    chapter(which, fromShortcut) {
      const url = which === 'next' ? this.meta.nextUrl : this.meta.prevUrl;
      if (!url) {
        if (fromShortcut) this.flash(ICONS.list, T(which === 'next' ? 'noNextChapter' : 'noPrevChapter'));
        return;
      }
      this.hideToast();
      this.el.loader.classList.add('is-visible');
      this.el.stage.style.transition = 'opacity .35s ease, transform .5s cubic-bezier(.16,1,.3,1)';
      this.el.stage.style.opacity = '0';
      const rtl = this.settings.direction === 'rtl';
      const sign = (which === 'next') === rtl ? 1 : -1;
      this.el.stage.style.transform = `translateX(${sign * 40}px)`;
      this.onChapter(url, which);
    }

    /* ------------------------------------------------------------------ interface */
    updateChrome(bump) {
      const el = this.el;
      const s = this.settings;
      const rtl = s.direction === 'rtl';
      const n = this.pages.length;
      const spread = this.spreads[this.spreadIndex];
      const [now, total] = C.spreadLabel(spread, n).split(' / ');
      const nowEl = el.counter.querySelector('.mr-counter-now');
      if (nowEl.textContent !== now) {
        nowEl.textContent = now;
        if (bump) {
          nowEl.style.setProperty('--bump', `${bump > 0 ? 6 : -6}px`);
          nowEl.classList.remove('bump');
          void nowEl.offsetWidth;
          nowEl.classList.add('bump');
        }
      }
      el.counter.querySelector('.mr-counter-total').textContent = `/ ${total}`;

      const last = spread ? Math.max(...spread.pages) + 1 : 0;
      const frac = n ? last / n : 0;
      el.dock.dataset.dir = s.direction;
      const fill = el.scrub.querySelector('.mr-fill');
      fill.style.width = `${frac * 100}%`;
      el.scrub.querySelector('.mr-knob').style.left = `${(rtl ? 1 - frac : frac) * 100}%`;

      // Boutons chapitre : en japonais, le suivant est à gauche.
      const nextNum = this.chapterLabel('next');
      const prevNum = this.chapterLabel('prev');
      const nextLabel = `<span class="mr-ch-label">${escapeHtml(nextNum ? T('chShort', nextNum) : T('next'))}</span>`;
      const prevLabel = `<span class="mr-ch-label">${escapeHtml(prevNum ? T('chShort', prevNum) : T('previous'))}</span>`;
      el.nextCh.innerHTML = rtl ? ICONS.left + nextLabel : nextLabel + ICONS.right;
      el.prevCh.innerHTML = rtl ? prevLabel + ICONS.right : ICONS.left + prevLabel;
      el.nextCh.disabled = !this.meta.nextUrl;
      el.prevCh.disabled = !this.meta.prevUrl;
      this.setTip(el.nextCh, T('nextChapter'), 'N');
      this.setTip(el.prevCh, T('prevChapter'), 'P');

      // Zones de clic latérales
      const atStart = this.spreadIndex <= 0 && !this.meta.prevUrl;
      const atEnd = this.spreadIndex >= this.spreads.length - 1 && !this.meta.nextUrl;
      const leftIsNext = rtl;
      el.zoneL.querySelector('.mr-hint-label').textContent = T(leftIsNext ? 'next' : 'previous');
      el.zoneR.querySelector('.mr-hint-label').textContent = T(leftIsNext ? 'previous' : 'next');
      el.zoneL.classList.toggle('is-disabled', leftIsNext ? atEnd : atStart);
      el.zoneR.classList.toggle('is-disabled', leftIsNext ? atStart : atEnd);

      // Barre d'outils
      for (const [mode, b] of Object.entries(el.modeBtns)) b.classList.toggle('is-active', s.mode === mode);
      el.offsetBtn.style.display = this.double ? '' : 'none';
      el.offsetBtn.classList.toggle('is-accent', !s.firstPageAlone);
      this.setTip(el.offsetBtn, T(s.firstPageAlone ? 'offsetOnTip' : 'offsetOffTip'), 'O');
      el.dirBtn.innerHTML = `${rtl ? ICONS.rtl : ICONS.ltr}<span class="mr-hide-sm">${escapeHtml(T(rtl ? 'dirRtlShort' : 'dirLtrShort'))}</span>`;
      this.setTip(el.dirBtn, T(rtl ? 'dirRtlTip' : 'dirLtrTip'), 'S');
      el.animBtn.innerHTML = ICONS[ANIM_ICON[s.animation]];
      this.setTip(el.animBtn, T('animationTip', ANIM_LABEL[s.animation]()), 'A');
      el.themeBtn.innerHTML = s.theme === 'dark' ? ICONS.moon : ICONS.sun;
      this.setTip(el.themeBtn, T(s.theme === 'dark' ? 'darkMode' : 'lightMode'), 'M');
      const fs = document.fullscreenElement === this.host;
      el.fsBtn.innerHTML = fs ? ICONS.shrink : ICONS.expand;
      this.setTip(el.fsBtn, T(fs ? 'exitFullscreen' : 'fullscreen'), 'F');
      this.positionSegPill();
    }

    positionSegPill() {
      const active = this.el.modeBtns[this.settings.mode];
      if (!active || !active.offsetWidth) return;
      this.el.segPill.style.width = `${active.offsetWidth}px`;
      this.el.segPill.style.transform = `translateX(${active.offsetLeft}px)`;
    }

    showPreview(page, x) {
      const p = this.el.preview;
      p.style.left = `${x}px`;
      const box = p.querySelector('.mr-preview-img');
      const src = this.pages[page].src;
      let cv = box.querySelector('canvas');
      if (src) {
        box.style.backgroundImage = `url("${src.replace(/"/g, '%22')}")`;
        if (cv) cv.remove();
      } else {
        box.style.backgroundImage = 'none';
        if (!cv) {
          cv = document.createElement('canvas');
          cv.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;border-radius:8px';
          box.append(cv);
        }
        const el = this.pages[page].el;
        if (el && el.naturalWidth) {
          const k = 240 / Math.max(el.naturalWidth, el.naturalHeight);
          cv.width = Math.round(el.naturalWidth * k);
          cv.height = Math.round(el.naturalHeight * k);
          try { cv.getContext('2d').drawImage(el, 0, 0, cv.width, cv.height); } catch (_) { /* page indisponible */ }
        } else {
          cv.width = 1;
          cv.height = 1;
        }
      }
      p.querySelector('.mr-preview-label').textContent = T('pageN', page + 1);
      p.classList.add('is-visible');
    }

    showUi(duration) {
      const r = this.el.root;
      r.classList.add('ui-visible');
      r.classList.remove('ui-hidden');
      clearTimeout(this.uiTimer);
      if (this.hoverBar || this.helpOpen) return;
      this.uiTimer = setTimeout(() => this.hideUi(), duration || UI_IDLE_MS);
    }

    hideUi() {
      if (this.hoverBar || this.helpOpen || this.scrubbing) return;
      this.el.root.classList.remove('ui-visible');
      this.el.root.classList.add('ui-hidden');
    }

    toggleUi() {
      if (this.el.root.classList.contains('ui-hidden')) this.showUi();
      else { clearTimeout(this.uiTimer); this.hideUi(); }
    }

    flash(icon, text) {
      const f = this.el.flash;
      f.innerHTML = `${icon}<span>${escapeHtml(text)}</span>`;
      f.classList.add('is-visible');
      clearTimeout(this.flashTimer);
      this.flashTimer = setTimeout(() => f.classList.remove('is-visible'), 1100);
    }

    toggleFullscreen() {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else this.host.requestFullscreen().catch(() => this.flash(ICONS.expand, T('fullscreenUnavailable')));
    }

    toggleZoom(x, y) {
      this.zoomed = !this.zoomed;
      if (this.zoomed) {
        this.panZoom(x, y);
        this.hideUi();
      }
      this.el.root.classList.toggle('is-zoomed', this.zoomed);
    }

    panZoom(x, y) {
      // L'origine suit la souris : on explore la page en bougeant simplement le curseur.
      const fx = clamp(x / this.vw, 0, 1) * 100;
      const fy = clamp(y / this.vh, 0, 1) * 100;
      this.el.zoom.style.transformOrigin = `${fx}% ${fy}%`;
    }

    toggleHelp(force) {
      const open = force == null ? !this.helpOpen : force;
      this.helpOpen = open;
      if (open) {
        const rtl = this.settings.direction === 'rtl';
        const k = (key, ...keys) => `<div class="mr-key"><span>${escapeHtml(T(key))}</span><span>${keys.map((x) => `<kbd>${escapeHtml(x)}</kbd>`).join('')}</span></div>`;
        this.el.help.innerHTML = `
          <div class="mr-help-card mr-glass" role="dialog" aria-label="${escapeHtml(T('keyboardShortcuts'))}">
            <h2>${escapeHtml(T('shortcuts'))}</h2>
            <p class="mr-help-sub">${escapeHtml(T(rtl ? 'helpRtl' : 'helpLtr'))}</p>
            <div class="mr-keys">
              ${k('nextPage', rtl ? '←' : '→', T('keySpace'))}
              ${k('prevPage', rtl ? '→' : '←', '⇧ ' + T('keySpace'))}
              ${k('startEnd', '↖', '↘')}
              ${k('chapterNextPrev', 'N', 'P')}
              ${k('modeCycle', 'D')}
              ${k('shiftPairs', 'O')}
              ${k('readingDirection', 'S')}
              ${k('animation', 'A')}
              ${k('themeToggle', 'M')}
              ${k('zoomFollows', 'Z')}
              ${k('fullscreen', 'F')}
              ${k('close', T('keyEsc'))}
            </div>
            <div class="mr-help-foot">${escapeHtml(T(rtl ? 'helpFootRtl' : 'helpFootLtr'))}</div>
          </div>`;
        this.showUi();
      }
      this.el.help.classList.toggle('is-visible', open);
    }
  }

  root.MRReader = Reader;
})(typeof self !== 'undefined' ? self : this);
