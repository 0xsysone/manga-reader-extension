import { isRecord, nonEmptyString } from '@/domain/guards';
import { extractJsonAfter, parseJsString } from './script-values';

/** Declaration of the page list in the my Manga Reader CMS (Scan-VF and clones). */
export const MY_MANGA_READER_PAGES = 'var pages';

const PAGES_MARKER = `${MY_MANGA_READER_PAGES} =`;
const CURRENT_PAGE = /var\s+current_page\s*=\s*(\d+)/;
const FIRST_PAGE = 1;
const EXTERNAL_FLAG = 1;
/** `…/name/12` where the last segment is a page number and the one before it contains a letter. */
const PAGE_NUMBER_SUFFIX = /^(.*\/([^/]*[a-z][^/]*))\/\d+\/?$/i;
const WEB_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);

export interface MyMangaReaderPage {
  /** File name relative to the shown page's folder, or an absolute URL when `external`. */
  image: string;
  external: boolean;
}

export interface MyMangaReaderChapter {
  pages: MyMangaReaderPage[];
  nextUrl: string | null;
  prevUrl: string | null;
  /** Page shown by the site, 1-based. */
  currentPage: number;
}

function toPage(entry: unknown): MyMangaReaderPage | null {
  if (!isRecord(entry) || typeof entry.page_image !== 'string') return null;
  const image = entry.page_image.trim();
  return image === '' ? null : { image, external: Number(entry.external) === EXTERNAL_FLAG };
}

/** Reads `var pages = [...]`, `next_chapter`, `prev_chapter` and `current_page`; `null` without pages. */
export function parseMyMangaReader(scriptText: string): MyMangaReaderChapter | null {
  const entries = extractJsonAfter(scriptText, PAGES_MARKER);
  if (!Array.isArray(entries)) return null;
  const pages = entries.map(toPage).filter((page) => page !== null);
  if (pages.length === 0) return null;
  const currentPage = parseInt(CURRENT_PAGE.exec(scriptText)?.[1] ?? '', 10);
  return {
    pages,
    nextUrl: nonEmptyString(parseJsString(scriptText, 'next_chapter')),
    prevUrl: nonEmptyString(parseJsString(scriptText, 'prev_chapter')),
    currentPage: currentPage > 0 ? currentPage : FIRST_PAGE,
  };
}

function parseUrl(url: string, base?: string): URL | null {
  try {
    return new URL(url, base);
  } catch {
    return null;
  }
}

/** URL of every page: relative to the folder of the image the site shows, or absolute when `external`. */
export function myMangaReaderUrls(
  pages: readonly MyMangaReaderPage[],
  shownImageUrl: string | null | undefined,
): string[] {
  const folder = parseUrl('.', (shownImageUrl ?? '').trim());
  if (!folder) return [];
  return pages
    .map((page) => (page.external ? parseUrl(page.image) : parseUrl(page.image, folder.href)))
    .filter((url): url is URL => url !== null && WEB_PROTOCOLS.has(url.protocol))
    .map((url) => url.href);
}

/** `…/chapitre-1197/15` → `…/chapitre-1197`: drops a trailing page number, never a numeric identifier. */
export function stripPageSuffix(url: string): string | null {
  const parsed = parseUrl(url);
  if (!parsed) return null;
  const match = PAGE_NUMBER_SUFFIX.exec(parsed.pathname);
  if (match?.[1]) parsed.pathname = match[1];
  return parsed.href;
}
