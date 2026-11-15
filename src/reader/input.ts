import { keyToAction, swipeToAction, zoneToAction } from '@/domain/input';
import type { Direction, ReaderAction } from '@/shared/types';
import { Disposer } from './disposer';

/** Accumulated wheel delta (px) that turns one page. */
const WHEEL_THRESHOLD = 42;
/** Wheel deltas older than this are forgotten. */
const WHEEL_RESET_MS = 220;
/** After a wheel turn, the trackpad inertia is ignored for this long… */
const WHEEL_LOCK_MS = 480;
/** …and each inertia event extends the lock by this much. */
const WHEEL_LOCK_EXTEND_MS = 160;
/** Debounce of the window resize. */
const RESIZE_DEBOUNCE_MS = 120;
/** Mouse travel (px, |dx| + |dy|) that counts as activity and reveals the interface. */
const MOUSE_ACTIVITY_PX = 2;
/** Points of the click zones used for the left / right zone (share of the width, see `zoneToAction`). */
const LEFT_ZONE_X = 0.1;
const RIGHT_ZONE_X = 0.9;

/** Events stopped at the reader so the site never sees them (pop-under ads on click, theme shortcuts…). */
const ISOLATED_EVENTS = [
  'click',
  'dblclick',
  'mousedown',
  'mouseup',
  'pointerdown',
  'pointerup',
  'touchstart',
  'touchend',
  'contextmenu',
  'wheel',
  'auxclick',
] as const;

/** What a widget does with a key before the reader shortcuts see it. */
export type KeyDisposition =
  /** The widget used the key: stop it. */
  | 'handled'
  /** Let the focused element use it natively (Enter / Space on a button): neither a shortcut nor stopped. */
  | 'native'
  /** Not for a widget: map it to a reader action. */
  | 'shortcut';

export interface InputElements {
  /** Element added to the page (events are stopped there). */
  host: HTMLElement;
  root: HTMLElement;
  stage: HTMLElement;
  zoneLeft: HTMLElement;
  zoneRight: HTMLElement;
}

export interface InputHandlers {
  direction(): Direction;
  isZoomed(): boolean;
  /** `repeat`: the action comes from an auto-repeated key press. */
  perform(action: ReaderAction, repeat: boolean): void;
  /** Widgets (slider, radio group, dialog) get the key first. */
  routeKey(event: KeyboardEvent): KeyDisposition;
  toggleUi(): void;
  toggleZoom(x: number, y: number): void;
  /** Mouse position while zoomed (at most once per frame). */
  pan(x: number, y: number): void;
  /** The mouse moved; `noticeable` when it travelled far enough to count as user activity. */
  mouseMove(x: number, y: number, noticeable: boolean): void;
  resize(): void;
  fullscreenChange(): void;
}

/**
 * Turns keyboard, wheel, touch, click zones and mouse moves into reader actions. The keyboard is captured at
 * window level so the site's own shortcuts never fire while the reader is open.
 * Returns a function that removes every listener and cancels pending timers and frames.
 */
