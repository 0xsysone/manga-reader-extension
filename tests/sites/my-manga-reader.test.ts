import { describe, expect, it } from 'vitest';
import { myMangaReaderAdapter } from '@/sites/my-manga-reader';
import { createContext, loadFixture, pageUrls } from './support';

const URL_HERE = 'https://www.scan-vf.example/one_piece/chapitre-1198/4';
const FOLDER = 'https://www.scan-vf.example/uploads/manga/one_piece/chapters/chapitre-1198/';

describe('myMangaReaderAdapter', () => {
  const context = createContext(loadFixture('my-manga-reader.html'), URL_HERE);

  it('matches pages declaring var pages', () => {
    expect(myMangaReaderAdapter.matches(context)).toBe(true);
    expect(myMangaReaderAdapter.matches(createContext('<p>none</p>', URL_HERE))).toBe(false);
  });

  it('resolves the pages against the shown image and opens on the current page', async () => {
    const chapter = await myMangaReaderAdapter.extract(context);
    expect(pageUrls(chapter)).toEqual([
      `${FOLDER}01.webp`,
      `${FOLDER}02.webp`,
      'https://cdn.example.net/x.jpg',
      `${FOLDER}04.webp`,
    ]);
    expect(chapter?.startPage).toBe(3);
    expect(chapter?.confident).toBe(true);
  });

  it('strips the page number from the neighbours and reads the "#" title format', async () => {
    const chapter = await myMangaReaderAdapter.extract(context);
    expect(chapter?.meta).toMatchObject({
      title: 'One Piece',
      chapter: '1198',
      prevUrl: 'https://www.scan-vf.example/one_piece/chapitre-1197',
      nextUrl: null,
    });
  });

  it('drops neighbours on another site', async () => {
    const html = loadFixture('my-manga-reader.html').replace(
      'var next_chapter = ""',
      'var next_chapter = "https://evil.example/one_piece/chapitre-1199/1"',
    );
    const chapter = await myMangaReaderAdapter.extract(createContext(html, URL_HERE));
    expect(chapter?.meta.nextUrl).toBeNull();
  });

  it('finds nothing without a shown image to resolve the pages against', async () => {
    const html = '<script>var pages = [{"page_image":"01.webp"}];</script>';
    expect(await myMangaReaderAdapter.extract(createContext(html, URL_HERE))).toBeNull();
  });
});
