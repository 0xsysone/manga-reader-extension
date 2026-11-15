import { describe, expect, it } from 'vitest';
import { ANIMATIONS, cycle, DEFAULT_SETTINGS, normalizeSettings, VIEW_MODES } from '@/domain/settings';

describe('DEFAULT_SETTINGS', () => {
  it('opens automatically, reads right to left, in auto double-page mode and dark theme', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      mode: 'auto',
      direction: 'rtl',
      animation: 'flip',
      theme: 'dark',
      firstPageAlone: true,
      autoOpen: true,
    });
  });
});

describe('normalizeSettings', () => {
  it('returns the defaults for missing or non-object input', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('double')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values and ignores invalid ones', () => {
    const settings = normalizeSettings({
      mode: 'double',
      direction: 'zz',
      theme: 'light',
      autoOpen: false,
      firstPageAlone: 'x',
    });
    expect(settings).toEqual({
      mode: 'double',
      direction: 'rtl',
      animation: 'flip',
      theme: 'light',
      firstPageAlone: true,
      autoOpen: false,
    });
  });

  it('returns a fresh object, never the frozen defaults', () => {
    const settings = normalizeSettings(null);
    expect(settings).not.toBe(DEFAULT_SETTINGS);
    expect(Object.isFrozen(settings)).toBe(false);
  });
});

describe('cycle', () => {
  it('walks view modes and animations, wrapping around', () => {
    expect(cycle(VIEW_MODES, 'auto')).toBe('double');
    expect(cycle(VIEW_MODES, 'double')).toBe('single');
    expect(cycle(VIEW_MODES, 'single')).toBe('auto');
    expect(cycle(ANIMATIONS, 'none')).toBe('flip');
  });

  it('starts from the first value when the current one is not listed', () => {
    expect(cycle(['a', 'b'], 'z')).toBe('a');
  });

  it('keeps the value of an empty list', () => {
    expect(cycle([], 'a')).toBe('a');
  });
});
