'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');

const P = (ratio) => ({ ratio });
const portrait = (n) => Array.from({ length: n }, () => P(0.64));
const pagesOf = (spreads) => spreads.map((s) => [s.kind, ...s.pages]);

test('normalizeSettings : défauts et valeurs invalides ignorées', () => {
  assert.deepEqual(C.normalizeSettings(null), C.DEFAULT_SETTINGS);
  const s = C.normalizeSettings({ mode: 'double', direction: 'zz', theme: 'light', autoOpen: false, firstPageAlone: 'x' });
  assert.equal(s.mode, 'double');
  assert.equal(s.direction, 'rtl');
  assert.equal(s.theme, 'light');
  assert.equal(s.autoOpen, false);
  assert.equal(s.firstPageAlone, true);
  assert.equal(s.animation, 'flip');
});

test('isWide : paysage strict uniquement', () => {
  assert.equal(C.isWide(P(1.4)), true);
  assert.equal(C.isWide(P(1.0)), false);
  assert.equal(C.isWide(P(0.64)), false);
  assert.equal(C.isWide(null), false);
});

test('parseTsReader : extrait la config, chaînes avec accolades comprises', () => {
  const html = 'foo; ts_reader.run({"a":"x}{\\"y","prevUrl":"https:\\/\\/s\\/65","sources":[{"source":"S1","images":["https:\\/\\/i\\/1.jpg"]}]});bar';
  const cfg = C.parseTsReader(html);
  assert.equal(cfg.a, 'x}{"y');
  assert.equal(cfg.prevUrl, 'https://s/65');
  assert.deepEqual(C.imagesFromTsReader(cfg), ['https://i/1.jpg']);
  assert.equal(C.parseTsReader('nothing here'), null);
  assert.equal(C.parseTsReader('ts_reader.run({"a":'), null);
  assert.equal(C.parseTsReader('ts_reader.run({bad json});'), null);
  assert.equal(C.parseTsReader(undefined), null);
});

test('imagesFromTsReader : source par défaut, filtre les URLs non http', () => {
  const cfg = {
    defaultSource: 'S2',
    sources: [
      { source: 'S1', images: ['https://a/1.jpg'] },
      { source: 'S2', images: ['https://b/1.jpg', 'javascript:alert(1)', 42, 'http://b/2.jpg'] },
    ],
  };
  assert.deepEqual(C.imagesFromTsReader(cfg), ['https://b/1.jpg', 'http://b/2.jpg']);
  assert.deepEqual(C.imagesFromTsReader({ sources: [{ source: 'S1', images: ['https://a/1.jpg'] }] }), ['https://a/1.jpg']);
  assert.deepEqual(C.imagesFromTsReader({ sources: [] }), []);
  assert.deepEqual(C.imagesFromTsReader(null), []);
  assert.deepEqual(C.imagesFromTsReader({ sources: [{ source: 'S1' }] }), []);
});

test('parseChapterTitle', () => {
  assert.deepEqual(C.parseChapterTitle('Sakamoto Days 66'), { title: 'Sakamoto Days', chapter: '66' });
  assert.deepEqual(C.parseChapterTitle('  One Piece -  Chapitre 1100.5 '), { title: 'One Piece', chapter: '1100.5' });
  assert.deepEqual(C.parseChapterTitle('Oneshot'), { title: 'Oneshot', chapter: '' });
});

test('buildSpreads : mode simple = une planche par page', () => {
  assert.deepEqual(pagesOf(C.buildSpreads(portrait(3), { double: false })), [['single', 0], ['single', 1], ['single', 2]]);
});

test('buildSpreads : double, couverture seule, nombre impair → dernière paire complète', () => {
  assert.deepEqual(pagesOf(C.buildSpreads(portrait(5), { double: true })), [
    ['lead', 0], ['pair', 1, 2], ['pair', 3, 4],
  ]);
});

test('buildSpreads : double, couverture seule, nombre pair → dernière page seule (trail)', () => {
  assert.deepEqual(pagesOf(C.buildSpreads(portrait(4), { double: true })), [
    ['lead', 0], ['pair', 1, 2], ['trail', 3],
  ]);
});

test('buildSpreads : sans couverture seule', () => {
  assert.deepEqual(pagesOf(C.buildSpreads(portrait(4), { double: true, firstPageAlone: false })), [
    ['pair', 0, 1], ['pair', 2, 3],
  ]);
});

