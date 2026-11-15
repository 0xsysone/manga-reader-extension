import { describe, expect, it } from 'vitest';
import { pickImageGroup, resolveImageSrc, type ImageCandidate } from '@/sites/images';

describe('resolveImageSrc', () => {
  const base = 'https://site.io/manga/ch-1/';

  it('prefers lazy-loading attributes and skips placeholders', () => {
    expect(resolveImageSrc({ src: 'data:image/gif;base64,AAA', 'data-src': ' /img/01.jpg ' }, base)).toBe(
      'https://site.io/img/01.jpg',
    );
    expect(resolveImageSrc({ 'data-lazy-src': 'p2.webp', src: 'loading.gif' }, base)).toBe(
      'https://site.io/manga/ch-1/p2.webp',
    );
    expect(
      resolveImageSrc({ 'data-src': 'https://site.io/wp/lazy-load.svg', src: 'https://cdn.io/3.png' }, base),
    ).toBe('https://cdn.io/3.png');
  });

  it('takes the first srcset candidate', () => {
    expect(resolveImageSrc({ srcset: 'https://cdn.io/a.jpg 1x, https://cdn.io/a@2x.jpg 2x' }, base)).toBe(
      'https://cdn.io/a.jpg',
    );
  });

  it('is null without a valid http(s) URL', () => {
    expect(resolveImageSrc({ src: 'javascript:alert(1)' }, base)).toBeNull();
    expect(resolveImageSrc({ src: 'http://[bad' }, base)).toBeNull();
    expect(resolveImageSrc({ src: '   ' }, base)).toBeNull();
    expect(resolveImageSrc({}, base)).toBeNull();
  });
});

describe('pickImageGroup', () => {
  const candidate = (src: string, group: number, extra: Partial<ImageCandidate> = {}): ImageCandidate => ({
    src,
    group,
    displayedWidth: 800,
    ...extra,
  });
  const threeOf = (extra: Partial<ImageCandidate>): ImageCandidate[] =>
    ['1', '2', '3'].map((src) => candidate(src, 1, extra));

  it('keeps the largest group of big images, without duplicates', () => {
    const candidates = [
      candidate('logo.png', 0, { displayedWidth: 200 }),
      candidate('a.jpg', 1),
      candidate('b.jpg', 1),
      candidate('a.jpg', 1),
      candidate('c.jpg', 1),
      candidate('x.jpg', 2),
      candidate('y.jpg', 2),
    ];
    expect(pickImageGroup(candidates, 1440)).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
  });

  it('excludes covers, banners and webtoon strips, and needs three pages', () => {
    const covers = ['1', '2', '3', '4'].map((src) =>
      candidate(src, 1, { displayedWidth: 180, naturalWidth: 600, naturalHeight: 900 }),
    );
    expect(pickImageGroup(covers, 1440)).toEqual([]);
    expect(
      pickImageGroup(threeOf({ displayedWidth: 728, naturalWidth: 728, naturalHeight: 90 }), 1440),
    ).toEqual([]);
    expect(pickImageGroup(threeOf({ naturalWidth: 800, naturalHeight: 8000 }), 1440)).toEqual([]);
    expect(pickImageGroup(threeOf({}).slice(0, 2), 1440)).toEqual([]);
  });

  it('uses the natural or declared width of images not displayed yet; landscape spreads pass', () => {
    const lazy = [
      candidate('p1', 3, { displayedWidth: 0, declaredWidth: 900 }),
      candidate('p2', 3, { displayedWidth: 0, naturalWidth: 1600, naturalHeight: 1100 }),
      candidate('p3', 3, { displayedWidth: 0, naturalWidth: 800, naturalHeight: 1200 }),
    ];
    expect(pickImageGroup(lazy, 1440)).toEqual(['p1', 'p2', 'p3']);
  });

  it('requires 40 % of the viewport width, capped at 480 px', () => {
    expect(pickImageGroup(threeOf({ displayedWidth: 400 }), 1000)).toEqual(['1', '2', '3']);
    expect(pickImageGroup(threeOf({ displayedWidth: 399 }), 1000)).toEqual([]);
    expect(pickImageGroup(threeOf({ displayedWidth: 480 }), 3000)).toEqual(['1', '2', '3']);
    expect(pickImageGroup(threeOf({ displayedWidth: 479 }), 3000)).toEqual([]);
  });

  it('accepts ratios 0.25 and 2.2 exactly, and unknown heights', () => {
    expect(pickImageGroup(threeOf({ naturalWidth: 220, naturalHeight: 100 }), 1440)).toEqual(['1', '2', '3']);
    expect(pickImageGroup(threeOf({ naturalWidth: 250, naturalHeight: 1000 }), 1440)).toEqual([
      '1',
      '2',
      '3',
    ]);
    expect(pickImageGroup(threeOf({ naturalWidth: 221, naturalHeight: 100 }), 1440)).toEqual([]);
    expect(pickImageGroup(threeOf({ naturalWidth: 249, naturalHeight: 1000 }), 1440)).toEqual([]);
    expect(pickImageGroup(threeOf({ naturalWidth: 800, naturalHeight: 0 }), 1440)).toEqual(['1', '2', '3']);
  });

  it('assumes a 1280 px viewport (480 px threshold) when the width is unknown', () => {
    expect(pickImageGroup(threeOf({ displayedWidth: 480 }), 0)).toEqual(['1', '2', '3']);
    expect(pickImageGroup(threeOf({ displayedWidth: 479 }), 0)).toEqual([]);
  });

  it('keeps the first group met on a tie', () => {
    const tie = [
      ...['a', 'b', 'c'].map((src) => candidate(src, 1)),
      ...['x', 'y', 'z'].map((src) => candidate(src, 2)),
    ];
    expect(pickImageGroup(tie, 1440)).toEqual(['a', 'b', 'c']);
  });
});
