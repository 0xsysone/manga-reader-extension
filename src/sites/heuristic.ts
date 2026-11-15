import type { SiteAdapter } from '@/shared/types';
import {
  declaredRatio,
  imageUrl,
  pickImageGroup,
  sizeAttribute,
  urlPage,
  type ImageCandidate,
} from './images';
import { buildChapter } from './meta';
import { collectLinks, pickNavLinks } from './navigation';

/** Container of an image, climbing through single-child wrappers (`<div><img></div>`). */
function containerOf(image: Element, body: HTMLElement | null): Element {
  let node = image;
  while (node.parentElement && node.parentElement !== body && node.parentElement.childElementCount === 1) {
    node = node.parentElement;
  }
  return node.parentElement ?? node;
}

/** Generic fallback: the largest group of big images in one container. Never confident. */
export const heuristicAdapter: SiteAdapter = {
  id: 'heuristic',
  matches: () => true,
  extract(context) {
    const { document } = context;
    const groupIds = new Map<Element, number>();
    const ratios = new Map<string, number>();
    const candidates: ImageCandidate[] = [];
    for (const image of document.querySelectorAll('img')) {
      const src = imageUrl(image, context.url.href);
      if (!src) continue;
      const container = containerOf(image, document.body);
      const group = groupIds.get(container) ?? groupIds.size;
      groupIds.set(container, group);
      if (!ratios.has(src)) ratios.set(src, declaredRatio(image));
      candidates.push({
        src,
        group,
        displayedWidth: image.getBoundingClientRect().width,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        declaredWidth: sizeAttribute(image, 'width'),
      });
    }
    const urls = pickImageGroup(candidates, context.viewportWidth);
    if (urls.length === 0) return null;
    const links = pickNavLinks(collectLinks(document), context.url.href);
    return buildChapter(context, {
      pages: urls.map((url) => urlPage(url, ratios.get(url) ?? 0)),
      confident: false,
      prevUrl: links.prev,
      nextUrl: links.next,
    });
  },
};
