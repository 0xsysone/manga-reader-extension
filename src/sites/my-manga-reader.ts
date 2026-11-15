import type { DetectContext, SiteAdapter } from '@/shared/types';
import { imageUrl, urlPage } from './images';
import { buildChapter, inlineScriptsContaining } from './meta';
import { sameSiteUrl } from './navigation';
import {
  MY_MANGA_READER_PAGES,
  myMangaReaderUrls,
  parseMyMangaReader,
  stripPageSuffix,
} from './parsers/my-manga-reader';

/** The page image the site currently shows: page file names are relative to its folder. */
const SHOWN_IMAGE_SELECTOR = 'img.scan-page, #ppp img, #all img';

/** A neighbour chapter URL without its page number, on this site only. */
function chapterUrl(pageUrl: string | null, context: DetectContext): string | null {
  return pageUrl ? sameSiteUrl(stripPageSuffix(pageUrl), context.url) : null;
}

/** my Manga Reader CMS (Scan-VF and clones): every page is listed in `var pages = [...]`. */
export const myMangaReaderAdapter: SiteAdapter = {
  id: 'my-manga-reader',
  matches: (context) => inlineScriptsContaining(context.document, MY_MANGA_READER_PAGES).length > 0,
  extract(context) {
    const shownImage = context.document.querySelector(SHOWN_IMAGE_SELECTOR);
    const shownImageUrl = shownImage ? imageUrl(shownImage, context.url.href) : null;
    for (const script of inlineScriptsContaining(context.document, MY_MANGA_READER_PAGES)) {
      const parsed = parseMyMangaReader(script);
      const urls = parsed ? myMangaReaderUrls(parsed.pages, shownImageUrl) : [];
      if (!parsed || urls.length === 0) continue;
      return buildChapter(context, {
        pages: urls.map((url) => urlPage(url)),
        startPage: parsed.currentPage - 1,
        prevUrl: chapterUrl(parsed.prevUrl, context),
        nextUrl: chapterUrl(parsed.nextUrl, context),
      });
    }
    return null;
  },
};
