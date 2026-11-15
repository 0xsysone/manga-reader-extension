import type { AnimationKind, Direction, Settings, Theme, ViewMode } from '@/shared/types';
import { isRecord } from './guards';

/** Settings used when nothing (or nothing valid) is stored. */
export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  mode: 'auto',
  direction: 'rtl',
  animation: 'flip',
  theme: 'dark',
  firstPageAlone: true,
  autoOpen: true,
});

/** View modes, in the order the "cycle mode" action walks through them. */
export const VIEW_MODES: readonly ViewMode[] = ['auto', 'double', 'single'];

/** Page-turn animations, in the order the "cycle animation" action walks through them. */
export const ANIMATIONS: readonly AnimationKind[] = ['flip', 'slide', 'none'];

const DIRECTIONS: readonly Direction[] = ['rtl', 'ltr'];
const THEMES: readonly Theme[] = ['dark', 'light'];

function pickAllowed<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return allowed.find((candidate) => candidate === value) ?? fallback;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Merges stored settings over the defaults, ignoring missing or invalid values. */
export function normalizeSettings(raw: unknown): Settings {
  if (!isRecord(raw)) return { ...DEFAULT_SETTINGS };
  return {
    mode: pickAllowed(VIEW_MODES, raw.mode, DEFAULT_SETTINGS.mode),
    direction: pickAllowed(DIRECTIONS, raw.direction, DEFAULT_SETTINGS.direction),
    animation: pickAllowed(ANIMATIONS, raw.animation, DEFAULT_SETTINGS.animation),
    theme: pickAllowed(THEMES, raw.theme, DEFAULT_SETTINGS.theme),
    firstPageAlone: pickBoolean(raw.firstPageAlone, DEFAULT_SETTINGS.firstPageAlone),
    autoOpen: pickBoolean(raw.autoOpen, DEFAULT_SETTINGS.autoOpen),
  };
}

/** The value that follows `value` in `list`, wrapping around; the first one when `value` is not listed. */
export function cycle<T>(list: readonly T[], value: T): T {
  const next = list[(list.indexOf(value) + 1) % list.length];
  return next ?? value;
}