test('buildSpreads : image large isolée, page orpheline avant elle en lead', () => {
  const pages = [P(0.64), P(0.64), P(1.3), P(0.64), P(0.64)];
  assert.deepEqual(pagesOf(C.buildSpreads(pages, { double: true })), [
    ['lead', 0], ['lead', 1], ['wide', 2], ['pair', 3, 4],
  ]);
});

test('buildSpreads : première page large jamais en couverture seule', () => {
  const pages = [P(1.3), P(0.64), P(0.64)];
  assert.deepEqual(pagesOf(C.buildSpreads(pages, { double: true })), [['wide', 0], ['pair', 1, 2]]);
  assert.deepEqual(C.buildSpreads([], { double: true }), []);
});

test('spreadIndexForPage', () => {
  const s = C.buildSpreads(portrait(5), { double: true });
  assert.equal(C.spreadIndexForPage(s, 0), 0);
  assert.equal(C.spreadIndexForPage(s, 2), 1);
  assert.equal(C.spreadIndexForPage(s, 3), 2);
  assert.equal(C.spreadIndexForPage(s, 99), 0);
});

test('spreadSides : japonais = première page à droite', () => {
  assert.deepEqual(C.spreadSides({ kind: 'pair', pages: [3, 4] }, 'rtl'), {
    left: { page: 4, part: 'full' }, right: { page: 3, part: 'full' },
  });
  assert.deepEqual(C.spreadSides({ kind: 'pair', pages: [3, 4] }, 'ltr'), {
    left: { page: 3, part: 'full' }, right: { page: 4, part: 'full' },
  });
  assert.deepEqual(C.spreadSides({ kind: 'wide', pages: [2] }, 'rtl'), {
    left: { page: 2, part: 'left' }, right: { page: 2, part: 'right' },
  });
  assert.deepEqual(C.spreadSides({ kind: 'lead', pages: [0] }, 'rtl'), { left: { page: 0, part: 'full' }, right: null });
  assert.deepEqual(C.spreadSides({ kind: 'lead', pages: [0] }, 'ltr'), { left: null, right: { page: 0, part: 'full' } });
  assert.deepEqual(C.spreadSides({ kind: 'trail', pages: [9] }, 'rtl'), { left: null, right: { page: 9, part: 'full' } });
  assert.deepEqual(C.spreadSides({ kind: 'trail', pages: [9] }, 'ltr'), { left: { page: 9, part: 'full' }, right: null });
  assert.deepEqual(C.spreadSides({ kind: '??', pages: [] }, 'rtl'), { left: null, right: null });
});

test('spreadShift centre une page seule', () => {
  assert.equal(C.spreadShift({ left: {}, right: null }), 0.5);
  assert.equal(C.spreadShift({ left: null, right: {} }), -0.5);
  assert.equal(C.spreadShift({ left: {}, right: {} }), 0);
  assert.equal(C.spreadShift({ left: null, right: null }), 0);
});

test('leafSide : en japonais on tourne la page de gauche pour avancer', () => {
  assert.equal(C.leafSide('rtl', true), 'left');
  assert.equal(C.leafSide('rtl', false), 'right');
  assert.equal(C.leafSide('ltr', true), 'right');
  assert.equal(C.leafSide('ltr', false), 'left');
});

test('referenceRatio : médiane des pages portrait', () => {
  assert.equal(C.referenceRatio([P(0.6), P(0.7), P(2), P(0.8)]), 0.7);
  assert.equal(C.referenceRatio([P(0.6), P(0.8)]), 0.7);
  assert.equal(C.referenceRatio([]), 0.7);
  assert.equal(C.referenceRatio([P(1.5), { ratio: 0 }]), 0.7);
});

test('resolveDouble', () => {
  assert.equal(C.resolveDouble('double', 100, 1000, 0.7), true);
  assert.equal(C.resolveDouble('single', 3000, 1000, 0.7), false);
  // 2 pages de 700px = 1400px ; seuil 92 % = 1288px
  assert.equal(C.resolveDouble('auto', 1288, 1000, 0.7), true);
  assert.equal(C.resolveDouble('auto', 1287, 1000, 0.7), false);
});

