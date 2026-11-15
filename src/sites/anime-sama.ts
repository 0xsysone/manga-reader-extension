import type { ChapterDirection, InPageNavigation, SiteAdapter } from '@/shared/types';
import { pagesFromImages } from './images';
import { buildChapter } from './meta';

const PAGES_BOX_ID = 'scansPlacement';
const CHAPTER_SELECT_ID = 'selectChapitres';
const SERIES_TITLE_ID = 'titreOeuvre';
const CHAPTER_BUTTON_IDS: Readonly<Record<ChapterDirection, string>> = {
  next: 'nextChapitre',
  prev: 'prevChapitre',
};

/**
 * Placeholder neighbour URLs: the site switches chapters in place, so there is no URL to load.
 * They only tell the reader a neighbour exists; navigation goes through {@link InPageNavigation}.
 */
export const IN_PAGE_CHAPTER_URLS: Readonly<Record<ChapterDirection, string>> = {
  prev: '#mr-prev',
  next: '#mr-next',
};

/** Quiet time after the first page changed, so the site finishes swapping every image. */
const CHAPTER_SETTLE_DELAY_MS = 200;
/** Give up waiting for the site to load the other chapter after this long. */
const CHAPTER_CHANGE_TIMEOUT_MS = 8000;

const CHAPTER_NUMBER = /(\d+(?:[.,]\d+)?)/;

/** `Chapitre 12` → `12`; the whole option text when it holds no number. */
function chapterLabel(option: HTMLOptionElement | undefined): string | null {
  if (!option) return null;
  const text = option.textContent.trim();
  return CHAPTER_NUMBER.exec(text)?.[1] ?? text;
}

function firstImageSource(box: Element): string | null {
  return box.querySelector('img')?.getAttribute('src') ?? null;
}

/**
 * Clicks the site's own chapter button and resolves once the first page image changed and the
 * page settled: `true` on change, `false` when there is no button or nothing changed in time.
 */
function switchChapter(document: Document, box: Element, direction: ChapterDirection): Promise<boolean> {
  const button = document.getElementById(CHAPTER_BUTTON_IDS[direction]);
  if (!button) return Promise.resolve(false);
  const before = firstImageSource(box);
  const changed = (): boolean => firstImageSource(box) !== before;
  return new Promise((resolve) => {
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (result: boolean): void => {
      observer.disconnect();
      clearTimeout(settleTimer);
      clearTimeout(timeoutTimer);
      resolve(result);
    };
    const observer = new MutationObserver(() => {
      if (!changed()) return;
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => finish(true), CHAPTER_SETTLE_DELAY_MS);
    });
    const timeoutTimer = setTimeout(() => finish(changed()), CHAPTER_CHANGE_TIMEOUT_MS);
    observer.observe(box, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    button.click();
  });
}

interface ReaderParts {
  pagesBox: HTMLElement;
  chapterSelect: HTMLSelectElement;
}

function readerParts(document: Document): ReaderParts | null {
  const pagesBox = document.getElementById(PAGES_BOX_ID);
  const chapterSelect = document.querySelector<HTMLSelectElement>(`select#${CHAPTER_SELECT_ID}`);
  if (!pagesBox || !chapterSelect || chapterSelect.options.length === 0) return null;
  return { pagesBox, chapterSelect };
}

/** Anime-Sama: one-page reader whose buttons switch chapters without changing the URL. */
export const animeSamaAdapter: SiteAdapter = {
  id: 'anime-sama',
  matches: (context) => readerParts(context.document) !== null,
  extract(context) {
    const { document } = context;
    const parts = readerParts(document);
    if (!parts) return null;
    const { pagesBox, chapterSelect } = parts;
    const { options, selectedIndex: current } = chapterSelect;
    const hasPrev = current > 0;
    const hasNext = current < options.length - 1;
    const inPage: InPageNavigation = { go: (direction) => switchChapter(document, pagesBox, direction) };
    return buildChapter(context, {
      pages: pagesFromImages(pagesBox.querySelectorAll('img'), context.url.href),
      inPage,
      title: document.getElementById(SERIES_TITLE_ID)?.textContent.trim(),
      chapter: chapterLabel(options[current]),
      prevUrl: hasPrev ? IN_PAGE_CHAPTER_URLS.prev : null,
      nextUrl: hasNext ? IN_PAGE_CHAPTER_URLS.next : null,
      prevLabel: hasPrev ? chapterLabel(options[current - 1]) : null,
      nextLabel: hasNext ? chapterLabel(options[current + 1]) : null,
    });
  },
};
