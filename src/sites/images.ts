import type { Page } from '@/shared/types';

/** Fewest images that make a chapter (fewer is a gallery, a banner row…). */
export const MIN_CHAPTER_PAGES = 3;

/** Attributes holding an image URL, most specific (lazy loading) first. */
const IMAGE_URL_ATTRIBUTES = [
  'data-src',
  'data-lazy-src',
  'data-original',
  'data-url',
  'data-cfsrc',
  'data-srcset',
  'srcset',
  'src',
] as const;
const SRCSET_SUFFIX = 'srcset';
const PLACEHOLDER_IMAGE = /(^data:|\.svg(\?|$)|placeholder|lazy[-_.]?load|loading\.gif|blank\.(gif|png))/i;
const WEB_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);

/** Viewport width assumed when the real one is unknown. */
const DEFAULT_VIEWPORT_WIDTH = 1280;
/** A page is at least this share of the viewport width wide… */
const MIN_PAGE_WIDTH_SHARE = 0.4;
/** …capped to this many pixels, so very wide screens still accept ordinary scans. */
const MAX_MIN_PAGE_WIDTH = 480;
/** Width / height outside these bounds is an ad banner or a webtoon strip, not a manga page. */
const MAX_PAGE_RATIO = 2.2;
const MIN_PAGE_RATIO = 0.25;

export type ImageAttributes = Readonly<Partial<Record<string, string>>>;

/** First srcset candidate URL: `a.jpg 1x, a@2x.jpg 2x` → `a.jpg`. */
function firstSrcsetUrl(srcset: string): string {
  return srcset.split(',')[0]?.trim().split(/\s+/)[0] ?? '';
}

function toWebUrl(value: string, baseUrl: string): string | null {
  try {
    const url = new URL(value, baseUrl);
    return WEB_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/** Real http(s) URL of an image, honouring lazy-loading attributes and skipping placeholders. */
export function resolveImageSrc(attributes: ImageAttributes, baseUrl: string): string | null {
  for (const name of IMAGE_URL_ATTRIBUTES) {
    const raw = attributes[name]?.trim();
    if (!raw) continue;
    const value = name.endsWith(SRCSET_SUFFIX) ? firstSrcsetUrl(raw) : raw;
    if (!value || PLACEHOLDER_IMAGE.test(value)) continue;
    const url = toWebUrl(value, baseUrl);
    if (url) return url;
  }
  return null;
}

/** An image of the page, as seen by the generic detection. Sizes are `0` when unknown. */
export interface ImageCandidate {
  src: string;
  /** Identifier of the container the image sits in. */
  group: number;
  displayedWidth: number;
  naturalWidth?: number;
  naturalHeight?: number;
  /** Width declared by the `width` attribute. */
  declaredWidth?: number;
}

function candidateWidth(candidate: ImageCandidate): number {
  return candidate.displayedWidth > 0
    ? candidate.displayedWidth
    : Math.max(candidate.naturalWidth ?? 0, candidate.declaredWidth ?? 0);
}

function hasPageProportions({ naturalWidth = 0, naturalHeight = 0 }: ImageCandidate): boolean {
  if (naturalWidth <= 0 || naturalHeight <= 0) return true;
  const ratio = naturalWidth / naturalHeight;
  return ratio >= MIN_PAGE_RATIO && ratio <= MAX_PAGE_RATIO;
}

/**
 * Generic detection: the largest group of big images sharing a container, deduplicated, in document order.
 * On a tie the first group met wins. Empty when no group holds {@link MIN_CHAPTER_PAGES} pages.
 */
export function pickImageGroup(candidates: readonly ImageCandidate[], viewportWidth: number): string[] {
  const minWidth = Math.min(
    MAX_MIN_PAGE_WIDTH,
    (viewportWidth || DEFAULT_VIEWPORT_WIDTH) * MIN_PAGE_WIDTH_SHARE,
  );
  const groups = new Map<number, Set<string>>();
  for (const candidate of candidates) {
    if (candidateWidth(candidate) < minWidth || !hasPageProportions(candidate)) continue;
    const group = groups.get(candidate.group) ?? new Set<string>();
    group.add(candidate.src);
    groups.set(candidate.group, group);
  }
  let best: string[] = [];
  for (const group of groups.values()) {
    if (group.size > best.length) best = [...group];
  }
  return best.length >= MIN_CHAPTER_PAGES ? best : [];
}

/** Attributes of an element as a name → value record. */
function attributesOf(element: Element): Record<string, string> {
  return Object.fromEntries(Array.from(element.attributes, (attribute) => [attribute.name, attribute.value]));
}

/** Integer value of a size attribute, `0` when absent or invalid. */
export function sizeAttribute(element: Element, name: 'width' | 'height'): number {
  return parseInt(element.getAttribute(name) ?? '', 10) || 0;
}

/** Width / height declared by the `width` and `height` attributes, `0` when unknown. */
export function declaredRatio(image: Element): number {
  const width = sizeAttribute(image, 'width');
  const height = sizeAttribute(image, 'height');
  return width > 0 && height > 0 ? width / height : 0;
}

/** Real URL of an `<img>` (see {@link resolveImageSrc}). */
export function imageUrl(image: Element, baseUrl: string): string | null {
  return resolveImageSrc(attributesOf(image), baseUrl);
}

/** A page loaded from a URL. */
export function urlPage(url: string, ratio = 0): Page {
  return { source: { kind: 'url', url }, ratio };
}

/** One page per distinct image URL among `images`, with the ratio their HTML declares. */
export function pagesFromImages(images: Iterable<Element>, baseUrl: string): Page[] {
  const seen = new Set<string>();
  const pages: Page[] = [];
  for (const image of images) {
    const url = imageUrl(image, baseUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    pages.push(urlPage(url, declaredRatio(image)));
  }
  return pages;
}
