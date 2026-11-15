import type { Chapter, DetectContext, SiteAdapter } from '@/shared/types';
import { animeSamaAdapter } from './anime-sama';
import { heuristicAdapter } from './heuristic';
import { knownReadersAdapter } from './known-readers';
import { mangadexAdapter } from './mangadex';
import { myMangaReaderAdapter } from './my-manga-reader';
import { scanMangaAdapter } from './scan-manga';
import { tsReaderAdapter } from './ts-reader';

/** Every adapter, from the most precise to the most generic: the first one that finds a chapter wins. */
export const SITE_ADAPTERS: readonly SiteAdapter[] = [
  mangadexAdapter,
  scanMangaAdapter,
  animeSamaAdapter,
  tsReaderAdapter,
  myMangaReaderAdapter,
  knownReadersAdapter,
  heuristicAdapter,
];

/** Tries the matching adapters in priority order; `null` when none finds a chapter. */
export async function detectChapter(
  context: DetectContext,
  adapters: readonly SiteAdapter[] = SITE_ADAPTERS,
): Promise<Chapter | null> {
  for (const adapter of adapters) {
    if (!adapter.matches(context)) continue;
    const chapter = await adapter.extract(context);
    if (chapter) return chapter;
  }
  return null;
}
