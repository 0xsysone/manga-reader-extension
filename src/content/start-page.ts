/** Which page the reader opens on. */

/** Inputs of {@link resolveStartPage}. */
export interface StartPageInput {
  pageCount: number;
  /** Page saved for this chapter during the browser session. */
  savedPage: number | null;
  /** Page the site itself is showing (`Chapter.startPage`). */
  siteStartPage: number | undefined;
  /** The user came back from the next chapter: open on the last page. */
  openAtEnd: boolean;
}

function isPageIndex(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isInteger(value) && value >= 0;
}

/**
 * Start page, by priority: last page when coming back from the next chapter, then the saved position,
 * then the site's own position (when past the first page), else the first page. Always within bounds.
 */
export function resolveStartPage(input: StartPageInput): number {
  const lastPage = Math.max(0, input.pageCount - 1);
  if (input.openAtEnd) return lastPage;
  let start = 0;
  if (isPageIndex(input.savedPage)) start = input.savedPage;
  else if (isPageIndex(input.siteStartPage) && input.siteStartPage > 0) start = input.siteStartPage;
  return Math.min(start, lastPage);
}
