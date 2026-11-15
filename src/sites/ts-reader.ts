import type { DetectContext, Page, SiteAdapter } from '@/shared/types';
import { declaredRatio, imageUrl, urlPage } from './images';
import { buildChapter, inlineScriptsContaining } from './meta';
import { sameSiteUrl } from './navigation';
import { imagesFromTsReader, parseTsReader, TS_READER_CALL } from './parsers/ts-reader';

/** Images the theme renders before rewriting them; they may still declare their size. */
const READER_AREA_IMAGES = '#readerarea img';

function withoutQuery(url: string): string {
  return url.split('?')[0] ?? url;
}

/** Ratios declared by the images already in the reader area, keyed by URL without query. */
function declaredRatios(context: DetectContext): Map<string, number> {
  const ratios = new Map<string, number>();
  for (const image of context.document.querySelectorAll(READER_AREA_IMAGES)) {
    const url = imageUrl(image, context.url.href);
    const ratio = declaredRatio(image);
    if (url && ratio) ratios.set(withoutQuery(url), ratio);
  }
  return ratios;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** WordPress "MangaReader" theme (Themesia): images and neighbours come from `ts_reader.run({...})`. */
export const tsReaderAdapter: SiteAdapter = {
  id: 'ts-reader',
  matches: (context) => inlineScriptsContaining(context.document, TS_READER_CALL).length > 0,
  extract(context) {
    for (const script of inlineScriptsContaining(context.document, TS_READER_CALL)) {
      const config = parseTsReader(script);
      const images = imagesFromTsReader(config);
      if (!config || images.length === 0) continue;
      const ratios = declaredRatios(context);
      const pages: Page[] = images.map((url) => urlPage(url, ratios.get(withoutQuery(url)) ?? 0));
      return buildChapter(context, {
        pages,
        prevUrl: sameSiteUrl(stringOrNull(config.prevUrl), context.url),
        nextUrl: sameSiteUrl(stringOrNull(config.nextUrl), context.url),
      });
    }
    return null;
  },
};
