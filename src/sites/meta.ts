import { parseChapterTitle } from '@/domain/chapter';
import { nonEmptyString } from '@/domain/guards';
import type { Chapter, DetectContext, InPageNavigation, Page } from '@/shared/types';
import { sameSiteUrl } from './navigation';

/** Chapter headings of common reader themes, most specific first. */
const HEADING_SELECTOR = 'h1.entry-title, .headpost h1, #chapter-heading, h1';
/** "All chapters" link of the WordPress MangaReader theme, which also names the series. */
const SERIES_LINK_SELECTOR = '.allc a[href], .headpost .allc a[href]';

/** What an adapter found; missing metadata is completed from the page. */
export interface DetectedChapter {
  pages: Page[];
  /** Defaults to `true`: only the generic heuristic is unsure. */
  confident?: boolean;
  startPage?: number;
  inPage?: InPageNavigation;
  title?: string | null;
  chapter?: string | null;
  prevUrl?: string | null;
  nextUrl?: string | null;
  prevLabel?: string | null;
  nextLabel?: string | null;
  seriesUrl?: string | null;
}

function headingText(document: Document): string {
  return nonEmptyString(document.querySelector(HEADING_SELECTOR)?.textContent.trim()) ?? document.title;
}

/**
 * Turns what an adapter found into a {@link Chapter}: title and chapter number default to the page
 * heading (or document title), the series to the theme's "all chapters" link. `null` without pages.
 */
export function buildChapter(context: DetectContext, found: DetectedChapter): Chapter | null {
  if (found.pages.length === 0) return null;
  const { document, url } = context;
  const parsed = parseChapterTitle(headingText(document));
  const seriesLink = document.querySelector(SERIES_LINK_SELECTOR);
  const chapter: Chapter = {
    pages: found.pages,
    confident: found.confident ?? true,
    startPage: found.startPage ?? 0,
    meta: {
      title: nonEmptyString(found.title) ?? nonEmptyString(seriesLink?.textContent.trim()) ?? parsed.title,
      chapter: nonEmptyString(found.chapter) ?? parsed.chapter,
      prevUrl: nonEmptyString(found.prevUrl),
      nextUrl: nonEmptyString(found.nextUrl),
      prevLabel: nonEmptyString(found.prevLabel),
      nextLabel: nonEmptyString(found.nextLabel),
      seriesUrl: nonEmptyString(found.seriesUrl) ?? sameSiteUrl(seriesLink?.getAttribute('href'), url),
    },
  };
  if (found.inPage) chapter.inPage = found.inPage;
  return chapter;
}

/** Inline (not `src`) scripts whose text contains `marker`. */
export function inlineScriptsContaining(document: Document, marker: string): string[] {
  return Array.from(document.querySelectorAll('script:not([src])'), (script) => script.textContent).filter(
    (text) => text.includes(marker),
  );
}
