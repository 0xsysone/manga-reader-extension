import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGE_RATIO, fitPage, referenceRatio, resolveDouble } from '@/domain/layout';

const page = (ratio: number): { ratio: number } => ({ ratio });

describe('referenceRatio', () => {
  it('is the median of the portrait pages', () => {
    expect(referenceRatio([page(0.6), page(0.7), page(2), page(0.8)])).toBe(0.7);
    expect(referenceRatio([page(0.6), page(0.8)])).toBe(0.7);
  });

  it('sorts the ratios before taking the median', () => {
    expect(referenceRatio([page(0.64), page(0.6), page(0.62)])).toBe(0.62);
    expect(referenceRatio([page(0.9), page(0.5), page(0.6)])).toBe(0.6);
    expect(referenceRatio([page(0.66), page(0.5), page(0.58), page(0.6)])).toBe(0.59);
  });

  it('falls back to the default ratio without a known portrait page', () => {
    expect(DEFAULT_PAGE_RATIO).toBe(0.7);
    expect(referenceRatio([])).toBe(0.7);
    expect(referenceRatio([page(1.5), page(0), null, undefined])).toBe(0.7);
  });
});

describe('resolveDouble', () => {
  it('follows forced modes', () => {
    expect(resolveDouble('double', 100, 1000, 0.7)).toBe(true);
    expect(resolveDouble('single', 3000, 1000, 0.7)).toBe(false);
  });

  it('shows two pages from 92 % of their combined width', () => {
    // Two 700 px pages = 1400 px; 92 % = 1288 px.
    expect(resolveDouble('auto', 1288, 1000, 0.7)).toBe(true);
    expect(resolveDouble('auto', 1287, 1000, 0.7)).toBe(false);
  });

  it('assumes the default ratio when the ratio is unknown', () => {
    expect(resolveDouble('auto', 1288, 1000, 0)).toBe(true);
    expect(resolveDouble('auto', 1287, 1000, 0)).toBe(false);
  });
});

describe('fitPage', () => {
  it('fits the height, then shrinks to the width', () => {
    expect(fitPage(2000, 1000, 0.7, 2, 0)).toEqual({ width: 700, height: 1000 });
    expect(fitPage(2000, 1020, 0.7, 2, 10)).toEqual({ width: 700, height: 1000 });
    expect(fitPage(1000, 1000, 0.7, 2, 0)).toEqual({ width: 500, height: 714 });
    expect(fitPage(700, 1000, 0.7, 1, 0)).toEqual({ width: 700, height: 1000 });
    expect(fitPage(699, 1000, 0.7, 1, 0)).toEqual({ width: 699, height: 999 });
  });

  it('defaults to no padding and counts the padding on both sides', () => {
    expect(fitPage(2000, 1000, 0.7, 2)).toEqual({ width: 700, height: 1000 });
    expect(fitPage(1020, 2000, 0.7, 2, 10)).toEqual({ width: 500, height: 714 });
  });

  it('never goes below one pixel of available space', () => {
    expect(fitPage(0, 0, 1, 1, 10)).toEqual({ width: 1, height: 1 });
  });
});
