import type { Direction } from '@/shared/types';
import type { Book } from '../book';
import { settle } from './settle';
import { FADE_IN_EXTRA_MS, FADE_MS, NUDGE_DISTANCE, NUDGE_EASE, NUDGE_MS, OUT_EASE } from './timing';

/** Share of the viewport width a slide travels, capped at {@link SLIDE_MAX_DISTANCE}. */
const SLIDE_DISTANCE_SHARE = 0.16;
const SLIDE_MAX_DISTANCE = 240;
/** Scale of the spreads sliding in or out. */
const SLIDE_SCALE = 0.965;
/** Scales of the outgoing and incoming spreads of a crossfade. */
const FADE_OUT_SCALE = 0.985;
const FADE_IN_SCALE = 1.015;

const shifted = (book: Book, x: number, scale: number): string =>
  `translateX(${book.shift + x}px) scale(${scale})`;

export interface SlideOptions {
  container: HTMLElement;
  oldBook: Book;
  newBook: Book;
  direction: Direction;
  forward: boolean;
  duration: number;
  viewportWidth: number;
  signal: AbortSignal;
}

/** The current spread slides out while the next one slides in. `oldBook` is destroyed afterwards. */
export async function slide(options: SlideOptions): Promise<void> {
  const { container, oldBook, newBook, direction, forward, duration, viewportWidth, signal } = options;
  // Right-to-left: moving forward slides the content toward the right.
  const sign = (direction === 'rtl') === forward ? 1 : -1;
  const distance = Math.min(viewportWidth * SLIDE_DISTANCE_SHARE, SLIDE_MAX_DISTANCE);
  container.append(newBook.element);
  const timing: KeyframeAnimationOptions = { duration, easing: OUT_EASE };
  await settle(
    [
      oldBook.element.animate(
        [
          { transform: shifted(oldBook, 0, 1), opacity: 1 },
          { transform: shifted(oldBook, sign * distance, SLIDE_SCALE), opacity: 0 },
        ],
        { ...timing, fill: 'forwards' },
      ),
      newBook.element.animate(
        [
          { transform: shifted(newBook, -sign * distance, SLIDE_SCALE), opacity: 0 },
          { transform: shifted(newBook, 0, 1), opacity: 1 },
        ],
        timing,
      ),
    ],
    signal,
  );
  if (signal.aborted) return;
  oldBook.destroy();
}

export interface CrossfadeOptions {
  container: HTMLElement;
  oldBook: Book | null;
  newBook: Book;
  /** Opacity only, no scaling. */
  reduceMotion: boolean;
  signal: AbortSignal;
}

/** The current spread fades out while the new one fades in. `oldBook` is destroyed afterwards. */
export async function crossfade(options: CrossfadeOptions): Promise<void> {
  const { container, oldBook, newBook, reduceMotion, signal } = options;
  container.append(newBook.element);
  const frame = (book: Book, opacity: number, scale: number): Keyframe => ({
    opacity,
    transform: shifted(book, 0, reduceMotion ? 1 : scale),
  });
  const animations = [
    newBook.element.animate([frame(newBook, 0, FADE_IN_SCALE), frame(newBook, 1, 1)], {
      duration: FADE_MS + FADE_IN_EXTRA_MS,
      easing: OUT_EASE,
    }),
  ];
  if (oldBook) {
    animations.push(
      oldBook.element.animate([frame(oldBook, 1, 1), frame(oldBook, 0, FADE_OUT_SCALE)], {
        duration: FADE_MS,
        easing: 'ease-out',
        fill: 'forwards',
      }),
    );
  }
  await settle(animations, signal);
  if (signal.aborted) return;
  oldBook?.destroy();
}

/** Elastic resistance when trying to turn past the start or the end of the chapter. */
export function nudge(book: Book, edge: 'start' | 'end', direction: Direction): Animation {
  const sign = (edge === 'end') === (direction === 'rtl') ? 1 : -1;
  const x = book.shift;
  return book.element.animate(
    [
      { transform: `translateX(${x}px)` },
      { transform: `translateX(${x + sign * NUDGE_DISTANCE}px)`, offset: 0.3 },
      { transform: `translateX(${x}px)` },
    ],
    { duration: NUDGE_MS, easing: NUDGE_EASE },
  );
}
