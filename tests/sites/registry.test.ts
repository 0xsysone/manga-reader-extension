import { describe, expect, it, vi } from 'vitest';
import { detectChapter, SITE_ADAPTERS } from '@/sites/registry';
import { urlPage } from '@/sites/images';
import type { Chapter, SiteAdapter } from '@/shared/types';
import { createContext, loadFixture } from './support';

const URL_HERE = 'https://scans.example.com/sakamoto-days-chapter-66/';

function chapterWithTitle(title: string): Chapter {
  return {
    pages: [urlPage('https://cdn.example/1.jpg')],
    confident: true,
    meta: {
      title,
      chapter: '',
      prevUrl: null,
      nextUrl: null,
      prevLabel: null,
      nextLabel: null,
      seriesUrl: null,
    },
  };
}

interface FakeAdapter {
  adapter: SiteAdapter;
  matches: ReturnType<typeof vi.fn>;
  extract: ReturnType<typeof vi.fn>;
}

function fakeAdapter(id: string, isMatch: boolean, chapter: Chapter | null): FakeAdapter {
  const matches = vi.fn(() => isMatch);
  const extract = vi.fn(() => Promise.resolve(chapter));
  return { adapter: { id, matches, extract }, matches, extract };
}

describe('SITE_ADAPTERS', () => {
  it('goes from the most precise adapter to the generic heuristic', () => {
    expect(SITE_ADAPTERS.map((adapter) => adapter.id)).toEqual([
      'mangadex',
      'scan-manga',
      'anime-sama',
      'ts-reader',
      'my-manga-reader',
      'known-readers',
      'heuristic',
    ]);
  });
});

describe('detectChapter', () => {
  it('returns the chapter of the first matching adapter that finds one', async () => {
    const skipped = fakeAdapter('skipped', false, chapterWithTitle('skipped'));
    const empty = fakeAdapter('empty', true, null);
    const found = fakeAdapter('found', true, chapterWithTitle('found'));
    const after = fakeAdapter('after', true, chapterWithTitle('after'));
    const chapter = await detectChapter(
      createContext('', URL_HERE),
      [skipped, empty, found, after].map((fake) => fake.adapter),
    );
    expect(chapter?.meta.title).toBe('found');
    expect(skipped.extract).not.toHaveBeenCalled();
    expect(empty.extract).toHaveBeenCalledOnce();
    expect(after.matches).not.toHaveBeenCalled();
  });

  it('is null when no adapter finds a chapter', async () => {
    expect(
      await detectChapter(createContext('', URL_HERE), [fakeAdapter('empty', true, null).adapter]),
    ).toBeNull();
    expect(await detectChapter(createContext('<p>Hello</p>', URL_HERE))).toBeNull();
  });

  it('lets the theme configuration win over the generic reading container', async () => {
    const chapter = await detectChapter(createContext(loadFixture('ts-reader.html'), URL_HERE));
    expect(chapter?.pages).toHaveLength(3);
    expect(chapter?.meta.prevUrl).toBe('https://scans.example.com/sakamoto-days-chapter-65/');
  });
});
