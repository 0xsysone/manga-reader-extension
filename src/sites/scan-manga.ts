import { isAdjacentChapter } from '@/domain/chapter';
import { nonEmptyString } from '@/domain/guards';
import type { ChapterDirection, Page, SiteAdapter } from '@/shared/types';
import { scanMangaUrl } from './parsers/scan-manga';
import { decodedImage, scanMangaLivePages } from './scan-manga-live';

/** Reader container of the Scan-Manga engine. */
const READER_CONTAINER = '#container.img_lel';
const PAGE_BOX = '.image-container[data-page]';
const CHAPTER_SELECT = '#select_chapter';
const CHAPTER_ID_IN_PATH = /_(\d+)\.html$/;
const NEIGHBOUR_ARROWS: Readonly<Record<ChapterDirection, string>> = {
  prev: '.navigation .arrow.left[data-chapter]',
  next: '.navigation .arrow.right[data-chapter]',
};
/** `Title » Chapter 12 » Site`: the series title comes first. */
const TITLE_SEPARATOR = '»';

function pageOf(box: HTMLElement): Page {
  const width = Number(box.dataset.width);
  const height = Number(box.dataset.height);
  const image = decodedImage(box);
  return {
    source: image ? { kind: 'element', element: image } : { kind: 'pending' },
    ratio: width > 0 && height > 0 ? width / height : 0,
  };
}

function pageBoxes(container: Element): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(PAGE_BOX)).sort(
    (a, b) => Number(a.dataset.page) - Number(b.dataset.page),
  );
}

/** Chapter number shown by the chapter `<select>` for a chapter id. */
function chapterNumber(document: Document, chapterId: string | undefined): string | null {
  const select = document.querySelector<HTMLSelectElement>(CHAPTER_SELECT);
  const option = select
    ? Array.from(select.options).find((candidate) => candidate.value === chapterId)
    : undefined;
  return option?.textContent.trim() ?? null;
}

function seriesTitle(document: Document): string {
  const ogTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content;
  return (nonEmptyString(ogTitle) ?? document.title).split(TITLE_SEPARATOR)[0]?.trim() ?? '';
}

/** Scan-Manga engine: the site decodes the pages itself, so they are handed over live (see {@link scanMangaLivePages}). */
export const scanMangaAdapter: SiteAdapter = {
  id: 'scan-manga',
  matches: (context) => context.document.querySelector(READER_CONTAINER) !== null,
  extract(context) {
    const { document, url } = context;
    const container = document.querySelector(READER_CONTAINER);
    const boxes = container ? pageBoxes(container) : [];
    if (!container || boxes.length === 0) return null;

    const current = chapterNumber(document, CHAPTER_ID_IN_PATH.exec(url.pathname)?.[1]);
    const neighbourUrl = (direction: ChapterDirection): string | null => {
      const arrow = document.querySelector<HTMLElement>(NEIGHBOUR_ARROWS[direction]);
      const id = arrow?.dataset.chapter;
      if (!arrow || id === undefined || arrow.style.visibility === 'hidden') return null;
      const number = chapterNumber(document, id);
      return isAdjacentChapter(current, number, direction) ? scanMangaUrl(url.href, id, number) : null;
    };
    return {
      pages: boxes.map(pageOf),
      confident: true,
      live: scanMangaLivePages(container, boxes),
      meta: {
        title: seriesTitle(document),
        chapter: current ?? '',
        prevUrl: neighbourUrl('prev'),
        nextUrl: neighbourUrl('next'),
        prevLabel: null,
        nextLabel: null,
        seriesUrl: null,
      },
    };
  },
};