export function bindInput(elements: InputElements, handlers: InputHandlers): () => void {
  const disposer = new Disposer();
  const { host, root, stage, zoneLeft, zoneRight } = elements;

  for (const type of ISOLATED_EVENTS) {
    disposer.listen(host, type, (event) => event.stopPropagation());
  }

  disposer.listen(
    window,
    'keydown',
    (event) => {
      const route = handlers.routeKey(event);
      if (route === 'native') return;
      if (route === 'handled') {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      const action = keyToAction(event, handlers.direction());
      if (!action) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      handlers.perform(action, event.repeat);
    },
    { capture: true },
  );
  disposer.listen(
    window,
    'keyup',
    (event) => {
      if (keyToAction(event, handlers.direction())) event.stopImmediatePropagation();
    },
    { capture: true },
  );

  let resizeTimer: number | undefined;
  disposer.listen(window, 'resize', () => {
    disposer.clearTimeout(resizeTimer);
    resizeTimer = disposer.timeout(() => handlers.resize(), RESIZE_DEBOUNCE_MS);
  });
  disposer.listen(document, 'fullscreenchange', () => handlers.fullscreenChange());

  const zoneClick =
    (x: number) =>
    (event: Event): void => {
      if (handlers.isZoomed()) return;
      event.preventDefault();
      handlers.perform(zoneToAction(x, handlers.direction()), false);
    };
  disposer.listen(zoneLeft, 'click', zoneClick(LEFT_ZONE_X));
  disposer.listen(zoneRight, 'click', zoneClick(RIGHT_ZONE_X));

  disposer.listen(stage, 'click', (event) => {
    if (handlers.isZoomed()) return;
    event.preventDefault();
    handlers.toggleUi();
  });
  disposer.listen(stage, 'dblclick', (event) => handlers.toggleZoom(event.clientX, event.clientY));

  // Zoom panning follows the mouse, coalesced to one update per frame.
  let lastMouse: { x: number; y: number } | null = null;
  let panFrame = 0;
  disposer.listen(root, 'mousemove', (event) => {
    const { clientX: x, clientY: y } = event;
    if (handlers.isZoomed() && !panFrame) {
      panFrame = disposer.frame(() => {
        panFrame = 0;
        if (lastMouse && handlers.isZoomed()) handlers.pan(lastMouse.x, lastMouse.y);
      });
    }
    const moved = lastMouse ? Math.abs(x - lastMouse.x) + Math.abs(y - lastMouse.y) : 0;
    lastMouse = { x, y };
    handlers.mouseMove(x, y, moved > MOUSE_ACTIVITY_PX);
  });

  // Wheel / trackpad: one page per gesture, the inertia that follows is absorbed.
  let wheelTotal = 0;
  let wheelLockedUntil = 0;
  let wheelReset: number | undefined;
  disposer.listen(
    root,
    'wheel',
    (event) => {
      if (event.ctrlKey) return; // pinch-zoom of the browser
      event.preventDefault();
      const now = performance.now();
      if (now < wheelLockedUntil) {
        wheelLockedUntil = Math.max(wheelLockedUntil, now + WHEEL_LOCK_EXTEND_MS);
        return;
      }
      const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
      // On a trackpad, two fingers moving right give a negative deltaX: pull the page toward the right.
      const delta = horizontal
        ? handlers.direction() === 'rtl'
          ? -event.deltaX
          : event.deltaX
        : event.deltaY;
      wheelTotal += delta;
      disposer.clearTimeout(wheelReset);
      wheelReset = disposer.timeout(() => {
        wheelTotal = 0;
      }, WHEEL_RESET_MS);
      if (Math.abs(wheelTotal) > WHEEL_THRESHOLD) {
        handlers.perform(wheelTotal > 0 ? 'next' : 'prev', false);
        wheelTotal = 0;
        wheelLockedUntil = now + WHEEL_LOCK_MS;
      }
    },
    { passive: false },
  );

  // Touch: horizontal swipe. A second finger (pinch) cancels the gesture.
  let touchStart: { x: number; y: number } | null = null;
  disposer.listen(
    root,
    'touchstart',
    (event) => {
      const touch = event.touches[0];
      touchStart = event.touches.length === 1 && touch ? { x: touch.clientX, y: touch.clientY } : null;
    },
    { passive: true },
  );
  disposer.listen(
    root,
    'touchmove',
    (event) => {
      if (event.touches.length > 1) touchStart = null;
    },
    { passive: true },
  );
  disposer.listen(root, 'touchcancel', () => {
    touchStart = null;
  });
  disposer.listen(root, 'touchend', (event) => {
    const start = touchStart;
    touchStart = null;
    const touch = event.changedTouches[0];
    if (!start || !touch || event.touches.length > 0 || handlers.isZoomed()) return;
    const action = swipeToAction(touch.clientX - start.x, touch.clientY - start.y, handlers.direction());
    if (!action) return;
    event.preventDefault();
    handlers.perform(action, false);
  });

  return () => disposer.dispose();
}
