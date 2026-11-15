/** Durations (ms) and easings of the reader's motion. */

/** A full page turn. */
export const FLIP_MS = 820;
/** Chained page turns (key held down, several presses queued). */
export const FLIP_FAST_MS = 360;
/** Single-page turns are a little shorter than double-page ones. */
export const SINGLE_FLIP_FACTOR = 0.85;
export const SLIDE_MS = 480;
/** Chained slides are shortened by this factor. */
export const SLIDE_FAST_FACTOR = 0.6;
export const FADE_MS = 260;
/** The incoming spread of a crossfade lasts a little longer than the outgoing one. */
export const FADE_IN_EXTRA_MS = 60;
export const NUDGE_MS = 420;
/** Distance (px) of the elastic bump at the start or end of a chapter. */
export const NUDGE_DISTANCE = 14;

/** Extra time given to an animation before it is force-finished (frozen timeline in a background tab). */
export const SETTLE_GUARD_MS = 250;

export const FLIP_EASE = 'cubic-bezier(.5, .04, .24, 1)';
export const BOOK_SHIFT_EASE = 'cubic-bezier(.45, 0, .2, 1)';
export const OUT_EASE = 'cubic-bezier(.16, 1, .3, 1)';
export const LIFT_EASE = 'cubic-bezier(.55, .02, .75, .45)';
export const DROP_EASE = 'cubic-bezier(.2, .55, .3, 1)';
export const NUDGE_EASE = 'cubic-bezier(.3, .7, .4, 1)';
