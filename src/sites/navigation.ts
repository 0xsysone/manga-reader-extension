import type { ChapterDirection } from '@/shared/types';

/** An `<a>` of the page, as seen by the generic previous / next detection. */
export interface LinkInfo {
  href?: string | null;
  text?: string | null;
  rel?: string | null;
  className?: string | null;
}

export interface NavLinks {
  next: string | null;
  prev: string | null;
}

/** Links scanned at most, so huge pages (comment threads…) stay cheap. */
const MAX_SCANNED_LINKS = 3000;
/** Longer link texts are sentences, not "Next" buttons. */
const MAX_NAV_TEXT_LENGTH = 40;

/** How strongly a link looks like a chapter link: a class name beats `rel`, which beats the text. */
const LINK_SCORE = { none: 0, text: 1, rel: 2, className: 3 } as const;
type LinkScore = (typeof LINK_SCORE)[keyof typeof LINK_SCORE];

interface NavPatterns {
  className: RegExp;
  rel: RegExp;
  text: RegExp;
}

const NAV_PATTERNS: Readonly<Record<ChapterDirection, NavPatterns>> = {
  next: {
    className: /(^|[\s_-])next([\s_-]|$)/,
    rel: /(^|\s)next(\s|$)/,
    text: /(suivant|next|prochain)/,
  },
  prev: {
    className: /(^|[\s_-])prev(ious)?([\s_-]|$)/,
    rel: /(^|\s)prev(\s|$)/,
    text: /(précédent|precedent|prev|previous)/,
  },
};

const DIRECTIONS: readonly ChapterDirection[] = ['next', 'prev'];

function parseUrl(url: string, base?: string | URL): URL | null {
  try {
    return new URL(url, base);
  } catch {
    return null;
  }
}

function normalizedText(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function scoreLink(link: LinkInfo, patterns: NavPatterns): LinkScore {
  const className = (link.className ?? '').toLowerCase();
  const rel = (link.rel ?? '').toLowerCase();
  const text = normalizedText(link.text);
  if (patterns.className.test(className)) return LINK_SCORE.className;
  if (patterns.rel.test(rel)) return LINK_SCORE.rel;
  if (text.length <= MAX_NAV_TEXT_LENGTH && patterns.text.test(text)) return LINK_SCORE.text;
  return LINK_SCORE.none;
}

/**
 * Previous / next chapter links among `links`. A class name beats `rel`, which beats the link text.
 * Other origins, in-page anchors and the current page are ignored; one URL is never both.
 */
export function pickNavLinks(links: readonly LinkInfo[], currentUrl: string): NavLinks {
  const best: NavLinks = { next: null, prev: null };
  const here = parseUrl(currentUrl);
  if (!here) return best;
  const bestScore: Record<ChapterDirection, LinkScore> = { next: LINK_SCORE.none, prev: LINK_SCORE.none };
  for (const link of links) {
    const url = link.href ? parseUrl(link.href, here) : null;
    if (url?.origin !== here.origin) continue;
    if (url.pathname === here.pathname && url.search === here.search) continue;
    for (const direction of DIRECTIONS) {
      const score = scoreLink(link, NAV_PATTERNS[direction]);
      if (score > bestScore[direction]) {
        bestScore[direction] = score;
        best[direction] = url.href;
      }
    }
  }
  if (best.next !== null && best.next === best.prev) best.prev = null;
  return best;
}

/** `href` resolved against `base`, or `null` when invalid or on another origin. */
export function sameSiteUrl(href: string | null | undefined, base: URL): string | null {
  if (href == null) return null;
  const url = parseUrl(href, base);
  return url?.origin === base.origin ? url.href : null;
}

/** The first links of the document, as {@link LinkInfo}. */
export function collectLinks(document: Document): LinkInfo[] {
  return Array.from(document.querySelectorAll('a[href]'))
    .slice(0, MAX_SCANNED_LINKS)
    .map((anchor) => ({
      href: anchor.getAttribute('href'),
      text: anchor.textContent,
      rel: anchor.getAttribute('rel'),
      className: anchor.getAttribute('class'),
    }));
}