test('fitPage : ajusté à la hauteur, puis contraint en largeur', () => {
  assert.deepEqual(C.fitPage(2000, 1000, 0.7, 2, 0), { width: 700, height: 1000 });
  assert.deepEqual(C.fitPage(2000, 1020, 0.7, 2, 10), { width: 700, height: 1000 });
  assert.deepEqual(C.fitPage(1000, 1000, 0.7, 2, 0), { width: 500, height: 714 });
  assert.deepEqual(C.fitPage(700, 1000, 0.7, 1, 0), { width: 700, height: 1000 });
  assert.deepEqual(C.fitPage(699, 1000, 0.7, 1, 0), { width: 699, height: 999 });
});

test('keyToAction : flèches selon le sens de lecture', () => {
  const k = (key, extra) => ({ key, shiftKey: false, ...extra });
  assert.equal(C.keyToAction(k('ArrowLeft'), 'rtl'), 'next');
  assert.equal(C.keyToAction(k('ArrowRight'), 'rtl'), 'prev');
  assert.equal(C.keyToAction(k('ArrowLeft'), 'ltr'), 'prev');
  assert.equal(C.keyToAction(k('ArrowRight'), 'ltr'), 'next');
  assert.equal(C.keyToAction(k(' '), 'rtl'), 'next');
  assert.equal(C.keyToAction(k(' ', { shiftKey: true }), 'rtl'), 'prev');
  assert.equal(C.keyToAction(k('PageDown'), 'ltr'), 'next');
  assert.equal(C.keyToAction(k('ArrowDown'), 'rtl'), 'next');
  assert.equal(C.keyToAction(k('PageUp'), 'ltr'), 'prev');
  assert.equal(C.keyToAction(k('ArrowUp'), 'rtl'), 'prev');
  assert.equal(C.keyToAction(k('Home'), 'rtl'), 'first');
  assert.equal(C.keyToAction(k('End'), 'rtl'), 'last');
  assert.equal(C.keyToAction(k('Escape'), 'rtl'), 'escape');
  assert.equal(C.keyToAction(k('D'), 'rtl'), 'cycleMode');
  assert.equal(C.keyToAction(k('m'), 'rtl'), 'toggleTheme');
  assert.equal(C.keyToAction(k('s'), 'rtl'), 'toggleDirection');
  assert.equal(C.keyToAction(k('o'), 'rtl'), 'toggleOffset');
  assert.equal(C.keyToAction(k('a'), 'rtl'), 'cycleAnimation');
  assert.equal(C.keyToAction(k('f'), 'rtl'), 'fullscreen');
  assert.equal(C.keyToAction(k('z'), 'rtl'), 'zoom');
  assert.equal(C.keyToAction(k('n'), 'rtl'), 'nextChapter');
  assert.equal(C.keyToAction(k('p'), 'rtl'), 'prevChapter');
  assert.equal(C.keyToAction(k('?'), 'rtl'), 'help');
  assert.equal(C.keyToAction(k('x'), 'rtl'), null);
  assert.equal(C.keyToAction(k('ArrowLeft', { metaKey: true }), 'rtl'), null);
  assert.equal(C.keyToAction(k('f', { ctrlKey: true }), 'rtl'), null);
  assert.equal(C.keyToAction(k('f', { altKey: true }), 'rtl'), null);
});

test('zoneToAction : clic à gauche avance en japonais', () => {
  assert.equal(C.zoneToAction(0.1, 'rtl'), 'next');
  assert.equal(C.zoneToAction(0.9, 'rtl'), 'prev');
  assert.equal(C.zoneToAction(0.1, 'ltr'), 'prev');
  assert.equal(C.zoneToAction(0.9, 'ltr'), 'next');
  assert.equal(C.zoneToAction(0.5, 'rtl'), 'toggleUi');
  assert.equal(C.zoneToAction(0.38, 'rtl'), 'toggleUi');
  assert.equal(C.zoneToAction(0.62, 'rtl'), 'toggleUi');
});

test('swipeToAction : tirer vers la droite avance en japonais', () => {
  assert.equal(C.swipeToAction(120, 5, 'rtl'), 'next');
  assert.equal(C.swipeToAction(-120, 5, 'rtl'), 'prev');
  assert.equal(C.swipeToAction(120, 5, 'ltr'), 'prev');
  assert.equal(C.swipeToAction(-120, 5, 'ltr'), 'next');
  assert.equal(C.swipeToAction(39, 0, 'rtl'), null);
  assert.equal(C.swipeToAction(40, 0, 'rtl'), 'next');
  assert.equal(C.swipeToAction(100, 90, 'rtl'), null);
});

