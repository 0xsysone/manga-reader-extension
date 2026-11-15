import { spreadShift, turningSide } from '@/domain/spreads';
import type { Direction, SpreadSides } from '@/shared/types';
import { otherSide, type Book, type PageRenderer } from '../book';
import { h } from '../dom';
import { settle } from './settle';
import { BOOK_SHIFT_EASE, DROP_EASE, FLIP_EASE, LIFT_EASE } from './timing';

/** Share of the half-turn angle reached when a single page starts to fade (lifting) or is fully visible (dropping). */
const SINGLE_FLIP_FADE_ANGLE = 0.82;
/** Cast shadow opacity on the page uncovered by a double-page flip. */
const UNCOVERED_SHADOW = 0.6;

export interface FlipDoubleOptions {
  book: Book;
  from: SpreadSides;
  to: SpreadSides;
  direction: Direction;
  forward: boolean;
  duration: number;
  pageWidth: number;
  renderer: PageRenderer;
  signal: AbortSignal;
}

/**
 * Realistic double-page turn: a two-faced leaf rotates around the spine, with the shadow it casts on the page it
 * covers, a penumbra lifting off the page it uncovers, and a sheen sweeping across its faces. The same book is
 * reused: it shows spread `to` afterwards (unless `signal` aborted, in which case the DOM is left alone).
 */
export async function flipDouble(options: FlipDoubleOptions): Promise<void> {
  const { book, from, to, direction, forward, duration, pageWidth, renderer, signal } = options;
  const side = turningSide(direction, forward);
  const other = otherSide(side);
  const slot = book.slot(side);
  const otherSlot = book.slot(other);
  if (!slot || !otherSlot) return;
  const bothFrom = from.left !== null && from.right !== null;
  const bothTo = to.left !== null && to.right !== null;

  // Under the leaf: the page about to be uncovered.
  book.fillSide(side, to);

  const leaf = h('div', 'mr-leaf');
  leaf.style.left = side === 'left' ? '0' : `${pageWidth}px`;
  leaf.style.width = `${pageWidth}px`;
  leaf.style.transformOrigin = side === 'left' ? '100% 50%' : '0% 50%';
  const spineFront = side === 'left' ? 'spine-right' : 'spine-left';
  const spineBack = side === 'left' ? 'spine-left' : 'spine-right';
  const front = h('div', 'mr-face front');
  const back = h('div', 'mr-face back');
  // An empty face (lone page) stays transparent: the leaf appears or vanishes edge-on.
  const frontPage = from[side];
  const backPage = to[other];
  const shadeFront = h('div', `mr-shade ${spineFront}`);
  const sheenFront = h('div', `mr-sheen ${spineFront}`);
  const shadeBack = h('div', `mr-shade ${spineBack}`);
  const sheenBack = h('div', `mr-sheen ${spineBack}`);
  if (frontPage) front.append(renderer.render(frontPage, side, bothFrom), shadeFront, sheenFront);
  if (backPage) back.append(renderer.render(backPage, other, bothTo), shadeBack, sheenBack);
  leaf.append(front, back);
  book.element.append(leaf);

  const angle = side === 'left' ? 180 : -180;
  const timing: KeyframeAnimationOptions = { duration, easing: FLIP_EASE };
  const shiftFrom = book.shift;
  const shiftTo = spreadShift(to) * pageWidth;
  book.setShift(shiftTo);

  const animations = [
    leaf.animate(
      [
        { transform: 'rotateY(0deg)' },
        { transform: `rotateY(${angle * 0.5}deg) translateZ(1px)`, offset: 0.5 },
        { transform: `rotateY(${angle}deg)` },
      ],
      timing,
    ),
    book.element.animate(
      [{ transform: `translateX(${shiftFrom}px)` }, { transform: `translateX(${shiftTo}px)` }],
      { duration, easing: BOOK_SHIFT_EASE },
    ),
    // Shadow of the leaf on the page it is about to cover…
    otherSlot.cast.animate(
      [{ opacity: 0 }, { opacity: 0, offset: 0.42 }, { opacity: 0.55, offset: 0.82 }, { opacity: 0 }],
      timing,
    ),
    // …and penumbra on the uncovered page, which brightens.
    slot.cast.animate([{ opacity: UNCOVERED_SHADOW }, { opacity: 0, offset: 0.55 }, { opacity: 0 }], timing),
  ];
  if (frontPage) {
    animations.push(
      shadeFront.animate([{ opacity: 0 }, { opacity: 0.5, offset: 0.5 }, { opacity: 0.5 }], timing),
      sheenFront.animate(
        [{ opacity: 0 }, { opacity: 0.35, offset: 0.32 }, { opacity: 0, offset: 0.5 }, { opacity: 0 }],
        timing,
      ),
    );
  }
  if (backPage) {
    animations.push(
      shadeBack.animate([{ opacity: 0.5 }, { opacity: 0.5, offset: 0.5 }, { opacity: 0 }], timing),
      sheenBack.animate(
        [{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 0.3, offset: 0.66 }, { opacity: 0 }],
        timing,
      ),
    );
  }
  await settle(animations, signal);
  if (signal.aborted) return;
  book.fillSide(other, to);
  leaf.remove();
}

