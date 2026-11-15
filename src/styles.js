/* Manga Reader — styles du lecteur, injectés dans un Shadow DOM (isolés du site). */
(function (root) {
  'use strict';
  root.MRStyles = String.raw`
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }

.mr {
  --ease-out: cubic-bezier(.16, 1, .3, 1);
  --ease-io: cubic-bezier(.65, 0, .35, 1);
  --spring: cubic-bezier(.34, 1.4, .64, 1);
  --font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  --accent: #e5482d;
  --accent-ink: #fff;

  position: fixed; inset: 0;
  font-family: var(--font);
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
  user-select: none; -webkit-user-select: none;
  overflow: hidden;
  opacity: 0;
  transition: opacity .45s var(--ease-out);
  contain: strict;
}
.mr.is-open { opacity: 1; }

.mr[data-theme="dark"] {
  --bg: #08080a;
  --bg-glow: rgba(255, 255, 255, .045);
  --ink: #f3f1ed;
  --muted: rgba(243, 241, 237, .52);
  --faint: rgba(243, 241, 237, .14);
  --glass: rgba(20, 20, 24, .66);
  --glass-hover: rgba(255, 255, 255, .08);
  --glass-border: rgba(255, 255, 255, .08);
  --paper: #18181b;
  --paper-shine: rgba(255, 255, 255, .05);
  --page-shadow: 0 1px 2px rgba(0, 0, 0, .5), 0 28px 70px -18px rgba(0, 0, 0, .85);
  --gutter: rgba(0, 0, 0, .34);
  --leaf-shade: rgba(0, 0, 0, 1);
  color-scheme: dark;
}
.mr[data-theme="light"] {
  --bg: #e9e5de;
  --bg-glow: rgba(255, 255, 255, .55);
  --ink: #1c1b19;
  --muted: rgba(28, 27, 25, .55);
  --faint: rgba(28, 27, 25, .14);
  --glass: rgba(255, 255, 255, .72);
  --glass-hover: rgba(0, 0, 0, .06);
  --glass-border: rgba(0, 0, 0, .07);
  --paper: #f6f3ee;
  --paper-shine: rgba(255, 255, 255, .7);
  --page-shadow: 0 1px 2px rgba(60, 45, 30, .16), 0 26px 60px -20px rgba(60, 45, 30, .45);
  --gutter: rgba(60, 45, 30, .22);
  --leaf-shade: rgba(40, 30, 20, 1);
  color-scheme: light;
}

.mr-bg {
  position: absolute; inset: 0;
  background:
    radial-gradient(ellipse 70% 60% at 50% 45%, var(--bg-glow), transparent 70%),
    var(--bg);
  transition: background-color .5s var(--ease-out);
}
.mr-grain {
  position: absolute; inset: -50%;
  opacity: .035; pointer-events: none;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
}

/* ---------- Scène & livre ---------- */
.mr-stage {
  position: absolute; inset: 0;
  perspective: 2600px;
  perspective-origin: 50% 50%;
  transition: transform .9s var(--ease-out), filter .9s var(--ease-out), opacity .6s var(--ease-out);
}
.mr:not(.is-ready) .mr-stage { transform: scale(.965) translateY(10px); filter: blur(6px); opacity: 0; }
.mr.is-zoomed .mr-stage { cursor: zoom-out; }

.mr-zoom {
  position: absolute; inset: 0;
  transform-style: preserve-3d;
  transition: transform .55s var(--ease-out);
  will-change: transform;
}
.mr.is-zoomed .mr-zoom { transform: scale(2.1); }

.mr-book {
  position: absolute; left: 50%; top: 50%;
  transform-style: preserve-3d;
}
.mr-slot { position: absolute; top: 0; height: 100%; transform-style: preserve-3d; }

.mr-page {
  position: absolute; inset: 0;
  background: var(--paper);
  box-shadow: var(--page-shadow);
  overflow: hidden;
  transition: background-color .5s var(--ease-out);
}
.mr-page.is-loading::before {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(100deg, transparent 30%, var(--paper-shine) 50%, transparent 70%);
  background-size: 250% 100%;
  animation: mr-shimmer 1.4s linear infinite;
}
@keyframes mr-shimmer { from { background-position: 120% 0; } to { background-position: -120% 0; } }

.mr-page img, .mr-page canvas {
  position: absolute; inset: 0; width: 100%; height: 100%;
  object-fit: contain;
  opacity: 0;
  transition: opacity .35s var(--ease-out);
  -webkit-user-drag: none; user-select: none; pointer-events: none;
}
.mr-page img.is-ready, .mr-page canvas.is-ready { opacity: 1; }
.mr-half { position: absolute; top: 0; height: 100%; width: 200%; }
.mr-half img, .mr-half canvas { position: absolute; inset: 0; width: 100%; height: 100%; }

/* Reliure : ombre douce côté dos du livre */
.mr-page.has-gutter::after {
  content: ""; position: absolute; top: 0; bottom: 0; width: 7%;
  pointer-events: none;
}
.mr-page.gutter-right::after { right: 0; background: linear-gradient(to left, var(--gutter), transparent); }
.mr-page.gutter-left::after { left: 0; background: linear-gradient(to right, var(--gutter), transparent); }
.mr-page.is-wide-half::after { width: 3.5%; opacity: .55; }

/* Ombres animées pendant le tournage */
.mr-cast {
  position: absolute; inset: 0; pointer-events: none; opacity: 0;
  z-index: 2;
}
.mr-cast.from-left { background: linear-gradient(to right, var(--leaf-shade) 0%, transparent 85%); }
.mr-cast.from-right { background: linear-gradient(to left, var(--leaf-shade) 0%, transparent 85%); }

/* Feuille qui pivote */
.mr-leaf {
  position: absolute; top: 0; height: 100%;
  transform-style: preserve-3d;
  z-index: 10;
  will-change: transform;
}
.mr-face {
  position: absolute; inset: 0;
  backface-visibility: hidden; -webkit-backface-visibility: hidden;
  transform-style: preserve-3d;
}
.mr-face.back { transform: rotateY(180deg); }
.mr-face .mr-page { box-shadow: 0 0 0 rgba(0,0,0,0); }
.mr-face.is-solid .mr-page { box-shadow: var(--page-shadow); }
.mr-shade { position: absolute; inset: 0; pointer-events: none; opacity: 0; z-index: 3; }
.mr-shade.spine-right { background: linear-gradient(to left, var(--leaf-shade), rgba(0,0,0,.25) 60%, transparent); }
.mr-shade.spine-left { background: linear-gradient(to right, var(--leaf-shade), rgba(0,0,0,.25) 60%, transparent); }
.mr-sheen { position: absolute; inset: 0; pointer-events: none; opacity: 0; z-index: 4; mix-blend-mode: soft-light; }
.mr-sheen.spine-right { background: linear-gradient(to right, transparent 10%, rgba(255,255,255,.9) 55%, transparent 90%); }
.mr-sheen.spine-left { background: linear-gradient(to left, transparent 10%, rgba(255,255,255,.9) 55%, transparent 90%); }

/* ---------- Zones de clic ---------- */
.mr-zone {
  position: absolute; top: 72px; bottom: 84px; width: 38%;
  display: flex; align-items: center;
  cursor: pointer; z-index: 20;
  -webkit-tap-highlight-color: transparent;
}
.mr-zone.left { left: 0; justify-content: flex-start; padding-left: 22px; }
.mr-zone.right { right: 0; justify-content: flex-end; padding-right: 22px; }
.mr-zone.is-disabled { cursor: default; }
.mr-hint {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  opacity: 0; transform: translateX(var(--hint-x, 0)) scale(.9);
  transition: opacity .35s var(--ease-out), transform .45s var(--ease-out);
  color: var(--ink);
}
.mr-zone.left .mr-hint { --hint-x: -8px; }
.mr-zone.right .mr-hint { --hint-x: 8px; }
.mr-hint-btn {
  width: 52px; height: 52px; border-radius: 50%;
  display: grid; place-items: center;
  background: var(--glass); border: 1px solid var(--glass-border);
  backdrop-filter: blur(18px) saturate(1.4); -webkit-backdrop-filter: blur(18px) saturate(1.4);
  box-shadow: 0 10px 30px -10px rgba(0,0,0,.5);
}
.mr-hint-label { font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.mr.ui-visible .mr-zone:not(.is-disabled):hover .mr-hint,
.mr-zone:not(.is-disabled):hover .mr-hint { opacity: 1; transform: translateX(0) scale(1); }
.mr-zone:active .mr-hint-btn { transform: scale(.94); }
.mr.is-zoomed .mr-zone { pointer-events: none; }
.mr.ui-hidden { cursor: none; }
.mr.ui-hidden .mr-zone { cursor: none; }
.mr.ui-hidden .mr-hint { opacity: 0 !important; }

/* ---------- Barres d'interface ---------- */
.mr-top, .mr-bottom {
  position: absolute; left: 0; right: 0; z-index: 30;
  display: flex; align-items: center;
  pointer-events: none;
  transition: opacity .45s var(--ease-out), transform .55s var(--ease-out);
}
.mr-top { top: 0; padding: 16px 18px; justify-content: space-between; gap: 16px; }
.mr-bottom { bottom: 0; padding: 14px 18px 18px; justify-content: center; }
.mr-top > *, .mr-bottom > * { pointer-events: auto; }
.mr.ui-hidden .mr-top { opacity: 0; transform: translateY(-14px); }
.mr.ui-hidden .mr-bottom { opacity: 0; transform: translateY(14px); }
.mr.ui-hidden .mr-top > *, .mr.ui-hidden .mr-bottom > * { pointer-events: none; }

.mr-glass {
  background: var(--glass);
  border: 1px solid var(--glass-border);
  backdrop-filter: blur(22px) saturate(1.5); -webkit-backdrop-filter: blur(22px) saturate(1.5);
  box-shadow: 0 12px 36px -14px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.05);
}

.mr-title {
  display: flex; align-items: center; gap: 12px;
  padding: 7px 16px 7px 8px; border-radius: 999px;
  min-width: 0; max-width: 46vw;
}
.mr-seal {
  flex: none; width: 30px; height: 30px; border-radius: 9px;
  display: grid; place-items: center;
  background: var(--accent); color: var(--accent-ink);
  font: 600 16px/1 "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif;
  box-shadow: 0 6px 16px -6px rgba(229, 72, 45, .7), inset 0 0 0 1px rgba(255,255,255,.15);
}
.mr-title-text { display: flex; flex-direction: column; min-width: 0; line-height: 1.15; }
.mr-title-name { font-size: 13.5px; font-weight: 650; letter-spacing: -.005em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mr-title-ch { font-size: 11.5px; font-weight: 500; color: var(--muted); letter-spacing: .02em; }

.mr-tools { display: flex; align-items: center; gap: 2px; padding: 5px; border-radius: 999px; }
.mr-sep { width: 1px; height: 20px; background: var(--faint); margin: 0 5px; }

.mr-btn {
  appearance: none; border: 0; margin: 0; font: inherit; color: inherit;
  height: 34px; min-width: 34px; padding: 0 9px; border-radius: 999px;
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  background: transparent; cursor: pointer;
  font-size: 12.5px; font-weight: 600; letter-spacing: .01em;
  transition: background-color .2s ease, transform .35s var(--spring), color .2s ease;
  position: relative;
}
.mr-btn:hover { background: var(--glass-hover); }
.mr-btn:active { transform: scale(.92); }
.mr-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.mr-btn svg { width: 18px; height: 18px; flex: none; }
.mr-btn[disabled] { opacity: .35; cursor: default; }
.mr-btn.is-accent { color: var(--accent); }

.mr-seg { position: relative; display: inline-flex; padding: 0; border-radius: 999px; }
.mr-seg .mr-btn { z-index: 1; color: var(--muted); }
.mr-seg .mr-btn.is-active { color: var(--ink); }
.mr-seg .mr-btn:hover { background: transparent; color: var(--ink); }
.mr-seg-pill {
  position: absolute; top: 0; height: 34px; border-radius: 999px;
  background: var(--glass-hover);
  box-shadow: inset 0 0 0 1px var(--glass-border);
  transition: transform .5s var(--spring), width .5s var(--spring);
}

.mr-tip {
  position: absolute; top: calc(100% + 10px); left: 50%;
  transform: translate(-50%, -4px);
  padding: 6px 9px; border-radius: 8px; white-space: nowrap;
  font-size: 11.5px; font-weight: 550; letter-spacing: 0;
  background: var(--glass); border: 1px solid var(--glass-border);
  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  color: var(--ink);
  opacity: 0; pointer-events: none;
  transition: opacity .18s ease, transform .3s var(--ease-out);
}
.mr-tip kbd { font: 600 10.5px/1 var(--font); padding: 2px 5px; margin-left: 6px; border-radius: 4px; background: var(--faint); }
.mr-btn:hover .mr-tip { opacity: 1; transform: translate(-50%, 0); transition-delay: .35s; }
.mr-tools .mr-btn:last-child .mr-tip { left: auto; right: 0; transform: translate(0, -4px); }
.mr-tools .mr-btn:last-child:hover .mr-tip { transform: translate(0, 0); }

/* Bas : compteur, progression, chapitres */
.mr-dock { display: flex; align-items: center; gap: 6px; padding: 6px; border-radius: 999px; max-width: calc(100vw - 36px); }
.mr-dock[data-dir="rtl"] { flex-direction: row-reverse; }
.mr-ch-btn { color: var(--muted); padding: 0 12px; }
.mr-ch-btn:hover { color: var(--ink); }
.mr-ch-btn .mr-ch-label { white-space: nowrap; }

.mr-counter {
  display: inline-flex; align-items: baseline; gap: 5px;
  padding: 0 12px; min-width: 92px; justify-content: center;
  font-variant-numeric: tabular-nums;
}
.mr-counter-now { font-size: 14px; font-weight: 700; letter-spacing: -.01em; display: inline-block; }
.mr-counter-total { font-size: 12px; font-weight: 500; color: var(--muted); }
.mr-counter-now.bump { animation: mr-bump .45s var(--ease-out); }
@keyframes mr-bump { 0% { transform: translateY(var(--bump, 6px)); opacity: 0; } 100% { transform: none; opacity: 1; } }

.mr-scrub {
  position: relative; width: clamp(140px, 30vw, 420px); height: 34px;
  display: flex; align-items: center; cursor: pointer;
  touch-action: none;
}
.mr-track {
  position: relative; width: 100%; height: 4px; border-radius: 4px;
  background: var(--faint);
  transition: height .3s var(--ease-out);
}
.mr-scrub:hover .mr-track { height: 6px; }
.mr-fill {
  position: absolute; top: 0; bottom: 0; border-radius: inherit;
  background: linear-gradient(90deg, var(--accent), #ff7a52);
  transition: width .55s var(--ease-out), left .55s var(--ease-out), right .55s var(--ease-out);
}
.mr-dock[data-dir="rtl"] .mr-fill { right: 0; background: linear-gradient(270deg, var(--accent), #ff7a52); }
.mr-dock[data-dir="ltr"] .mr-fill { left: 0; }
.mr-ticks { position: absolute; inset: 0; display: flex; justify-content: space-between; align-items: center; pointer-events: none; }
.mr-dock[data-dir="rtl"] .mr-ticks { flex-direction: row-reverse; }
.mr-tick { width: 2px; height: 2px; border-radius: 2px; background: var(--muted); opacity: 0; transition: opacity .3s; }
.mr-scrub:hover .mr-tick { opacity: .5; }
.mr-knob {
  position: absolute; top: 50%; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%;
  background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.35), 0 0 0 4px rgba(229,72,45,.25);
  transform: scale(0); transition: transform .35s var(--spring), left .55s var(--ease-out);
}
.mr-scrub:hover .mr-knob, .mr-scrub.is-dragging .mr-knob { transform: scale(1); }

.mr-preview {
  position: absolute; bottom: calc(100% + 14px); left: 0;
  width: 108px; padding: 5px; border-radius: 12px;
  transform: translateX(-50%) translateY(6px) scale(.96);
  opacity: 0; pointer-events: none;
  transition: opacity .2s ease, transform .3s var(--ease-out);
}
.mr-preview.is-visible { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
.mr-preview-img { width: 100%; aspect-ratio: .68; border-radius: 8px; background: var(--paper) center / contain no-repeat; }
.mr-preview-label { text-align: center; font-size: 11.5px; font-weight: 650; padding: 5px 0 1px; font-variant-numeric: tabular-nums; }

/* ---------- Toast fin de chapitre ---------- */
.mr-toast {
  position: absolute; left: 50%; bottom: 92px; z-index: 40;
  display: flex; align-items: center; gap: 14px;
  padding: 10px 10px 10px 18px; border-radius: 18px;
  transform: translate(-50%, 16px) scale(.97); opacity: 0; pointer-events: none;
  transition: opacity .3s var(--ease-out), transform .5s var(--spring);
  max-width: calc(100vw - 32px);
}
.mr-toast.is-visible { transform: translate(-50%, 0) scale(1); opacity: 1; pointer-events: auto; }
.mr-toast-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.mr-toast-title { font-size: 13.5px; font-weight: 650; }
.mr-toast-sub { font-size: 12px; color: var(--muted); }
.mr-toast-sub kbd { font: 600 11px/1 var(--font); padding: 2px 6px; border-radius: 5px; background: var(--faint); color: var(--ink); }
.mr-cta {
  appearance: none; border: 0; font: inherit; cursor: pointer;
  height: 38px; padding: 0 16px; border-radius: 12px;
  background: var(--accent); color: var(--accent-ink);
  font-size: 13px; font-weight: 650; white-space: nowrap;
  display: inline-flex; align-items: center; gap: 8px;
  box-shadow: 0 8px 22px -8px rgba(229,72,45,.8);
  transition: transform .35s var(--spring), filter .2s;
}
.mr-cta:hover { filter: brightness(1.08); }
.mr-cta:active { transform: scale(.95); }
.mr-cta svg { width: 16px; height: 16px; }

/* Bulle d'état (mode, sens…) */
.mr-flash {
  position: absolute; left: 50%; top: 50%; z-index: 45;
  padding: 14px 20px; border-radius: 16px;
  display: flex; align-items: center; gap: 12px;
  font-size: 14px; font-weight: 650;
  transform: translate(-50%, -50%) scale(.9); opacity: 0; pointer-events: none;
  transition: opacity .25s ease, transform .45s var(--spring);
}
.mr-flash.is-visible { opacity: 1; transform: translate(-50%, -50%) scale(1); }
.mr-flash svg { width: 22px; height: 22px; color: var(--accent); }

/* ---------- Aide ---------- */
.mr-help {
  position: absolute; inset: 0; z-index: 50;
  display: grid; place-items: center;
  background: rgba(0,0,0,.35);
  opacity: 0; pointer-events: none;
  transition: opacity .3s var(--ease-out);
}
.mr-help.is-visible { opacity: 1; pointer-events: auto; }
.mr-help-card {
  width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 48px); overflow: auto;
  padding: 26px 26px 20px; border-radius: 24px;
  transform: translateY(14px) scale(.97);
  transition: transform .55s var(--spring);
}
.mr-help.is-visible .mr-help-card { transform: none; }
.mr-help h2 { margin: 0 0 4px; font-size: 18px; font-weight: 700; letter-spacing: -.01em; }
.mr-help p.mr-help-sub { margin: 0 0 18px; font-size: 12.5px; color: var(--muted); }
.mr-keys { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 22px; }
.mr-key { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--faint); font-size: 13px; }
.mr-key span:first-child { color: var(--muted); }
.mr-key kbd {
  font: 650 11.5px/1 var(--font); min-width: 24px; text-align: center;
  padding: 5px 7px; border-radius: 7px; margin-left: 4px;
  background: var(--glass-hover); border: 1px solid var(--glass-border);
  box-shadow: 0 2px 0 var(--faint);
}
.mr-help-foot { margin-top: 16px; font-size: 12px; color: var(--muted); text-align: center; }

/* ---------- Chargement du chapitre suivant ---------- */
.mr-loader {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: 34px; height: 34px; border-radius: 50%;
  border: 2.5px solid var(--faint); border-top-color: var(--accent);
  opacity: 0; transition: opacity .3s; pointer-events: none;
}
.mr-loader.is-visible { opacity: 1; animation: mr-spin .8s linear infinite; }
@keyframes mr-spin { to { transform: translate(-50%, -50%) rotate(360deg); } }

@media (max-width: 720px) {
  .mr-title { max-width: 52vw; }
  .mr-hide-sm { display: none !important; }
  .mr-scrub { width: 28vw; }
  .mr-keys { grid-template-columns: 1fr; }
  .mr-ch-btn .mr-ch-label { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .mr, .mr * { transition-duration: .01s !important; animation-duration: .01s !important; }
}
`;
})(typeof self !== 'undefined' ? self : this);
