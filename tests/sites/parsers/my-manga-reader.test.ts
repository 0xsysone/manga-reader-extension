import { describe, expect, it } from 'vitest';
import { myMangaReaderUrls, parseMyMangaReader, stripPageSuffix } from '@/sites/parsers/my-manga-reader';

describe('parseMyMangaReader', () => {
  it('reads the pages, the neighbour chapters and the current page', () => {
    const script =
      ' var title = document.title; var pages = [{"page_image":"01.webp","page_slug":1,"external":0},{"page_image":" https://cdn.io/x.jpg ","page_slug":2,"external":"1"},{"page_image":"","external":0},null]; var next_chapter = "" ; var prev_chapter = "https://www.scan-vf.net/one_piece/chapitre-1197/15" ; var current_page = 4;';
    expect(parseMyMangaReader(script)).toEqual({
      pages: [
        { image: '01.webp', external: false },
        { image: 'https://cdn.io/x.jpg', external: true },
      ],
      nextUrl: null,
      prevUrl: 'https://www.scan-vf.net/one_piece/chapitre-1197/15',
      currentPage: 4,
    });
  });

  it('is null without pages', () => {
    expect(parseMyMangaReader('var pages = [];')).toBeNull();
    expect(parseMyMangaReader('var other = 1;')).toBeNull();
  });

  it('starts on page 1 when the current page is missing or zero', () => {
    expect(
      parseMyMangaReader('var pages = [{"page_image":"a.jpg"}]; var current_page = 0;')?.currentPage,
    ).toBe(1);
    expect(parseMyMangaReader('var pages = [{"page_image":"a.jpg"}];')?.currentPage).toBe(1);
  });
});

describe('myMangaReaderUrls', () => {
  const pages = [
    { image: '01.webp', external: false },
    { image: 'https://cdn.io/x.jpg', external: true },
    { image: 'javascript:alert(1)', external: true },
  ];

  it('resolves pages against the shown image folder and keeps external ones', () => {
    expect(
      myMangaReaderUrls(
        pages,
        ' https://www.scan-vf.net/uploads/manga/one_piece/chapters/chapitre-1198/01.webp ',
      ),
    ).toEqual([
      'https://www.scan-vf.net/uploads/manga/one_piece/chapters/chapitre-1198/01.webp',
      'https://cdn.io/x.jpg',
    ]);
  });

  it('is empty without a shown image or pages', () => {
    expect(myMangaReaderUrls(pages, '')).toEqual([]);
    expect(myMangaReaderUrls(pages, null)).toEqual([]);
    expect(myMangaReaderUrls([], 'https://a.io/b/c.jpg')).toEqual([]);
  });
});

describe('stripPageSuffix', () => {
  it('drops a trailing page number after a named segment', () => {
    expect(stripPageSuffix('https://www.scan-vf.net/one_piece/chapitre-1197/15')).toBe(
      'https://www.scan-vf.net/one_piece/chapitre-1197',
    );
    expect(stripPageSuffix('https://s.io/manga/chapitre-12/3/')).toBe('https://s.io/manga/chapitre-12');
    expect(stripPageSuffix('https://s.io/manga/one-piece/1198')).toBe('https://s.io/manga/one-piece');
  });

  it('keeps numeric identifiers and URLs without a page number', () => {
    expect(stripPageSuffix('https://s.io/chapter/1234/5678')).toBe('https://s.io/chapter/1234/5678');
    expect(stripPageSuffix('https://s.io/manga/chapitre-12')).toBe('https://s.io/manga/chapitre-12');
  });

  it('is null for an invalid URL', () => {
    expect(stripPageSuffix('not a url')).toBeNull();
  });
});
