# Code audit — version 1.5.0 (plain JavaScript)

November 2026. Two independent read-only reviews of the 1.5.0 code base, before the TypeScript + WXT rewrite (2.0.0). Each finding below is addressed in the rewrite.

## Architecture and code quality

| Area          | Finding                                                                                                                                                                   | Resolution in 2.0                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Structure     | `reader.js` was one 1,200-line class doing DOM, events, layout, three animation engines, preloading, toasts and settings. State lived in expando properties on DOM nodes. | Split into `reader/` modules (book, animations, page loader, input, view parts) with typed state.    |
| Modules       | Files shared code through globals (`MRCore`, `MRReader`, `YomuSites`…), with a hard-coded load order.                                                                     | ES modules bundled by WXT, explicit imports.                                                         |
| Site support  | Seven detection functions returned five different shapes.                                                                                                                 | One `SiteAdapter` interface and an ordered registry; adapters are tested against saved HTML.         |
| Naming        | French and English mixed; the old "Yomu" name survived in storage keys, element ids and messages.                                                                         | English everywhere; storage keys migrated once for existing users.                                   |
| Duplication   | Page normalisation, tick building, probe-then-relayout, image deduplication and settings storage were each written twice.                                                 | Single implementations.                                                                              |
| Constants     | Dozens of unnamed timings and thresholds.                                                                                                                                 | Named constants.                                                                                     |
| Accessibility | No dialog semantics or focus management, scrubber not keyboard-operable, no live regions, UI hid itself while focused, reduced motion only partly honoured.               | Dialog with focus management, ARIA slider, live regions, reduced motion honoured by every animation. |

## Correctness, security and performance

| #   | Finding                                                                                                                                           | Severity |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | Holding an arrow key went straight past the end-of-chapter warning into the next chapter.                                                         | High     |
| 2   | Chapters with unknown page sizes (MangaDex) requested every page at once: ~200 simultaneous downloads.                                            | High     |
| 3   | Preloading never stopped, stacked a new loop at every page turn, kept downloading after the reader closed, and never retried a failed page.       | High     |
| 4   | Switching chapter in place could mix the old and new chapter's state and crash on a shorter chapter; holding N on in-page sites skipped chapters. | Medium   |
| 5   | On single-page-app sites, a slow request for the previous URL could install the previous chapter.                                                 | Medium   |
| 6   | Scan-Manga live sync leaked an observer, a listener and a timer per detection, and kept clicking the site after a chapter change.                 | High     |
| 7   | Hovering the progress bar redrew or downloaded full-size images on every mouse move.                                                              | Medium   |
| 8   | Zoom panning did layout work on every mouse move.                                                                                                 | Low      |
| 9   | MangaDex API calls sent the user's cookies although the API is public.                                                                            | Medium   |
| 10  | Reading position keyed on the path only (wrong page restored on sites that keep one URL); stale auto-open flags.                                  | Low      |
| 11  | Enabling a site granted access to every subdomain, which on shared domains (`github.io`, `blogspot.com`) covers unrelated sites.                  | Medium   |

No injection flaw was found: site-controlled strings were escaped. The rewrite removes `innerHTML` for dynamic text entirely.
