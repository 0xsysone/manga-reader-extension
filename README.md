<div align="center">

<img src="icons/icon128.png" width="96" height="96" alt="Manga Reader Extension logo">

# Manga Reader Extension

**Read manga like a real book, right in your browser.**
Full-page fit, double-page spreads, right-to-left reading and a page that actually turns.

[![GitHub stars](https://img.shields.io/github/stars/0xsysone/manga-reader-extension?style=flat&color=e5482d&logo=github)](https://github.com/0xsysone/manga-reader-extension/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/0xsysone/manga-reader-extension?style=flat&color=e5482d&logo=github)](https://github.com/0xsysone/manga-reader-extension/network/members)
[![License: MIT](https://img.shields.io/badge/license-MIT-141414)](LICENSE)
[![CI](https://github.com/0xsysone/manga-reader-extension/actions/workflows/ci.yml/badge.svg)](https://github.com/0xsysone/manga-reader-extension/actions/workflows/ci.yml)
![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Built with WXT](https://img.shields.io/badge/built%20with-WXT-67D55E)

<img src="docs/media/demo.gif" width="800" alt="Pages turning in 3D around the spine, in right-to-left order">

<sub>Demo pages are original placeholder art made for this README.</sub>

</div>

---

## Why

Most manga sites show chapters as one long vertical strip. You scroll, lose your place, and never see a two-page spread the way the artist drew it.

**Manga Reader Extension** puts the pages you're already viewing into a proper reader:

- one page or a full spread, always fitted to the screen with no scrolling;
- read in the Japanese order, from right to left;
- turn the page with a single key.

## Features

|                                     |                                                                                                                                                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 📖 **Full-page fit**                | Every page fills the screen height. No scrolling, no cropping.                                                                                                                                       |
| 🪟 **Double-page spreads**          | Two pages side by side, like an open tankōbon. In _Auto_ mode spreads turn on when the window is wide enough. The cover stays alone, and landscape art (original double spreads) stays in one piece. |
| ⬅️ **Right-to-left by default**     | `←` moves forward and the first page of a spread sits on the right. Western order is one key away.                                                                                                   |
| 🎞️ **A page that actually turns**   | 3D page flip around the spine, with cast shadows and paper sheen. Prefer something calmer? Pick _Slide_ or _None_.                                                                                   |
| 🌙 **Dark & paper themes**          | Pure black for night reading, warm paper for daytime.                                                                                                                                                |
| ⌨️ **Keyboard-first**               | Arrows, space, Home/End and chapter jumps. Mouse wheel, click zones and touch swipes work too.                                                                                                       |
| ⏭️ **Chapter to chapter**           | Press once more at the last page to open the next chapter. The previous chapter opens on its last page.                                                                                              |
| 🔎 **Zoom that follows the cursor** | Read small text without leaving the spread.                                                                                                                                                          |
| 🧭 **Progress bar**                 | Follows your reading direction and previews pages on hover.                                                                                                                                          |
| 🌍 **7 languages**                  | The interface follows your browser language: English, Français, Español, Português (Brasil), Deutsch, Bahasa Indonesia and 日本語.                                                                   |
| 🔒 **Private by design**            | No account, no tracking, no analytics. Settings are stored by Chrome; the only network call is to the public MangaDex API when you read on mangadex.org.                                             |

<p align="center">
  <img src="docs/media/screenshot-dark.jpg" width="49%" alt="Double-page spread, dark theme">
  <img src="docs/media/screenshot-light.jpg" width="49%" alt="Double-page spread, paper theme">
</p>

## Install

### From source (available now)

Requires [Node.js](https://nodejs.org) 20.19 or later.

```bash
git clone https://github.com/0xsysone/manga-reader-extension.git
cd manga-reader-extension
npm ci
npm run build
```

1. Open `chrome://extensions` and switch on **Developer mode**.
2. Click **Load unpacked** and select `.output/chrome-mv3`.

Works in Chrome, Edge, Brave, Opera and other Chromium browsers. For Firefox, run `npm run build:firefox` and load `.output/firefox-mv3` from `about:debugging`.

### Chrome Web Store

Coming soon.

## Usage

1. Open a manga chapter on a site.
2. Click the **Manga Reader** icon, then **Enable** in the site card.
   Chrome asks for access to **that domain only**, and nothing else.
3. The reader opens right away, and on every later visit to that site.

`Esc` brings you back to the site. The floating **Read in book mode** button reopens the reader. **Disable** in the same card removes the script and gives the permission back to Chrome.

### Keyboard shortcuts

| Action                    | Keys                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| Next / previous page      | `←` / `→` in right-to-left (swapped in left-to-right), `Space` / `⇧ Space`, wheel, swipe |
| First / last page         | `Home` / `End`                                                                           |
| Next / previous chapter   | `N` / `P`, or press again at the end/start                                               |
| Single → double → auto    | `D`                                                                                      |
| Shift pairs (cover alone) | `O`                                                                                      |
| Reading direction         | `S`                                                                                      |
| Animation                 | `A`                                                                                      |
| Dark / paper              | `M`                                                                                      |
| Zoom                      | `Z` or double-click                                                                      |
| Fullscreen                | `F`                                                                                      |
| Help                      | `?`                                                                                      |
| Close                     | `Esc`                                                                                    |

## How it finds the pages

The reader never downloads, stores or re-hosts anything. It uses the images the site you opened already shows, and tries these in order:

1. **Dedicated adapters** for a few sites with unusual readers, plus the **MangaDex public API**.
2. **Known reader engines**: the WordPress _MangaReader_ theme (`ts_reader`), _Madara_, the _my Manga Reader_ CMS and other common chapter layouts. Lazy-loaded images (`data-src`, `srcset`…) are supported.
3. **Generic detection**: the largest group of large images in one container. Logos, banners, ads and webtoon strips are filtered out. When this method is used, the reader offers a button instead of opening on its own.

**Not supported, by design:**

- **DRM platforms.** Izneo draws its pages into a `<canvas>` from protected data, so there is no image to reuse. Google Play Books is DRM-protected too and isn't supported. The extension never tries to get around such protections.
- **Webtoons** (long vertical strips) aren't made for book mode.

## Under the hood

- **TypeScript (strict) + [WXT](https://wxt.dev)**: one code base builds the Chrome, Edge and Firefox packages. No remote code, no runtime dependency.
- **Shadow DOM** overlay, so the site's CSS and the reader never interfere. Dynamic text is always set with `textContent`, never `innerHTML`.
- **Per-site permissions** through `optional_host_permissions` and `scripting.registerContentScripts`, for the exact host only. The service worker is the single writer of the enabled-sites list and keeps sites, permissions and scripts consistent.
- **Site adapters**: every supported reader engine implements one `SiteAdapter` interface, tried in order by a registry, and is tested against saved HTML.
- **The page turn** uses pure CSS 3D (a two-faced leaf rotating around the spine) driven by the Web Animations API, with a queue so fast key presses never stutter.
- **Resource hygiene**: every listener, timer, observer and animation is released when the reader closes; preloading is bounded to the pages around you.
- **Accessible**: modal dialog with focus management, keyboard-operable progress slider, live announcements, and `prefers-reduced-motion` honoured by every animation.

```
src/
  entrypoints/       background service worker, runtime content script, popup
  domain/            pure logic: settings, spreads, layout, input mapping, chapters, hosts
  sites/             SiteAdapter registry, one adapter per reader engine, parsers
  reader/            the book: rendering, animations, page loading, input, view parts
  content/           chapter session, launcher button, messaging
  services/          storage (with migration), enabled sites, messages
  shared/types.ts    domain types shared by every layer
  locales/           interface text in 7 languages
tests/               Vitest unit and component tests (happy-dom)
```

## Development

```bash
npm run dev          # Chrome with hot reload
npm run dev:firefox  # same in Firefox
npm run check        # typecheck + lint + format check + tests (what CI runs)
npm run zip          # store-ready package in .output/
```

The code base is audited: see [docs/audit.md](docs/audit.md) for what the 2.0 rewrite fixed.

## Roadmap

- [x] Interface in 7 languages (en, fr, es, pt-BR, de, id, ja)
- [x] Firefox build
- [ ] Chrome Web Store, Edge Add-ons and Firefox Add-ons releases
- [ ] Resume where you left off across series
- [ ] Per-series settings

Ideas and pull requests are welcome. Open an issue first for anything big.

**New language?** Copy `src/locales/en.json` to `src/locales/<code>.json`, translate the values (keep `$1`, `$2`… placeholders), add the code to `tests/i18n/locales.test.ts`, then run `npm test`: it checks that every key and placeholder is there.

## Contributing

1. Fork the repo and create a branch.
2. Keep `src/domain` free of DOM and browser APIs. New logic comes with a test; a new site comes as a `SiteAdapter` with an HTML fixture.
3. Run `npm run check`, then open a pull request.

Found a site where pages aren't detected? Open an issue with the reader engine if you know it, but **no links to infringing content**.

## Disclaimer

This extension is a display tool. It hosts no content and links to none. It only rearranges images the site you're visiting has already shown you. Please support the creators and read through official sources whenever you can.

## License

[MIT](LICENSE)

French documentation: [docs/README.fr.md](docs/README.fr.md).

---

## Adoption

<div align="center">

[![Stars](https://img.shields.io/github/stars/0xsysone/manga-reader-extension?style=for-the-badge&color=e5482d&label=stars)](https://github.com/0xsysone/manga-reader-extension/stargazers)
[![Forks](https://img.shields.io/github/forks/0xsysone/manga-reader-extension?style=for-the-badge&color=141414&label=forks)](https://github.com/0xsysone/manga-reader-extension/network/members)
[![Watchers](https://img.shields.io/github/watchers/0xsysone/manga-reader-extension?style=for-the-badge&color=141414&label=watchers)](https://github.com/0xsysone/manga-reader-extension/watchers)
[![Contributors](https://img.shields.io/github/contributors/0xsysone/manga-reader-extension?style=for-the-badge&color=141414&label=contributors)](https://github.com/0xsysone/manga-reader-extension/graphs/contributors)
[![Open issues](https://img.shields.io/github/issues/0xsysone/manga-reader-extension?style=for-the-badge&color=141414&label=issues)](https://github.com/0xsysone/manga-reader-extension/issues)
[![Last commit](https://img.shields.io/github/last-commit/0xsysone/manga-reader-extension?style=for-the-badge&color=141414&label=last%20commit)](https://github.com/0xsysone/manga-reader-extension/commits)

<!-- After the Chrome Web Store release, replace EXTENSION_ID and uncomment:
[![Chrome Web Store users](https://img.shields.io/chrome-web-store/users/EXTENSION_ID?style=for-the-badge&color=4285F4&label=users)](https://chromewebstore.google.com/detail/EXTENSION_ID)
[![Chrome Web Store rating](https://img.shields.io/chrome-web-store/rating/EXTENSION_ID?style=for-the-badge&color=4285F4&label=rating)](https://chromewebstore.google.com/detail/EXTENSION_ID)
-->

### Star history

<a href="https://star-history.com/#0xsysone/manga-reader-extension&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=0xsysone/manga-reader-extension&type=Date&theme=dark">
    <img alt="Star history chart" src="https://api.star-history.com/svg?repos=0xsysone/manga-reader-extension&type=Date" width="700">
  </picture>
</a>

### Contributors

<a href="https://github.com/0xsysone/manga-reader-extension/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=0xsysone/manga-reader-extension" alt="Contributors">
</a>

If Manga Reader Extension makes your reading nicer, a ⭐ helps other readers find it.

</div>