test('cycle et spreadLabel', () => {
  assert.equal(C.cycle(C.MODES, 'auto'), 'double');
  assert.equal(C.cycle(C.MODES, 'single'), 'auto');
  assert.equal(C.cycle(C.ANIMATIONS, 'none'), 'flip');
  assert.equal(C.spreadLabel({ pages: [4, 3] }, 19), '4–5 / 19');
  assert.equal(C.spreadLabel({ pages: [0] }, 19), '1 / 19');
  assert.equal(C.spreadLabel(undefined, 19), '0 / 19');
});

test('défauts : ouverture auto activée, sens japonais, double page auto', () => {
  assert.equal(C.DEFAULT_SETTINGS.autoOpen, true);
  assert.equal(C.DEFAULT_SETTINGS.direction, 'rtl');
  assert.equal(C.DEFAULT_SETTINGS.mode, 'auto');
  assert.equal(C.DEFAULT_SETTINGS.theme, 'dark');
});

test('parseTsReader : appel en tout début de texte, sans objet', () => {
  assert.deepEqual(C.parseTsReader('ts_reader.run({"a":1});'), { a: 1 });
  assert.equal(C.parseTsReader('ts_reader.run(foo);'), null);
});

test('imagesFromTsReader : config sans sources', () => {
  assert.deepEqual(C.imagesFromTsReader({}), []);
  assert.deepEqual(C.imagesFromTsReader({ sources: 'x' }), []);
});

test('parseChapterTitle : titre purement numérique conservé', () => {
  assert.deepEqual(C.parseChapterTitle('66'), { title: '66', chapter: '' });
});

test('buildSpreads : chapitre d’une seule page en double', () => {
  assert.deepEqual(pagesOf(C.buildSpreads(portrait(1), { double: true })), [['lead', 0]]);
});

test('referenceRatio : médiane sur des ratios non triés et différents du défaut', () => {
  assert.equal(C.referenceRatio([P(0.64), P(0.6), P(0.62)]), 0.62);
  assert.equal(C.referenceRatio([P(0.9), P(0.5), P(0.6)]), 0.6);
  assert.equal(C.referenceRatio([P(0.66), P(0.5), P(0.58), P(0.6)]), 0.59);
});

test('resolveDouble : ratio inconnu → 0.7', () => {
  assert.equal(C.resolveDouble('auto', 1288, 1000, 0), true);
  assert.equal(C.resolveDouble('auto', 1287, 1000, 0), false);
});

test('fitPage : marge par défaut nulle, marge comptée des deux côtés', () => {
  assert.deepEqual(C.fitPage(2000, 1000, 0.7, 2), { width: 700, height: 1000 });
  assert.deepEqual(C.fitPage(1020, 2000, 0.7, 2, 10), { width: 500, height: 714 });
});

test('parseTsReader : un objet JSON sans appel ts_reader est ignoré', () => {
  assert.equal(C.parseTsReader('var x = {"a":1};'), null);
});

test('swipeToAction : geste pile à la limite diagonale accepté', () => {
  assert.equal(C.swipeToAction(130, 100, 'rtl'), 'next');
  assert.equal(C.swipeToAction(129, 100, 'rtl'), null);
});

/* ---------------------------------------------------------------- multi-sites */

test('siteHost : normalise le domaine, refuse ce qui n’en est pas un', () => {
  assert.equal(C.siteHost('www.Example.com'), 'example.com');
  assert.equal(C.siteHost('scans.example.co.uk.'), 'scans.example.co.uk');
  assert.equal(C.siteHost('localhost'), null);
  assert.equal(C.siteHost(''), null);
  assert.equal(C.siteHost('exa mple.com'), null);
  assert.equal(C.siteHost(undefined), null);
});

test('sitePattern : domaine + sous-domaines, IP exacte', () => {
  assert.equal(C.sitePattern('www.mangasite.net'), '*://*.mangasite.net/*');
  assert.equal(C.sitePattern('192.168.1.10'), '*://192.168.1.10/*');
  assert.equal(C.sitePattern('chrome'), null);
});

