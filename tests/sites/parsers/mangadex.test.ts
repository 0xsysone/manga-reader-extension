import { describe, expect, it } from 'vitest';
import { mangadexImageUrls, mangadexNeighbours } from '@/sites/parsers/mangadex';

describe('mangadexImageUrls', () => {
  const atHome = {
    baseUrl: 'https://node.mangadex.network',
    chapter: { hash: 'h1', data: ['1.png', '', 2, '2.png'], dataSaver: ['1.jpg'] },
  };

  it('builds full-quality or data-saver URLs', () => {
    expect(mangadexImageUrls(atHome)).toEqual([
      'https://node.mangadex.network/data/h1/1.png',
      'https://node.mangadex.network/data/h1/2.png',
    ]);
    expect(mangadexImageUrls(atHome, 'data-saver')).toEqual([
      'https://node.mangadex.network/data-saver/h1/1.jpg',
    ]);
  });

  it('is empty for incomplete responses', () => {
    expect(mangadexImageUrls({ baseUrl: 'x', chapter: {} })).toEqual([]);
    expect(mangadexImageUrls(null)).toEqual([]);
    expect(mangadexImageUrls({ chapter: { hash: 'h', data: [] } })).toEqual([]);
  });
});

describe('mangadexNeighbours', () => {
  const aggregate = {
    volumes: {
      2: {
        chapters: {
          11: { chapter: '11', id: 'c11', others: [] },
          '10.5': { chapter: '10.5', id: 'c105', others: ['c105b'] },
        },
      },
      1: { chapters: { 10: { chapter: '10', id: 'c10', others: ['c10b'] }, 9: { chapter: '9', id: 'c9' } } },
      none: { chapters: { none: { chapter: 'none', id: 'oneshot' } } },
    },
  };

  it('sorts numerically and recognizes alternative uploads', () => {
    expect(mangadexNeighbours(aggregate, 'c10b')).toEqual({
      prev: { id: 'c9', chapter: '9' },
      next: { id: 'c105', chapter: '10.5' },
    });
  });

  it('has no neighbour past either end, and puts unnumbered chapters last', () => {
    expect(mangadexNeighbours(aggregate, 'c9')).toEqual({ prev: null, next: { id: 'c10', chapter: '10' } });
    expect(mangadexNeighbours(aggregate, 'c11')).toEqual({
      prev: { id: 'c105', chapter: '10.5' },
      next: { id: 'oneshot', chapter: 'none' },
    });
  });

  it('finds nothing for an unknown chapter or an invalid response', () => {
    expect(mangadexNeighbours(aggregate, 'unknown')).toEqual({ prev: null, next: null });
    expect(mangadexNeighbours(null, 'c9')).toEqual({ prev: null, next: null });
  });

  it('skips unavailable chapters', () => {
    const withGap = {
      volumes: {
        1: {
          chapters: {
            1: { chapter: '1', id: 'a' },
            2: { chapter: '2', id: 'b', isUnavailable: true },
            3: { chapter: '3', id: 'c' },
          },
        },
      },
    };
    expect(mangadexNeighbours(withGap, 'a')).toEqual({ prev: null, next: { id: 'c', chapter: '3' } });
  });
});