export interface FlipSingleOptions {
  container: HTMLElement;
  oldBook: Book;
  newBook: Book;
  direction: Direction;
  forward: boolean;
  duration: number;
  signal: AbortSignal;
}

/**
 * Single-page turn: going forward, the current page lifts and rotates around its spine, revealing the next one;
 * going back, the previous page drops back into place over the current one. `oldBook` is destroyed afterwards.
 */
export async function flipSingle(options: FlipSingleOptions): Promise<void> {
  const { container, oldBook, newBook, direction, forward, duration, signal } = options;
  const rtl = direction === 'rtl';
  const origin = rtl ? '100% 50%' : '0% 50%';
  const angle = rtl ? 90 : -90;
  const shade = h('div', `mr-shade ${rtl ? 'spine-right' : 'spine-left'}`);
  if (forward) {
    container.insertBefore(newBook.element, oldBook.element);
    oldBook.element.style.transformOrigin = origin;
    oldBook.element.style.zIndex = '2';
    oldBook.single?.element.append(shade);
    const timing: KeyframeAnimationOptions = { duration, easing: LIFT_EASE, fill: 'forwards' };
    const animations = [
      oldBook.element.animate(
        [
          { transform: 'rotateY(0deg)', opacity: 1 },
          { transform: `rotateY(${angle * SINGLE_FLIP_FADE_ANGLE}deg)`, opacity: 1, offset: 0.85 },
          { transform: `rotateY(${angle}deg)`, opacity: 0 },
        ],
        timing,
      ),
      shade.animate([{ opacity: 0 }, { opacity: 0.65 }], timing),
    ];
    if (newBook.single) {
      animations.push(
        newBook.single.cast.animate([{ opacity: 0.55 }, { opacity: 0 }], { duration, easing: 'ease-out' }),
      );
    }
    await settle(animations, signal);
    if (signal.aborted) return;
    oldBook.destroy();
    return;
  }
  container.append(newBook.element);
  newBook.element.style.transformOrigin = origin;
  newBook.element.style.zIndex = '2';
  newBook.single?.element.append(shade);
  const timing: KeyframeAnimationOptions = { duration, easing: DROP_EASE };
  const animations = [
    newBook.element.animate(
      [
        { transform: `rotateY(${angle}deg)`, opacity: 0 },
        { transform: `rotateY(${angle * SINGLE_FLIP_FADE_ANGLE}deg)`, opacity: 1, offset: 0.15 },
        { transform: 'rotateY(0deg)', opacity: 1 },
      ],
      timing,
    ),
    shade.animate([{ opacity: 0.65 }, { opacity: 0 }], timing),
  ];
  if (oldBook.single)
    animations.push(oldBook.single.cast.animate([{ opacity: 0 }, { opacity: 0.5 }], timing));
  await settle(animations, signal);
  if (signal.aborted) return;
  shade.remove();
  newBook.element.style.transformOrigin = '';
  newBook.element.style.zIndex = '';
  oldBook.destroy();
}
