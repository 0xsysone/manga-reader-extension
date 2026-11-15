import type { ChapterDirection } from '@/shared/types';

export interface ChapterTitle {
  /** Series title. */
  title: string;
  /** Chapter number (`.` as decimal separator), `''` when none was found. */
  chapter: string;
}

/** `One Piece #1198: subtitle` (my Manga Reader CMS). */
const HASH_NUMBER_TITLE = /^(.+?)\s*#\s*(\d+(?:[.,]\d+)?)\b/;
/** `Sakamoto Days 66`, `One Piece - Chapitre 1100.5`, `Title ch. 3`. */
const TRAILING_NUMBER_TITLE = /^(.*?)[\s\-–—:]*(?:chapitre|chapter|ch\.?)?\s*(\d+(?:[.,]\d+)?)\s*$/i;
/** `…/chapitre-12`, `…chapter_3.5`, `…chap 7`. */
const NAMED_CHAPTER_IN_URL = /chap(?:itre|ter)?[-_ ]?(\d+(?:[.,]\d+)?)/i;
/** `…/manga/12`, `…/manga/12-5` (the dash being a decimal separator). */
const TRAILING_NUMBER_IN_URL = /(\d+(?:[.-]\d+)?)$/;

function toDecimalPoint(number: string): string {
  return number.replace(',', '.');
}

/** Splits a heading such as `Sakamoto Days 66` into `{ title: 'Sakamoto Days', chapter: '66' }`. */
export function parseChapterTitle(text: string | null | undefined): ChapterTitle {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  const hash = HASH_NUMBER_TITLE.exec(clean);
  if (hash?.[1] && hash[2]) return { title: hash[1].trim(), chapter: toDecimalPoint(hash[2]) };
  const trailing = TRAILING_NUMBER_TITLE.exec(clean);
  if (trailing?.[1] && trailing[2]) {
    return { title: trailing[1].trim(), chapter: toDecimalPoint(trailing[2]) };
  }
  return { title: clean, chapter: '' };
}

/**
 * Rejects a "next chapter" whose number is not above the current one (or a "previous" not below it).
 * Unknown or non-numeric numbers are given the benefit of the doubt.
 */
export function isAdjacentChapter(
  current: string | null | undefined,
  candidate: string | null | undefined,
  direction: ChapterDirection,
): boolean {
  const currentNumber = parseFloat(toDecimalPoint(String(current)));
  const candidateNumber = parseFloat(toDecimalPoint(String(candidate)));
  if (Number.isNaN(currentNumber) || Number.isNaN(candidateNumber)) return true;
  return direction === 'next' ? candidateNumber > currentNumber : candidateNumber < currentNumber;
}

/** Best guess of a chapter number from its URL (`…/chapitre-12/` → `12`), `''` when there is none. */
export function chapterFromUrl(url: string | null | undefined): string {
  const text = url ?? '';
  const named = NAMED_CHAPTER_IN_URL.exec(text);
  if (named?.[1]) return toDecimalPoint(named[1]);
  const trailing = TRAILING_NUMBER_IN_URL.exec(text.replace(/\/+$/, ''));
  return trailing?.[1] ? trailing[1].replace('-', '.') : '';
}
