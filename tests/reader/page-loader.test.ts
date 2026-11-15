import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROBE_AHEAD, PROBE_BEHIND, PageLoader } from '@/reader/page-loader';
import { FAKED_TIMERS, pages, settleTime } from './helpers';

vi.mock('#i18n', async () => (await import('./mocks')).i18nModule);

/** Records every image the loader requests (by URL), so the tests can make them load or fail. */
function trackImageRequests(): { requested: Map<string, HTMLImageElement>; restore: () => void } {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  if (!descriptor?.set || !descriptor.get) throw new Error('img.src is not an accessor');
  const original = descriptor;
  const requested = new Map<string, HTMLImageElement>();
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true,
    get(this: HTMLImageElement) {
      return original.get?.call(this) as string;
    },
    set(this: HTMLImageElement, value: string) {
      requested.set(value, this);
      original.set?.call(this, value);
    },
  });
  return {
    requested,
    restore: () => Object.defineProperty(HTMLImageElement.prototype, 'src', descriptor),
  };
}

const pageNumber = (url: string): number => Number(/page-(\d+)/.exec(url)?.[1]);

let tracker: ReturnType<typeof trackImageRequests>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: [...FAKED_TIMERS] });
  tracker = trackImageRequests();
});

afterEach(() => {
  tracker.restore();
  vi.useRealTimers();
});

describe('PageLoader', () => {
  it('probes only the pages around the start page', async () => {
    const loader = new PageLoader(pages(200, 0), () => undefined);
    const probe = loader.probeRatios(100, 1000);
    const probed = [...tracker.requested.keys()].map(pageNumber).sort((a, b) => a - b);
    expect(probed[0]).toBe(100 - PROBE_BEHIND);
    expect(probed.at(-1)).toBe(100 + PROBE_AHEAD);
    expect(probed).toHaveLength(PROBE_BEHIND + PROBE_AHEAD + 1);
    loader.dispose();
    await expect(probe).resolves.toBeUndefined();
  });

  it('preloads a bounded window with a single chain, and retries failed pages later', async () => {
    const loader = new PageLoader(pages(100), () => undefined);
    loader.preloadAround(0);
    loader.preloadAround(0);
    for (let round = 0; round < 30; round++) {
      for (const image of tracker.requested.values()) image.onload?.(new Event('load'));
      await settleTime(250);
    }
    const loaded = [...tracker.requested.keys()].map(pageNumber);
    expect(new Set(loaded).size).toBe(9);
    expect(Math.max(...loaded)).toBeLessThanOrEqual(8);

    // A failing page is not cached as broken, and is requested again on a later visit.
    const failing = 'https://example.test/page-30.jpg';
    loader.preloadAround(30);
    tracker.requested.get(failing)?.onerror?.(new Event('error'));
    tracker.requested.delete(failing);
    await settleTime(20_000);
    loader.preloadAround(30);
    expect(tracker.requested.has(failing)).toBe(true);
    loader.dispose();
  });

  it('ignores image loads that finish after it was disposed', async () => {
    const onRatio = vi.fn();
    const loader = new PageLoader(pages(3, 0), onRatio);
    const loading = loader.load(0);
    const image = tracker.requested.get('https://example.test/page-0.jpg');
    loader.dispose();
    image?.onload?.(new Event('load'));
    await loading;
    expect(onRatio).not.toHaveBeenCalled();
    expect(loader.isLoaded(0)).toBe(false);
  });

  it('turns a pending page into a drawable element when the site delivers it', async () => {
    const loader = new PageLoader([{ source: { kind: 'pending' }, ratio: 0 }], () => undefined);
    const loading = loader.load(0);
    const element = document.createElement('img');
    expect(loader.setElement(0, element)).toBe(true);
    await expect(loading).resolves.toBeUndefined();
    expect(loader.pages[0]?.source).toEqual({ kind: 'element', element });
    loader.dispose();
  });
});
