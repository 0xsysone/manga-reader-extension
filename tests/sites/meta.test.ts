import { describe, expect, it } from 'vitest';
import { buildChapter, inlineScriptsContaining } from '@/sites/meta';
import { urlPage } from '@/sites/images';
import type { InPageNavigation } from '@/shared/types';
import { createContext } from './support';

const URL_HERE = 'https://scans.example/manga/blue-lock/chapter-200/';
const PAGES = [urlPage('https://cdn.example/1.jpg')];

describe('buildChapter', () => {
  it('is null without pages', () => {
    expect(buildChapter(createContext('', URL_HERE), { pages: [] })).toBeNull();
  });

  it('completes title and chapter from the heading, and defaults to a confident start on page 0', () => {
    const context = createContext('<title>Doc title 1</title><h1> Blue Lock  Chapitre 200 </h1>', URL_HERE);
    expect(buildChapter(context, { pages: PAGES })).toEqual({
      pages: PAGES,
      confident: true,
      startPage: 0,
      meta: {
        title: 'Blue Lock',
        chapter: '200',
        prevUrl: null,
        nextUrl: null,
        prevLabel: null,
        nextLabel: null,
        seriesUrl: null,
      },
    });
  });

  it('falls back to the document title when the heading is empty', () => {
    const context = createContext('<title>Blue Lock 201</title><h1>  </h1>', URL_HERE);
    expect(buildChapter(context, { pages: PAGES })?.meta).toMatchObject({
      title: 'Blue Lock',
      chapter: '201',
    });
  });

  it('prefers the series link for the title and the series URL, same site only', () => {
    const html =
      '<h1>Blue Lock 200</h1><div class="allc"><a href="/manga/blue-lock/">Blue Lock (series)</a></div>';
    expect(buildChapter(createContext(html, URL_HERE), { pages: PAGES })?.meta).toMatchObject({
      title: 'Blue Lock (series)',
      seriesUrl: 'https://scans.example/manga/blue-lock/',
    });
    const foreign = html.replace('/manga/blue-lock/', 'https://other.example/blue-lock/');
    expect(buildChapter(createContext(foreign, URL_HERE), { pages: PAGES })?.meta.seriesUrl).toBeNull();
  });

  it('keeps what the adapter found, treating empty strings as missing', () => {
    const inPage: InPageNavigation = { go: () => Promise.resolve(true) };
    const chapter = buildChapter(createContext('<h1>Blue Lock 200</h1>', URL_HERE), {
      pages: PAGES,
      confident: false,
      startPage: 4,
      inPage,
      title: 'Given title',
      chapter: '',
      prevUrl: '',
      nextUrl: 'https://scans.example/next',
      prevLabel: '199',
      nextLabel: '201',
      seriesUrl: 'https://scans.example/series',
    });
    expect(chapter).toEqual({
      pages: PAGES,
      confident: false,
      startPage: 4,
      inPage,
      meta: {
        title: 'Given title',
        chapter: '200',
        prevUrl: null,
        nextUrl: 'https://scans.example/next',
        prevLabel: '199',
        nextLabel: '201',
        seriesUrl: 'https://scans.example/series',
      },
    });
  });
});

describe('inlineScriptsContaining', () => {
  it('returns the inline scripts holding the marker', () => {
    const html = '<script src="/a.js">marker</script><script>var marker = 1;</script><script>other</script>';
    expect(inlineScriptsContaining(createContext(html, URL_HERE).document, 'marker')).toEqual([
      'var marker = 1;',
    ]);
  });
});
