import type { ChapterDirection, LivePages } from '@/shared/types';

type Blocker = ReturnType<LivePages['blocker']>;
type ControlSide = 'left' | 'right';

/** Pages decoded in a burst are reported together after this quiet time. */
const COLLECT_DEBOUNCE_MS = 60;
/** Time the site's reader usually takes to turn a page after a click… */
const SITE_REACTION_MS = 80;
/** …and the extra time granted to a slow one before calling it stuck. */
const SITE_SLOW_REACTION_MS = 260;
/** While the site lags behind the reader (it ignores clicks until the user moves the mouse), retry this often. */
const RESYNC_INTERVAL_MS = 1500;
/** Upper bound of clicks per page of distance, so a confused site can never loop forever. */
const MAX_CLICKS_PER_PAGE = 2;

const HIDDEN_PAGE_CLASS = 'hidden';
/** Cookie consent banners (Quantcast, OneTrust, Didomi, Funding Choices…): the site waits for an answer. */
const CONSENT_BANNERS =
  '.qc-cmp2-container, #qc-cmp2-container, #onetrust-banner-sdk, #didomi-host, .fc-consent-root, #cmpbox, .cmp-container';

function controlSelector(side: ControlSide): string {
  return `.reader_click_nav .${side}-cursor`;
}

function opposite(side: ControlSide): ControlSide {
  return side === 'right' ? 'left' : 'right';
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** The page image of a box once the site has decoded it, `null` before. */
export function decodedImage(box: Element): HTMLImageElement | null {
  const image = box.querySelector('img');
  return image?.complete && image.naturalWidth > 0 ? image : null;
}

function consentBannerVisible(document: Document): boolean {
  return Array.from(document.querySelectorAll<HTMLElement>(CONSENT_BANNERS)).some(
    (banner) => banner.offsetParent !== null || banner.getClientRects().length > 0,
  );
}

/** Simulates a real mouse press on a control of the site's reader (down → up → click at its centre). */
function pressSiteControl(control: HTMLElement): void {
  const box = control.getBoundingClientRect();
  const init: PointerEventInit = {
    bubbles: true,
    cancelable: true,
    clientX: box.left + box.width / 2,
    clientY: box.top + box.height / 2,
    button: 0,
    isPrimary: true,
    pointerType: 'mouse',
  };
  const pressed = { ...init, buttons: 1 };
  control.dispatchEvent(new PointerEvent('pointerdown', pressed));
  control.dispatchEvent(new MouseEvent('mousedown', pressed));
  control.dispatchEvent(new PointerEvent('pointerup', init));
  control.dispatchEvent(new MouseEvent('mouseup', init));
  control.dispatchEvent(new MouseEvent('click', init));
}

/**
 * Live pages of the Scan-Manga reader. The site decodes each page itself into an `<img>` whose blob
 * URL it revokes at once, so the pages are handed over as elements when they appear, and the site's
 * own reader is driven in the background (by clicking its controls) so it keeps preloading what follows.
 * Syncing only runs while at least one subscription is active.
 */
export function scanMangaLivePages(container: Element, boxes: readonly HTMLElement[]): LivePages {
  const document = container.ownerDocument;
  const controls: Record<ChapterDirection, ControlSide> = { next: 'right', prev: 'left' };
  let subscriptions = 0;
  let target = 0;
  let syncing = false;
  let blocker: Blocker = null;

  const sitePage = (): number =>
    Math.max(
      0,
      boxes.findIndex((box) => !box.classList.contains(HIDDEN_PAGE_CLASS)),
    );

  async function pageAfterClick(before: number): Promise<number> {
    await delay(SITE_REACTION_MS);
    if (sitePage() !== before) return sitePage();
    await delay(SITE_SLOW_REACTION_MS);
    return sitePage();
  }

  /** Clicks the site's controls until it shows `target`, learning which control goes forward. */
  async function sync(): Promise<void> {
    syncing = true;
    try {
      for (let click = 0; click < boxes.length * MAX_CLICKS_PER_PAGE && subscriptions > 0; click++) {
        const before = sitePage();
        if (before === target) {
          blocker = null;
          return;
        }
        const control = document.querySelector<HTMLElement>(
          controlSelector(controls[before < target ? 'next' : 'prev']),
        );
        if (!control) return;
        pressSiteControl(control);
        const after = await pageAfterClick(before);
        if (after === before) {
          // No reaction: the site waits for a first user gesture, or for an answer to its cookie banner.
          blocker = consentBannerVisible(document) ? 'consent' : 'activation';
          return;
        }
        blocker = null;
        if (Math.abs(after - target) > Math.abs(before - target)) {
          // The site reads the other way: swap the controls.
          controls.next = opposite(controls.next);
          controls.prev = opposite(controls.prev);
        }
      }
    } finally {
      syncing = false;
    }
  }

  return {
    subscribe(onPage) {
      subscriptions++;
      const reported: (HTMLImageElement | undefined)[] = [];
      let collectTimer: ReturnType<typeof setTimeout> | undefined;
      const collect = (): void => {
        collectTimer = undefined;
        boxes.forEach((box, index) => {
          const image = decodedImage(box);
          if (!image || reported[index] === image) return;
          reported[index] = image;
          onPage(index, image);
        });
      };
      const scheduleCollect = (): void => {
        collectTimer ??= setTimeout(collect, COLLECT_DEBOUNCE_MS);
      };
      const observer = new MutationObserver(scheduleCollect);
      observer.observe(container, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src', 'data-loaded'],
      });
      container.addEventListener('load', scheduleCollect, true);
      const resyncTimer = setInterval(() => {
        if (!syncing && sitePage() !== target) void sync();
      }, RESYNC_INTERVAL_MS);
      collect();

      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        subscriptions--;
        observer.disconnect();
        container.removeEventListener('load', scheduleCollect, true);
        clearInterval(resyncTimer);
        clearTimeout(collectTimer);
      };
    },
    syncTo(index) {
      if (subscriptions === 0) return;
      target = Math.max(0, Math.min(boxes.length - 1, index));
      if (!syncing) void sync();
    },
    blocker: () => blocker,
  };
}
