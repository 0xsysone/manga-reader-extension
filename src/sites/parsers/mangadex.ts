import { isRecord } from '@/domain/guards';

export type MangadexQuality = 'data' | 'data-saver';

/** A chapter next to the current one in a MangaDex series. */
export interface MangadexNeighbour {
  id: string;
  /** Chapter number as MangaDex labels it. */
  chapter: string;
}

export interface MangadexNeighbours {
  prev: MangadexNeighbour | null;
  next: MangadexNeighbour | null;
}

interface AggregateChapter {
  number: number;
  label: string;
  /** Main id first, then alternative uploads of the same chapter. */
  ids: string[];
}

/** Page image URLs from the `/at-home/server/{id}` response (`data` = full quality). */
export function mangadexImageUrls(atHome: unknown, quality: MangadexQuality = 'data'): string[] {
  if (!isRecord(atHome) || typeof atHome.baseUrl !== 'string' || !isRecord(atHome.chapter)) return [];
  const { hash } = atHome.chapter;
  const files = quality === 'data' ? atHome.chapter.data : atHome.chapter.dataSaver;
  if (typeof hash !== 'string' || hash === '' || !Array.isArray(files)) return [];
  const baseUrl = atHome.baseUrl;
  return files
    .filter((file): file is string => typeof file === 'string' && file !== '')
    .map((file) => `${baseUrl}/${quality}/${hash}/${file}`);
}

function toAggregateChapter(entry: unknown): AggregateChapter | null {
  if (!isRecord(entry) || typeof entry.id !== 'string' || entry.id === '' || entry.isUnavailable === true) {
    return null;
  }
  const label = typeof entry.chapter === 'string' ? entry.chapter : '';
  const others = Array.isArray(entry.others)
    ? entry.others.filter((id): id is string => typeof id === 'string')
    : [];
  return { number: parseFloat(label), label, ids: [entry.id, ...others] };
}

function aggregateChapters(aggregate: unknown): AggregateChapter[] {
  if (!isRecord(aggregate) || !isRecord(aggregate.volumes)) return [];
  return Object.values(aggregate.volumes).flatMap((volume) =>
    isRecord(volume) && isRecord(volume.chapters)
      ? Object.values(volume.chapters)
          .map(toAggregateChapter)
          .filter((chapter) => chapter !== null)
      : [],
  );
}

/** Sort key: chapters without a number go last. */
function sortKey(chapter: AggregateChapter): number {
  return Number.isNaN(chapter.number) ? Infinity : chapter.number;
}

function toNeighbour(chapter: AggregateChapter | undefined): MangadexNeighbour | null {
  const id = chapter?.ids[0];
  return chapter && id ? { id, chapter: chapter.label } : null;
}

/** Previous and next chapters around `currentId` (or one of its alternatives), from `/manga/{id}/aggregate`. */
export function mangadexNeighbours(aggregate: unknown, currentId: string): MangadexNeighbours {
  const chapters = aggregateChapters(aggregate).sort((a, b) => sortKey(a) - sortKey(b));
  const index = chapters.findIndex((chapter) => chapter.ids.includes(currentId));
  if (index === -1) return { prev: null, next: null };
  return { prev: toNeighbour(chapters[index - 1]), next: toNeighbour(chapters[index + 1]) };
}
