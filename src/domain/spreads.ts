import type { Direction, PageSlice, Spread, SpreadSides } from '@/shared/types';

/** Width / height above which an image is a landscape spread drawn in one piece. */
const WIDE_RATIO = 1;

/** Horizontal offset, in page widths, that centres a lone page in the book. */
const LONE_PAGE_SHIFT = 0.5;

/** Anything with a known (or `0` = unknown) width / height ratio. */
export interface HasRatio {
  ratio: number;
}

/** `true` for a landscape image (a double page drawn in one piece). */
export function isWide(page: HasRatio | null | undefined): boolean {
  return page != null && page.ratio > WIDE_RATIO;
}

export interface SpreadOptions {
  /** Two pages side by side. */
  double: boolean;
  /** In double mode, show the first page alone like a cover (default `true`). */
  firstPageAlone?: boolean;
}

/** Splits the pages into spreads shown together (see {@link Spread} for each kind). */
export function buildSpreads(pages: readonly HasRatio[], options: SpreadOptions): Spread[] {
  const count = pages.length;
  if (!options.double) return pages.map((_, index) => ({ kind: 'single', pages: [index] }));

  const spreads: Spread[] = [];
  let index = 0;
  if (options.firstPageAlone !== false && count > 0 && !isWide(pages[0])) {
    spreads.push({ kind: 'lead', pages: [0] });
    index = 1;
  }
  while (index < count) {
    if (isWide(pages[index])) {
      spreads.push({ kind: 'wide', pages: [index] });
      index += 1;
    } else if (index + 1 < count && !isWide(pages[index + 1])) {
      spreads.push({ kind: 'pair', pages: [index, index + 1] });
      index += 2;
    } else {
      spreads.push({ kind: index === count - 1 ? 'trail' : 'lead', pages: [index] });
      index += 1;
    }
  }
  return spreads;
}

/** Index of the spread holding page `pageIndex`, `0` when none does. */
export function spreadIndexForPage(spreads: readonly Spread[], pageIndex: number): number {
  return Math.max(
    0,
    spreads.findIndex((spread) => spread.pages.includes(pageIndex)),
  );
}

function fullPage(page: number | undefined): PageSlice | null {
  return page === undefined ? null : { page, part: 'full' };
}

/** What the physical left and right sides of the book show. Right-to-left: the first page read is on the right. */
export function spreadSides(spread: Spread, direction: Direction): SpreadSides {
  const rtl = direction === 'rtl';
  const [first, second] = spread.pages;
  switch (spread.kind) {
    case 'pair':
      return rtl
        ? { left: fullPage(second), right: fullPage(first) }
        : { left: fullPage(first), right: fullPage(second) };
    case 'wide':
      return first === undefined
        ? { left: null, right: null }
        : { left: { page: first, part: 'left' }, right: { page: first, part: 'right' } };
    case 'lead':
      // The side that turns forward: left in rtl, right in ltr.
      return rtl ? { left: fullPage(first), right: null } : { left: null, right: fullPage(first) };
    case 'trail':
      // The side read first: right in rtl, left in ltr.
      return rtl ? { left: null, right: fullPage(first) } : { left: fullPage(first), right: null };
    case 'single':
      return { left: null, right: null };
  }
}

/** Horizontal shift (in page widths) that centres a lone page; `0` for two sides or none. */
export function spreadShift(sides: SpreadSides): number {
  if (sides.left && !sides.right) return LONE_PAGE_SHIFT;
  if (!sides.left && sides.right) return -LONE_PAGE_SHIFT;
  return 0;
}

/** Side of the leaf that rotates when turning a double page. Right-to-left + forward → the left page turns. */
export function turningSide(direction: Direction, forward: boolean): 'left' | 'right' {
  return (direction === 'rtl') === forward ? 'left' : 'right';
}

/** Human label of a spread, e.g. `6–7 / 19`. */
export function spreadLabel(spread: Spread | null | undefined, total: number): string {
  const numbers = (spread?.pages ?? []).map((page) => page + 1).sort((a, b) => a - b);
  const first = numbers[0];
  const last = numbers[numbers.length - 1];
  if (first === undefined || last === undefined) return `0 / ${total}`;
  const range = numbers.length > 1 ? `${first}–${last}` : `${first}`;
  return `${range} / ${total}`;
}
