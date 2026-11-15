import type { Direction, ReaderAction } from '@/shared/types';

/** The parts of a keyboard event that decide the action (a `KeyboardEvent` fits). */
export interface KeyPress {
  key: string;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}

/** Click zones, as a share of the screen width from the left: left side, middle (toggles the UI), right side. */
const LEFT_ZONE_END = 0.38;
const RIGHT_ZONE_START = 0.62;

/** Shortest horizontal swipe, in pixels, that turns a page. */
const MIN_SWIPE_DISTANCE = 40;
/** A swipe must be this many times more horizontal than vertical. */
const SWIPE_HORIZONTAL_DOMINANCE = 1.3;

/** Keys whose action does not depend on the reading direction (letters are matched case-insensitively). */
const FIXED_KEYS: ReadonlyMap<string, ReaderAction> = new Map<string, ReaderAction>([
  ['PageDown', 'next'],
  ['ArrowDown', 'next'],
  ['PageUp', 'prev'],
  ['ArrowUp', 'prev'],
  ['Home', 'first'],
  ['End', 'last'],
  ['Escape', 'close'],
  ['d', 'cycleMode'],
  ['m', 'toggleTheme'],
  ['t', 'toggleTheme'],
  ['s', 'toggleDirection'],
  ['o', 'toggleOffset'],
  ['a', 'cycleAnimation'],
  ['f', 'fullscreen'],
  ['z', 'zoom'],
  ['n', 'nextChapter'],
  ['p', 'prevChapter'],
  ['h', 'help'],
  ['?', 'help'],
]);

const SPACE_KEYS: ReadonlySet<string> = new Set([' ', 'Spacebar']);

/** Action of the left side of the book: it turns forward in right-to-left reading. */
function leftSideAction(direction: Direction): ReaderAction {
  return direction === 'rtl' ? 'next' : 'prev';
}

/** Action of the right side of the book: it turns forward in left-to-right reading. */
function rightSideAction(direction: Direction): ReaderAction {
  return direction === 'rtl' ? 'prev' : 'next';
}

/**
 * Maps a key to a reader action. Arrows follow the physical book: in right-to-left reading,
 * ← moves forward. Shortcuts with Cmd, Ctrl or Alt are left to the browser.
 */
export function keyToAction(event: KeyPress, direction: Direction): ReaderAction | null {
  if (event.metaKey === true || event.ctrlKey === true || event.altKey === true) return null;
  if (event.key === 'ArrowLeft') return leftSideAction(direction);
  if (event.key === 'ArrowRight') return rightSideAction(direction);
  if (SPACE_KEYS.has(event.key)) return event.shiftKey === true ? 'prev' : 'next';
  return FIXED_KEYS.get(event.key) ?? FIXED_KEYS.get(event.key.toLowerCase()) ?? null;
}

/** Maps a click at `x` (0..1 from the left of the screen) to an action: page sides turn, the middle toggles the UI. */
export function zoneToAction(x: number, direction: Direction): ReaderAction {
  if (x < LEFT_ZONE_END) return leftSideAction(direction);
  if (x > RIGHT_ZONE_START) return rightSideAction(direction);
  return 'toggleUi';
}

/** Maps a horizontal swipe to a page turn, like pulling a paper page; `null` for short or vertical gestures. */
export function swipeToAction(dx: number, dy: number, direction: Direction): ReaderAction | null {
  const horizontal = Math.abs(dx);
  if (horizontal < MIN_SWIPE_DISTANCE || horizontal < Math.abs(dy) * SWIPE_HORIZONTAL_DOMINANCE) return null;
  // Dragging toward the right pulls the left page over, and vice versa.
  return dx > 0 ? leftSideAction(direction) : rightSideAction(direction);
}