test('resolveImageSrc : attributs paresseux prioritaires, placeholders ignorés', () => {
  const base = 'https://site.io/manga/ch-1/';
  assert.equal(C.resolveImageSrc({ src: 'data:image/gif;base64,AAA', 'data-src': ' /img/01.jpg ' }, base), 'https://site.io/img/01.jpg');
  assert.equal(C.resolveImageSrc({ 'data-lazy-src': 'p2.webp', src: 'loading.gif' }, base), 'https://site.io/manga/ch-1/p2.webp');
  assert.equal(C.resolveImageSrc({ srcset: 'https://cdn.io/a.jpg 1x, https://cdn.io/a@2x.jpg 2x' }, base), 'https://cdn.io/a.jpg');
  assert.equal(C.resolveImageSrc({ 'data-src': 'https://site.io/wp/lazy-load.svg', src: 'https://cdn.io/3.png' }, base), 'https://cdn.io/3.png');
  assert.equal(C.resolveImageSrc({ src: 'javascript:alert(1)' }, base), null);
  assert.equal(C.resolveImageSrc({ src: 'http://[bad' }, base), null);
  assert.equal(C.resolveImageSrc({}, base), null);
  assert.equal(C.resolveImageSrc(null, base), null);
});

test('pickImageGroup : plus grand groupe de grandes images, doublons retirés', () => {
  const page = (src, group, extra) => ({ src, group, w: 800, ...extra });
  const cands = [
    page('logo.png', 0, { w: 200 }),
    page('a.jpg', 1), page('b.jpg', 1), page('a.jpg', 1), page('c.jpg', 1),
    page('x.jpg', 2), page('y.jpg', 2),
  ];
  assert.deepEqual(C.pickImageGroup(cands, 1440), ['a.jpg', 'b.jpg', 'c.jpg']);
});

test('pickImageGroup : couvertures, bannières et webtoons exclus ; moins de 3 pages → rien', () => {
  const covers = ['1', '2', '3', '4'].map((s) => ({ src: s, group: 1, w: 180, natW: 600, natH: 900 }));
  assert.deepEqual(C.pickImageGroup(covers, 1440), []);
  const banners = ['1', '2', '3'].map((s) => ({ src: s, group: 1, w: 728, natW: 728, natH: 90 }));
  assert.deepEqual(C.pickImageGroup(banners, 1440), []);
  const strips = ['1', '2', '3'].map((s) => ({ src: s, group: 1, w: 800, natW: 800, natH: 8000 }));
  assert.deepEqual(C.pickImageGroup(strips, 1440), []);
  const two = ['1', '2'].map((s) => ({ src: s, group: 1, w: 800 }));
  assert.deepEqual(C.pickImageGroup(two, 1440), []);
  // Pas encore affichées : taille naturelle ou attribut ; double page paysage acceptée.
  const lazy = [{ src: 'p1', group: 3, w: 0, attrW: 900 }, { src: 'p2', group: 3, w: 0, natW: 1600, natH: 1100 }, { src: 'p3', group: 3, w: 0, natW: 800, natH: 1200 }];
  assert.deepEqual(C.pickImageGroup(lazy, 1440), ['p1', 'p2', 'p3']);
  // Seuil : 40 % du viewport, plafonné à 480 px.
  assert.deepEqual(C.pickImageGroup(['1', '2', '3'].map((s) => ({ src: s, group: 1, w: 400 })), 1000), ['1', '2', '3']);
  assert.deepEqual(C.pickImageGroup(['1', '2', '3'].map((s) => ({ src: s, group: 1, w: 399 })), 1000), []);
  assert.deepEqual(C.pickImageGroup(['1', '2', '3'].map((s) => ({ src: s, group: 1, w: 480 })), 3000), ['1', '2', '3']);
});

test('pickNavLinks : classe > rel > texte, ancres et autres domaines ignorés', () => {
  const here = 'https://site.io/manga/ch-10/';
  const links = [
    { href: '#/next/', text: 'Suivant', className: 'ch-next-btn' },
    { href: 'https://other.io/ch-11', text: 'Next', className: 'next' },
    { href: '/manga/ch-11/', text: 'Chapitre suivant' },
    { href: '/manga/ch-12/', text: 'whatever', rel: 'next' },
    { href: '/manga/ch-9/', text: 'Précédent', className: 'btn prev_page' },
    { href: '/blog/', text: 'Lire la suite de cet article très long qui parle de next et d’autres choses' },
  ];
  assert.deepEqual(C.pickNavLinks(links, here), { next: 'https://site.io/manga/ch-12/', prev: 'https://site.io/manga/ch-9/' });
  assert.deepEqual(C.pickNavLinks([{ href: '/manga/ch-11/', text: 'Next ›', className: 'nav-next' }], here), { next: 'https://site.io/manga/ch-11/', prev: null });
  assert.deepEqual(C.pickNavLinks([{ href: '/manga/ch-9/', text: 'previous', rel: 'prev' }], here), { next: null, prev: 'https://site.io/manga/ch-9/' });
  assert.deepEqual(C.pickNavLinks(links, 'not a url'), { next: null, prev: null });
  assert.deepEqual(C.pickNavLinks(null, here), { next: null, prev: null });
  // Un même lien ne peut pas être à la fois suivant et précédent.
  assert.deepEqual(C.pickNavLinks([{ href: '/x/', text: 'next / prev' }], here), { next: 'https://site.io/x/', prev: null });
});

