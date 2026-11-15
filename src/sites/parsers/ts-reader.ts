import { isRecord, type JsonRecord } from '@/domain/guards';
import { extractJsonAfter } from './script-values';

/** Call through which the WordPress "MangaReader" theme (Themesia) passes its configuration. */
export const TS_READER_CALL = 'ts_reader.run(';

const HTTP_URL = /^https?:\/\//;

/** The object passed to `ts_reader.run({...})`, `null` when absent, unreadable or not an object. */
export function parseTsReader(scriptText: string | null | undefined): JsonRecord | null {
  const config = extractJsonAfter(scriptText, TS_READER_CALL);
  return isRecord(config) && !Array.isArray(config) ? config : null;
}

/** The http(s) image URLs of the default source of a `ts_reader` configuration (first source otherwise). */
export function imagesFromTsReader(config: unknown): string[] {
  if (!isRecord(config) || !Array.isArray(config.sources)) return [];
  const sources: unknown[] = config.sources;
  const source =
    sources.find((candidate) => isRecord(candidate) && candidate.source === config.defaultSource) ??
    sources[0];
  if (!isRecord(source) || !Array.isArray(source.images)) return [];
  const images: unknown[] = source.images;
  return images.filter((url): url is string => typeof url === 'string' && HTTP_URL.test(url));
}
