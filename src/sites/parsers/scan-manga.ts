import { nonEmptyString } from '@/domain/guards';

/** `…/Title-Chapitre-174-FR_584001.html`: slug, chapter label, language and chapter id. */
const CHAPTER_PATH = /^(.*)-Chapitre-[^/]*?-([A-Za-z]{2,3})_\d+\.html$/;
const NUMERIC_ID = /^\d+$/;
const UNSAFE_LABEL_CHARACTERS = /[^\w.-]+/g;

/**
 * URL of another Scan-Manga chapter. The server routes on the final id
 * (`…-Chapitre-173-FR_575315.html`); the label only keeps the URL readable. `null` when it cannot be built.
 */
export function scanMangaUrl(
  currentUrl: string,
  chapterId: string | number,
  chapterNumber: string | null | undefined,
): string | null {
  const id = String(chapterId);
  if (!NUMERIC_ID.test(id)) return null;
  let url: URL;
  try {
    url = new URL(currentUrl);
  } catch {
    return null;
  }
  const match = CHAPTER_PATH.exec(url.pathname);
  if (!match) return null;
  const [, slug = '', language = ''] = match;
  const label = (nonEmptyString(chapterNumber) ?? id).trim().replace(UNSAFE_LABEL_CHARACTERS, '-');
  return `${url.origin}${slug}-Chapitre-${label}-${language}_${id}.html`;
}