test('pickImageGroup : limites exactes et cas dégradés', () => {
  const g = (extra) => ['1', '2', '3'].map((s) => ({ src: s, group: 1, w: 800, ...extra }));
  assert.deepEqual(C.pickImageGroup(g({ natW: 220, natH: 100 }), 1440), ['1', '2', '3']); // ratio 2.2 accepté
  assert.deepEqual(C.pickImageGroup(g({ natW: 250, natH: 1000 }), 1440), ['1', '2', '3']); // ratio 0.25 accepté
  assert.deepEqual(C.pickImageGroup(g({ natW: 800, natH: 0 }), 1440), ['1', '2', '3']); // hauteur inconnue
  // Sans largeur de viewport : 1280 → seuil 480.
  assert.deepEqual(C.pickImageGroup(['1', '2', '3'].map((s) => ({ src: s, group: 1, w: 480 }))), ['1', '2', '3']);
  assert.deepEqual(C.pickImageGroup(['1', '2', '3'].map((s) => ({ src: s, group: 1, w: 479 }))), []);
  // Candidats sans src ignorés.
  assert.deepEqual(C.pickImageGroup([...g(), { src: null, group: 1, w: 800 }, null], 1440), ['1', '2', '3']);
  // Égalité : le premier groupe rencontré (ordre du document) l'emporte.
  const tie = [...['a', 'b', 'c'].map((s) => ({ src: s, group: 1, w: 800 })), ...['x', 'y', 'z'].map((s) => ({ src: s, group: 2, w: 800 }))];
  assert.deepEqual(C.pickImageGroup(tie, 1440), ['a', 'b', 'c']);
});

test('pickNavLinks : texte seul, priorité de la classe sur rel, longueur max 40', () => {
  const here = 'https://site.io/manga/ch-10/';
  assert.deepEqual(C.pickNavLinks([{ href: '/manga/ch-11/', text: 'Chapitre suivant' }], here), { next: 'https://site.io/manga/ch-11/', prev: null });
  assert.deepEqual(C.pickNavLinks([
    { href: '/a/', text: 'x', rel: 'next' },
    { href: '/b/', text: 'y', className: 'next' },
  ], here).next, 'https://site.io/b/');
  const t40 = 'suivant'.padEnd(40, '.');
  assert.equal(C.pickNavLinks([{ href: '/c/', text: t40 }], here).next, 'https://site.io/c/');
  assert.equal(C.pickNavLinks([{ href: '/c/', text: t40 + '.' }], here).next, null);
  assert.deepEqual(C.pickNavLinks([{ text: 'next' }, null, { href: '' }], here), { next: null, prev: null });
});

/* ---------------------------------------------------------------- Scan-Manga */

test('scanMangaUrl : remplace numéro et identifiant, garde slug et langue', () => {
  const here = 'https://www.scan-manga.com/lecture-en-ligne/Kaette-kudasai-Akutsu-san-Chapitre-174-FR_584001.html?x=1';
  assert.equal(C.scanMangaUrl(here, '575315', '173'), 'https://www.scan-manga.com/lecture-en-ligne/Kaette-kudasai-Akutsu-san-Chapitre-173-FR_575315.html');
  assert.equal(C.scanMangaUrl(here, 560518, '171.5'), 'https://www.scan-manga.com/lecture-en-ligne/Kaette-kudasai-Akutsu-san-Chapitre-171.5-FR_560518.html');
  assert.equal(C.scanMangaUrl(here, '535956', ' 158 1 '), 'https://www.scan-manga.com/lecture-en-ligne/Kaette-kudasai-Akutsu-san-Chapitre-158-1-FR_535956.html');
  assert.equal(C.scanMangaUrl(here, '42', null), 'https://www.scan-manga.com/lecture-en-ligne/Kaette-kudasai-Akutsu-san-Chapitre-42-FR_42.html');
  assert.equal(C.scanMangaUrl(here, '42', ''), 'https://www.scan-manga.com/lecture-en-ligne/Kaette-kudasai-Akutsu-san-Chapitre-42-FR_42.html');
  assert.equal(C.scanMangaUrl(here, 'abc', '1'), null);
  assert.equal(C.scanMangaUrl('https://www.scan-manga.com/?home', '1', '1'), null);
  assert.equal(C.scanMangaUrl('pas une url', '1', '1'), null);
});

