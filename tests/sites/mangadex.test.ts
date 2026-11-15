import { describe, expect, it, vi } from 'vitest';
import { MANGADEX_API, mangadexAdapter } from '@/sites/mangadex';
import { createContext, pageUrls } from './support';

const CHAPTER_ID = '0b5b9b3e-9b8e-4f5a-8b2c-1c2d3e4f5a6b';
const MANGA_ID = 'a1b2c3d4-0000-4000-8000-000000000001';
const URL_HERE = `https://mangadex.org/chapter/${CHAPTER_ID}/1`;

const responses: Record<string, unknown> = {
  [`${MANGADEX_API}/at-home/server/${CHAPTER_ID}`]: {
    baseUrl: 'https://uploads.mangadex.org',
    chapter: { hash: 'abc', data: ['1.png', '2.png'], dataSaver: ['1.jpg', '2.jpg'] },
  },
  [`${MANGADEX_API}/chapter/${CHAPTER_ID}?includes[]=manga`]: {
    data: {
      attributes: { chapter: '10', translatedLanguage: 'pt-br' },
      relationships: [
        { type: 'scanlation_group', id: 'g' },
        { type: 'manga', id: MANGA_ID, attributes: { title: { 'ja-ro': 'Kaiju 8-gou', fr: 'Kaiju n°8' } } },
      ],
    },
  },
  [`${MANGADEX_API}/manga/${MANGA_ID}/aggregate?translatedLanguage[]=pt-br`]: {
    volumes: {
      1: {
        chapters: {
          9: { chapter: '9', id: 'prev-id' },
          10: { chapter: '10', id: CHAPTER_ID },
          11: { chapter: '11', id: 'next-id' },
        },
      },
    },
  },
};

function fakeFetchJson(table: Record<string, unknown>) {
  return vi.fn((url: string) =>
    url in table ? Promise.resolve(table[url]) : Promise.reject(new Error(url)),
  );
}

describe('mangadexAdapter', () => {
  it('matches chapter pages of mangadex.org only', () => {
    expect(mangadexAdapter.matches(createContext('', URL_HERE))).toBe(true);
    expect(mangadexAdapter.matches(createContext('', `https://www.mangadex.org/chapter/${CHAPTER_ID}`))).toBe(
      true,
    );
    expect(mangadexAdapter.matches(createContext('', `https://mangadex.org/title/${MANGA_ID}`))).toBe(false);
    expect(mangadexAdapter.matches(createContext('', `https://notmangadex.org/chapter/${CHAPTER_ID}`))).toBe(
      false,
    );
  });

  it('reads pages, title and neighbours through fetchJson', async () => {
    const fetchJson = fakeFetchJson(responses);
    const chapter = await mangadexAdapter.extract(createContext('', URL_HERE, { fetchJson }));
    expect(pageUrls(chapter)).toEqual([
      'https://uploads.mangadex.org/data/abc/1.png',
      'https://uploads.mangadex.org/data/abc/2.png',
    ]);
    expect(chapter?.meta).toEqual({
      title: 'Kaiju 8-gou',
      chapter: '10',
      prevUrl: 'https://mangadex.org/chapter/prev-id',
      nextUrl: 'https://mangadex.org/chapter/next-id',
      prevLabel: '9',
      nextLabel: '11',
      seriesUrl: `https://mangadex.org/title/${MANGA_ID}`,
    });
    expect(fetchJson).toHaveBeenCalledTimes(3);
  });

  it('still opens the chapter when the metadata requests fail', async () => {
    const atHomeUrl = `${MANGADEX_API}/at-home/server/${CHAPTER_ID}`;
    const fetchJson = fakeFetchJson({ [atHomeUrl]: responses[atHomeUrl] });
    const chapter = await mangadexAdapter.extract(
      createContext('<title>Kaiju No. 8 10</title>', URL_HERE, { fetchJson }),
    );
    expect(pageUrls(chapter)).toHaveLength(2);
    expect(chapter?.meta).toMatchObject({
      title: 'Kaiju No. 8',
      chapter: '10',
      prevUrl: null,
      nextUrl: null,
      seriesUrl: null,
    });
    expect(fetchJson).toHaveBeenCalledTimes(2);
  });

  it('finds nothing when the image server does not answer', async () => {
    const fetchJson = fakeFetchJson({});
    expect(await mangadexAdapter.extract(createContext('', URL_HERE, { fetchJson }))).toBeNull();
  });
});
