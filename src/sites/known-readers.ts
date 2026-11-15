import type { SiteAdapter } from '@/shared/types';
import { MIN_CHAPTER_PAGES, pagesFromImages } from './images';
import { buildChapter } from './meta';
import { collectLinks, pickNavLinks } from './navigation';

/** Reading containers of the most common scan themes and readers, most reliable first. */
export const READER_SELECTORS: readonly string[] = [
  '#readerarea img', // WordPress "MangaReader" (Themesia)
  '.reading-content img', // WordPress "Madara"
  '.wp-manga-chapter-img', // Madara (variant)
  '.container-chapter-reader img', // Manganato and clones
  '#chapter-images img',
  '.chapter-images img',
  '.reader-area img',
  '.chapter-content img',
  '.chapter-container img',
  '#images img',
  '.page-chapter img',
  '.reading-detail img',
];

/** Known reading containers ({@link READER_SELECTORS}); neighbours come from the page's links. */
export const knownReadersAdapter: SiteAdapter = {
  id: 'known-readers',
  matches: (context) =>
    READER_SELECTORS.some((selector) => context.document.querySelector(selector) !== null),
  extract(context) {
    for (const selector of READER_SELECTORS) {
      const pages = pagesFromImages(context.document.querySelectorAll(selector), context.url.href);
      if (pages.length < MIN_CHAPTER_PAGES) continue;
      const links = pickNavLinks(collectLinks(context.document), context.url.href);
      return buildChapter(context, { pages, prevUrl: links.prev, nextUrl: links.next });
    }
    return null;
  },
};