test('isAdjacentChapter : le suivant a un numéro plus grand, le précédent plus petit', () => {
  assert.equal(C.isAdjacentChapter('174', '0', 'next'), false);
  assert.equal(C.isAdjacentChapter('174', '175', 'next'), true);
  assert.equal(C.isAdjacentChapter('174', '174', 'next'), false);
  assert.equal(C.isAdjacentChapter('174', '173', 'prev'), true);
  assert.equal(C.isAdjacentChapter('171,5', '171', 'prev'), true);
  assert.equal(C.isAdjacentChapter('174', '174', 'prev'), false);
  assert.equal(C.isAdjacentChapter('Extra', '3', 'next'), true);
  assert.equal(C.isAdjacentChapter('3', null, 'prev'), true);
});

/* ---------------------------------------------------------------- extraction de scripts */

test('extractJsonAfter : objets et tableaux, chaînes avec crochets, absences', () => {
  assert.deepEqual(C.extractJsonAfter('var pages = [{"a":"]"},{"b":2}];', 'var pages ='), [{ a: ']' }, { b: 2 }]);
  assert.deepEqual(C.extractJsonAfter('f({"x":{"y":[1]}})', 'f('), { x: { y: [1] } });
  assert.equal(C.extractJsonAfter('var pages = 3;', 'var pages ='), null);
  assert.equal(C.extractJsonAfter('var pages = [1,', 'var pages ='), null);
  assert.equal(C.extractJsonAfter('rien', 'var pages ='), null);
  assert.equal(C.extractJsonAfter('var pages = [nope]', 'var pages ='), null);
  assert.equal(C.extractJsonAfter(42, 'x'), null);
  assert.equal(C.parseTsReader('ts_reader.run([1,2]);'), null);
});

test('parseJsString : var/let/const, échappements, absence', () => {
  assert.equal(C.parseJsString('var next_chapter = "https://s.io/a/1" ;', 'next_chapter'), 'https://s.io/a/1');
  assert.equal(C.parseJsString('let prev_chapter="x\\"y";', 'prev_chapter'), 'x"y');
  assert.equal(C.parseJsString('const next_chapter = "";', 'next_chapter'), '');
  assert.equal(C.parseJsString('var other = "a";', 'next_chapter'), null);
  assert.equal(C.parseJsString(null, 'x'), null);
});

test('parseChapterTitle : format « Titre #123: sous-titre »', () => {
  assert.deepEqual(C.parseChapterTitle('One Piece  #1198: L’île où vivent les monstres'), { title: 'One Piece', chapter: '1198' });
  assert.deepEqual(C.parseChapterTitle('Kingdom #889.5'), { title: 'Kingdom', chapter: '889.5' });
});

test('parseMyMangaReader : pages, chapitres voisins, page courante', () => {
  const script = ' var title = document.title; var pages = [{"page_image":"01.webp","page_slug":1,"external":0},{"page_image":" https://cdn.io/x.jpg ","page_slug":2,"external":"1"},{"page_image":"","external":0},null]; var next_chapter = "" ; var prev_chapter = "https://www.scan-vf.net/one_piece/chapitre-1197/15" ; var current_page = 4;';
  assert.deepEqual(C.parseMyMangaReader(script), {
    pages: [{ image: '01.webp', external: false }, { image: 'https://cdn.io/x.jpg', external: true }],
    next: null,
    prev: 'https://www.scan-vf.net/one_piece/chapitre-1197/15',
    current: 4,
  });
  assert.equal(C.parseMyMangaReader('var pages = [];'), null);
  assert.equal(C.parseMyMangaReader('var other = 1;'), null);
  assert.equal(C.parseMyMangaReader('var pages = [{"page_image":"a.jpg"}]; var current_page = 0;').current, 1);
});

