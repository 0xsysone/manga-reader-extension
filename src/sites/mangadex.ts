import { isRecord, nonEmptyString, type JsonRecord } from '@/domain/guards';
import type { DetectContext, SiteAdapter } from '@/shared/types';
import { urlPage } from './images';
import { buildChapter } from './meta';
import {
  mangadexImageUrls,
  mangadexNeighbours,
  type MangadexNeighbour,
  type MangadexNeighbours,
} from './parsers/mangadex';

/** Public API the MangaDex site itself uses. */
export const MANGADEX_API = 'https://api.mangadex.org';

const MANGADEX_HOST = /(^|\.)mangadex\.org$/;
const CHAPTER_ID_IN_PATH = /\/chapter\/([0-9a-f-]{36})/i;
const DEFAULT_LANGUAGE = 'en';
/** Title translations tried in order before any other. */
const PREFERRED_TITLE_LANGUAGES = ['en', 'ja-ro'] as const;

function chapterId(context: DetectContext): string | null {
  if (!MANGADEX_HOST.test(context.url.hostname)) return null;
  return CHAPTER_ID_IN_PATH.exec(context.url.pathname)?.[1] ?? null;
}

/** GET on the API; `null` when the request fails. */
async function fetchApi(context: DetectContext, path: string): Promise<unknown> {
  try {
    return await context.fetchJson(`${MANGADEX_API}${path}`);
  } catch {
    return null;
  }
}

function recordOrEmpty(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

interface Series {
  id: string;
  title: string | null;
}

function seriesTitle(titles: JsonRecord): string | null {
  const preferred = PREFERRED_TITLE_LANGUAGES.map((language) => nonEmptyString(titles[language]));
  return [...preferred, ...Object.values(titles).map(nonEmptyString)].find((title) => title !== null) ?? null;
}

/** The series, from the `manga` relationship of a `/chapter/{id}?includes[]=manga` response. */
function seriesOf(chapterData: JsonRecord): Series | null {
  const relationships: unknown[] = Array.isArray(chapterData.relationships) ? chapterData.relationships : [];
  const manga = relationships.find((relation) => isRecord(relation) && relation.type === 'manga');
  if (!isRecord(manga) || typeof manga.id !== 'string') return null;
  return { id: manga.id, title: seriesTitle(recordOrEmpty(recordOrEmpty(manga.attributes).title)) };
}

/** MangaDex: pages, title and neighbour chapters from its public API (through `context.fetchJson`). */
export const mangadexAdapter: SiteAdapter = {
  id: 'mangadex',
  matches: (context) => chapterId(context) !== null,
  async extract(context) {
    const id = chapterId(context);
    if (!id) return null;
    const [atHome, chapterResponse] = await Promise.all([
      fetchApi(context, `/at-home/server/${id}`),
      fetchApi(context, `/chapter/${id}?includes[]=manga`),
    ]);
    const urls = mangadexImageUrls(atHome);
    if (urls.length === 0) return null;

    const chapterData = recordOrEmpty(recordOrEmpty(chapterResponse).data);
    const attributes = recordOrEmpty(chapterData.attributes);
    const series = seriesOf(chapterData);
    let neighbours: MangadexNeighbours = { prev: null, next: null };
    if (series) {
      const language = encodeURIComponent(nonEmptyString(attributes.translatedLanguage) ?? DEFAULT_LANGUAGE);
      const aggregate = await fetchApi(
        context,
        `/manga/${series.id}/aggregate?translatedLanguage[]=${language}`,
      );
      neighbours = mangadexNeighbours(aggregate, id);
    }
    const origin = context.url.origin;
    const chapterUrl = (neighbour: MangadexNeighbour | null): string | null =>
      neighbour ? `${origin}/chapter/${neighbour.id}` : null;
    return buildChapter(context, {
      pages: urls.map((url) => urlPage(url)),
      title: series?.title,
      chapter: nonEmptyString(attributes.chapter),
      prevUrl: chapterUrl(neighbours.prev),
      nextUrl: chapterUrl(neighbours.next),
      prevLabel: neighbours.prev?.chapter,
      nextLabel: neighbours.next?.chapter,
      seriesUrl: series ? `${origin}/title/${series.id}` : null,
    });
  },
};
