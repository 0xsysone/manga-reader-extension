# Chrome Web Store listing

Upload `dist/manga-reader-1.5.0.zip` (built from the files listed in the README). The name and short description come from `_locales/*/messages.json`, so each language gets its own.

## Store fields

- **Category:** Tools
- **Language:** English (default). Translations ship for fr, es, pt_BR, de, id, ja.
- **Screenshots (1280×800):** export `docs/media/screenshot-dark.jpg` and `screenshot-light.jpg` at 1280×800.
- **Small promo tile (440×280):** optional.
- **Homepage / support URL:** https://github.com/0xsysone/manga-reader-book-mode

## Detailed description

Read manga like a real book, right in your browser.

Most manga sites show a chapter as one long vertical strip. Book Mode puts the pages you're already viewing into a proper reader:

• Full-page fit: every page fills the screen, no scrolling, no cropping.
• Double-page spreads, like an open tankōbon. Auto mode switches on when the window is wide enough; the cover stays alone and wide art stays in one piece.
• Right-to-left reading by default, Western order one key away.
• A page that actually turns: 3D flip around the spine. Or pick Slide or None.
• Dark and paper themes.
• Keyboard-first: arrows, space, Home/End, chapter jumps. Wheel, click zones and swipes work too.
• Next and previous chapter in one key press.
• Zoom that follows the cursor.
• Interface in English, Français, Español, Português (Brasil), Deutsch, Bahasa Indonesia and 日本語.

How it works: open a chapter, click the extension icon, then Enable in the site card. Chrome asks for access to that domain only. The reader then opens on every chapter of that site. Disable gives the permission back.

Private by design: no account, no tracking, no analytics. The only network call is to the public MangaDex API when you read on mangadex.org.

Book Mode is a display tool. It hosts no content and links to none: it only rearranges images the site you're visiting already shows you. It does not work on DRM-protected readers. Please support the creators and read through official sources whenever you can.

Open source (MIT): https://github.com/0xsysone/manga-reader-book-mode

## Privacy tab

- **Single purpose:** Display the manga pages of the current site as a book (full page, double page, right-to-left).
- **Permission justifications:**
  - `storage`: save reading settings (mode, direction, theme, animation).
  - `scripting` and optional host permissions: run the reader only on sites the user enables, one domain at a time.
  - `activeTab`: read the current tab's address when the popup opens, to show the site card.
- **Remote code:** No.
- **Data collected:** None.