test('myMangaReaderUrls : relatives au dossier de la page affichée, externes conservées', () => {
  const pages = [{ image: '01.webp', external: false }, { image: 'https://cdn.io/x.jpg', external: true }, { image: 'javascript:alert(1)', external: true }];
  assert.deepEqual(C.myMangaReaderUrls(pages, ' https://www.scan-vf.net/uploads/manga/one_piece/chapters/chapitre-1198/01.webp '), [
    'https://www.scan-vf.net/uploads/manga/one_piece/chapters/chapitre-1198/01.webp',
    'https://cdn.io/x.jpg',
  ]);
  assert.deepEqual(C.myMangaReaderUrls(pages, ''), []);
  assert.deepEqual(C.myMangaReaderUrls(null, 'https://a.io/b/c.jpg'), []);
});

test('stripPageSuffix : retire le numéro de page, garde les identifiants', () => {
  assert.equal(C.stripPageSuffix('https://www.scan-vf.net/one_piece/chapitre-1197/15'), 'https://www.scan-vf.net/one_piece/chapitre-1197');
  assert.equal(C.stripPageSuffix('https://s.io/manga/chapitre-12/3/'), 'https://s.io/manga/chapitre-12');
  assert.equal(C.stripPageSuffix('https://s.io/manga/one-piece/1198'), 'https://s.io/manga/one-piece/1198'.replace('/1198', '')); // segment précédent alphabétique
  assert.equal(C.stripPageSuffix('https://s.io/chapter/1234/5678'), 'https://s.io/chapter/1234/5678');
  assert.equal(C.stripPageSuffix('https://s.io/manga/chapitre-12'), 'https://s.io/manga/chapitre-12');
  assert.equal(C.stripPageSuffix('pas une url'), null);
});

test('mangadexImageUrls : qualité normale ou économie de données', () => {
  const atHome = { baseUrl: 'https://node.mangadex.network', chapter: { hash: 'h1', data: ['1.png', '', 2, '2.png'], dataSaver: ['1.jpg'] } };
  assert.deepEqual(C.mangadexImageUrls(atHome), ['https://node.mangadex.network/data/h1/1.png', 'https://node.mangadex.network/data/h1/2.png']);
  assert.deepEqual(C.mangadexImageUrls(atHome, true), ['https://node.mangadex.network/data-saver/h1/1.jpg']);
  assert.deepEqual(C.mangadexImageUrls({ baseUrl: 'x', chapter: {} }), []);
  assert.deepEqual(C.mangadexImageUrls(null), []);
  assert.deepEqual(C.mangadexImageUrls({ chapter: { hash: 'h', data: [] } }), []);
});

test('mangadexNeighbours : tri numérique, versions alternatives, bornes', () => {
  const agg = { volumes: {
    2: { chapters: { 11: { chapter: '11', id: 'c11', others: [] }, '10.5': { chapter: '10.5', id: 'c105', others: ['c105b'] } } },
    1: { chapters: { 10: { chapter: '10', id: 'c10', others: ['c10b'] }, 9: { chapter: '9', id: 'c9' } } },
    none: { chapters: { none: { chapter: 'none', id: 'oneshot' } } },
  } };
  assert.deepEqual(C.mangadexNeighbours(agg, 'c10b'), { prev: { id: 'c9', chapter: '9' }, next: { id: 'c105', chapter: '10.5' } });
  assert.deepEqual(C.mangadexNeighbours(agg, 'c9'), { prev: null, next: { id: 'c10', chapter: '10' } });
  assert.deepEqual(C.mangadexNeighbours(agg, 'c11'), { prev: { id: 'c105', chapter: '10.5' }, next: { id: 'oneshot', chapter: 'none' } });
  assert.deepEqual(C.mangadexNeighbours(agg, 'inconnu'), { prev: null, next: null });
  assert.deepEqual(C.mangadexNeighbours(null, 'c9'), { prev: null, next: null });
});

test('mangadexNeighbours : chapitres indisponibles ignorés', () => {
  const agg = { volumes: { 1: { chapters: {
    1: { chapter: '1', id: 'a' }, 2: { chapter: '2', id: 'b', isUnavailable: true }, 3: { chapter: '3', id: 'c' },
  } } } };
  assert.deepEqual(C.mangadexNeighbours(agg, 'a'), { prev: null, next: { id: 'c', chapter: '3' } });
});
