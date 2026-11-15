import type { ViewMode } from '@/shared/types';
import { isWide, type HasRatio } from './spreads';

/** Width / height assumed for a manga page when no page tells its size. */
export const DEFAULT_PAGE_RATIO = 0.7;

/** Auto mode still shows two pages when the viewport is only this share of their combined width. */
const DOUBLE_PAGE_FIT = 0.92;

const PAGES_PER_SPREAD = 2;

/** Smallest drawable length, so a degenerate viewport never yields a zero or negative size. */
const MIN_LENGTH = 1;

export interface PageSize {
  width: number;
  height: number;
}

function median(sortedValues: readonly number[]): number | undefined {
  const middle = Math.floor(sortedValues.length / 2);
  const upper = sortedValues[middle];
  if (sortedValues.length % 2 === 1 || upper === undefined) return upper;
  const lower = sortedValues[middle - 1];
  return lower === undefined ? upper : (lower + upper) / 2;
}

/** Reference width / height ratio: median of the known portrait pages, {@link DEFAULT_PAGE_RATIO} otherwise. */
export function referenceRatio(pages: readonly (HasRatio | null | undefined)[]): number {
  const ratios = pages
    .filter((page): page is HasRatio => page != null && page.ratio > 0 && !isWide(page))
    .map((page) => page.ratio)
    .sort((a, b) => a - b);
  return median(ratios) ?? DEFAULT_PAGE_RATIO;
}

/**
 * Whether to show two pages side by side. Auto mode switches to double pages when two pages of
 * `ratio` (unknown: `0`) fitted to the viewport height take at most the viewport width, with a small tolerance.
 */
export function resolveDouble(
  mode: ViewMode,
  viewportWidth: number,
  viewportHeight: number,
  ratio: number,
): boolean {
  if (mode === 'double') return true;
  if (mode === 'single') return false;
  const pageWidth = (viewportHeight || MIN_LENGTH) * (ratio || DEFAULT_PAGE_RATIO);
  return viewportWidth >= pageWidth * PAGES_PER_SPREAD * DOUBLE_PAGE_FIT;
}

/**
 * Size of one page fitted to the viewport height, then shrunk if `pagesAcross` pages overflow the width.
 * `padding` is applied on every side. Sizes are rounded to whole pixels.
 */
export function fitPage(
  viewportWidth: number,
  viewportHeight: number,
  ratio: number,
  pagesAcross: number,
  padding = 0,
): PageSize {
  const availableWidth = Math.max(MIN_LENGTH, viewportWidth - padding * 2);
  const availableHeight = Math.max(MIN_LENGTH, viewportHeight - padding * 2);
  let height = availableHeight;
  let width = height * ratio;
  if (width * pagesAcross > availableWidth) {
    width = availableWidth / pagesAcross;
    height = width / ratio;
  }
  return { width: Math.round(width), height: Math.round(height) };
}
