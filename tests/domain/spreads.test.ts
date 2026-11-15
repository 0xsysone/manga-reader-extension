import { describe, expect, it } from 'vitest';
import {
  buildSpreads,
  isWide,
  spreadIndexForPage,
  spreadLabel,
  spreadShift,
  spreadSides,
  turningSide,
  type HasRatio,
} from '@/domain/spreads';
import type { Spread } from '@/shared/types';

const PORTRAIT = 0.64;
const LANDSCAPE = 1.3;
const page = (ratio: number): HasRatio => ({ ratio });
const portraits = (count: number): HasRatio[] => Array.from({ length: count }, () => page(PORTRAIT));
const layout = (spreads: Spread[]): (string | number)[][] =>
  spreads.map((spread) => [spread.kind, ...spread.pages]);

describe('isWide', () => {
  it('is true for strictly landscape images only', () => {
    expect(isWide(page(1.4))).toBe(true);
    expect(isWide(page(1))).toBe(false);
    expect(isWide(page(1.0001))).toBe(true);
    expect(isWide(page(PORTRAIT))).toBe(false);
    expect(isWide(null)).toBe(false);
    expect(isWide(undefined)).toBe(false);
  });
});

describe('buildSpreads', () => {
  it('gives one spread per page in single mode', () => {
    expect(layout(buildSpreads(portraits(3), { double: false }))).toEqual([
      ['single', 0],
      ['single', 1],
      ['single', 2],
    ]);
  });

  it('shows the cover alone then completes the last pair for an odd page count', () => {
    expect(layout(buildSpreads(portraits(5), { double: true }))).toEqual([
      ['lead', 0],
      ['pair', 1, 2],
      ['pair', 3, 4],
    ]);
  });

  it('leaves the last page alone (trail) for an even page count', () => {
    expect(layout(buildSpreads(portraits(4), { double: true }))).toEqual([
      ['lead', 0],
      ['pair', 1, 2],
      ['trail', 3],
    ]);
  });

  it('pairs from the first page when the cover is not alone', () => {
    expect(layout(buildSpreads(portraits(4), { double: true, firstPageAlone: false }))).toEqual([
      ['pair', 0, 1],
      ['pair', 2, 3],
    ]);
  });

  it('isolates a wide image and leaves the orphan page before it as a lead', () => {
    const pages = [page(PORTRAIT), page(PORTRAIT), page(LANDSCAPE), page(PORTRAIT), page(PORTRAIT)];
    expect(layout(buildSpreads(pages, { double: true }))).toEqual([
      ['lead', 0],
      ['lead', 1],
      ['wide', 2],
      ['pair', 3, 4],
    ]);
  });

  it('never shows a wide first page as a lone cover', () => {
    const pages = [page(LANDSCAPE), page(PORTRAIT), page(PORTRAIT)];
    expect(layout(buildSpreads(pages, { double: true }))).toEqual([
      ['wide', 0],
      ['pair', 1, 2],
    ]);
  });

  it('handles empty and one-page chapters', () => {
    expect(buildSpreads([], { double: true })).toEqual([]);
    expect(layout(buildSpreads(portraits(1), { double: true }))).toEqual([['lead', 0]]);
  });
});

describe('spreadIndexForPage', () => {
  const spreads = buildSpreads(portraits(5), { double: true });

  it('finds the spread holding a page', () => {
    expect(spreadIndexForPage(spreads, 0)).toBe(0);
    expect(spreadIndexForPage(spreads, 2)).toBe(1);
    expect(spreadIndexForPage(spreads, 3)).toBe(2);
  });

  it('falls back to the first spread for an unknown page', () => {
    expect(spreadIndexForPage(spreads, 99)).toBe(0);
  });
});

describe('spreadSides', () => {
  it('puts the first page of a pair on the right in right-to-left reading', () => {
    expect(spreadSides({ kind: 'pair', pages: [3, 4] }, 'rtl')).toEqual({
      left: { page: 4, part: 'full' },
      right: { page: 3, part: 'full' },
    });
    expect(spreadSides({ kind: 'pair', pages: [3, 4] }, 'ltr')).toEqual({
      left: { page: 3, part: 'full' },
      right: { page: 4, part: 'full' },
    });
  });

  it('splits a wide page across both sides', () => {
    expect(spreadSides({ kind: 'wide', pages: [2] }, 'rtl')).toEqual({
      left: { page: 2, part: 'left' },
      right: { page: 2, part: 'right' },
    });
  });

  it('puts a lead page on the side that turns forward', () => {
    expect(spreadSides({ kind: 'lead', pages: [0] }, 'rtl')).toEqual({
      left: { page: 0, part: 'full' },
      right: null,
    });
    expect(spreadSides({ kind: 'lead', pages: [0] }, 'ltr')).toEqual({
      left: null,
      right: { page: 0, part: 'full' },
    });
  });

  it('puts a trail page on the side read first', () => {
    expect(spreadSides({ kind: 'trail', pages: [9] }, 'rtl')).toEqual({
      left: null,
      right: { page: 9, part: 'full' },
    });
    expect(spreadSides({ kind: 'trail', pages: [9] }, 'ltr')).toEqual({
      left: { page: 9, part: 'full' },
      right: null,
    });
  });

  it('shows nothing for a single-mode or empty spread', () => {
    expect(spreadSides({ kind: 'single', pages: [1] }, 'rtl')).toEqual({ left: null, right: null });
    expect(spreadSides({ kind: 'wide', pages: [] }, 'rtl')).toEqual({ left: null, right: null });
  });
});

describe('spreadShift', () => {
  const slice = { page: 0, part: 'full' } as const;

  it('centres a lone page and leaves full or empty spreads in place', () => {
    expect(spreadShift({ left: slice, right: null })).toBe(0.5);
    expect(spreadShift({ left: null, right: slice })).toBe(-0.5);
    expect(spreadShift({ left: slice, right: slice })).toBe(0);
    expect(spreadShift({ left: null, right: null })).toBe(0);
  });
});

describe('turningSide', () => {
  it('turns the left page to go forward in right-to-left reading', () => {
    expect(turningSide('rtl', true)).toBe('left');
    expect(turningSide('rtl', false)).toBe('right');
    expect(turningSide('ltr', true)).toBe('right');
    expect(turningSide('ltr', false)).toBe('left');
  });
});

describe('spreadLabel', () => {
  it('shows the 1-based page range over the total', () => {
    expect(spreadLabel({ kind: 'pair', pages: [4, 3] }, 19)).toBe('4–5 / 19');
    expect(spreadLabel({ kind: 'lead', pages: [0] }, 19)).toBe('1 / 19');
    expect(spreadLabel(undefined, 19)).toBe('0 / 19');
    expect(spreadLabel(null, 19)).toBe('0 / 19');
  });
});
