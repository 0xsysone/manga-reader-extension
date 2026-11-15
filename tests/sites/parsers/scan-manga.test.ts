import { describe, expect, it } from 'vitest';
import { scanMangaUrl } from '@/sites/parsers/scan-manga';

const CURRENT =
  'https://www.scan-manga.com/lecture-en-ligne/Kaette-kudasai-Akutsu-san-Chapitre-174-FR_584001.html?x=1';
const BASE = 'https://www.scan-manga.com/lecture-en-ligne/Kaette-kudasai-Akutsu-san-Chapitre-';

describe('scanMangaUrl', () => {
  it('replaces the number and the id, keeping the slug and the language', () => {
    expect(scanMangaUrl(CURRENT, '575315', '173')).toBe(`${BASE}173-FR_575315.html`);
    expect(scanMangaUrl(CURRENT, 560518, '171.5')).toBe(`${BASE}171.5-FR_560518.html`);
    expect(scanMangaUrl(CURRENT, '535956', ' 158 1 ')).toBe(`${BASE}158-1-FR_535956.html`);
  });

  it('labels the chapter with its id when the number is unknown', () => {
    expect(scanMangaUrl(CURRENT, '42', null)).toBe(`${BASE}42-FR_42.html`);
    expect(scanMangaUrl(CURRENT, '42', '')).toBe(`${BASE}42-FR_42.html`);
  });

  it('is null for a non-numeric id or a URL that is not a chapter', () => {
    expect(scanMangaUrl(CURRENT, 'abc', '1')).toBeNull();
    expect(scanMangaUrl('https://www.scan-manga.com/?home', '1', '1')).toBeNull();
    expect(scanMangaUrl('not a url', '1', '1')).toBeNull();
  });
});
