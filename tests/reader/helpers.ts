import { vi, type Mock } from 'vitest';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { DEFAULT_SETTINGS } from '@/domain/settings';
import type { Chapter, ChapterDirection, ChapterMeta, Page, ReaderHandle, Settings } from '@/shared/types';
import { openReader } from '@/reader';

/** Every timer API the reader uses, faked so tests control time. */
export const FAKED_TIMERS = [
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'performance',
  'Date',
] as const;

export function pages(count: number, ratio = 0.7): Page[] {
  return Array.from({ length: count }, (_, index) => ({
    source: { kind: 'url', url: `https://example.test/page-${index}.jpg` },
    ratio,
  }));
}

export function chapter(
  count: number,
  meta: Partial<ChapterMeta> = {},
  extra: Partial<Chapter> = {},
): Chapter {
  return {
    pages: pages(count),
    meta: {
      title: 'Series',
      chapter: '12',
      prevUrl: null,
      nextUrl: null,
      prevLabel: null,
      nextLabel: null,
      seriesUrl: null,
      ...meta,
    },
    confident: true,
    ...extra,
  };
}

/** Spies standing in for the reader callbacks. */
export interface CallbackSpies {
  onSettingsChange: Mock<(settings: Settings) => void>;
  onPageChange: Mock<(page: number) => void>;
  onNavigateChapter: Mock<(direction: ChapterDirection) => void>;
  onClose: Mock<() => void>;
}

export function callbacks(): CallbackSpies {
  return {
    onSettingsChange: vi.fn<(settings: Settings) => void>(),
    onPageChange: vi.fn<(page: number) => void>(),
    onNavigateChapter: vi.fn<(direction: ChapterDirection) => void>(),
    onClose: vi.fn<() => void>(),
  };
}

/** A content-script context stand-in: the reader only hands it to `createShadowRootUi`. */
export const fakeContext = { onInvalidated: vi.fn() } as unknown as ContentScriptContext;

export interface Opened {
  handle: ReaderHandle;
  shadow: ShadowRoot;
  host: HTMLElement;
  callbacks: CallbackSpies;
}

const openHandles: ReaderHandle[] = [];

/** Closes every reader opened by a test and lets the close fade finish. */
export async function closeAll(): Promise<void> {
  for (const handle of openHandles.splice(0)) handle.close();
  await settleTime(1000);
}

export async function open(
  content: Chapter,
  settings: Partial<Settings> = {},
  startPage = 0,
): Promise<Opened> {
  const spies = callbacks();
  const handle = await openReader(fakeContext, {
    chapter: content,
    settings: { ...DEFAULT_SETTINGS, animation: 'none', ...settings },
    startPage,
    callbacks: spies,
  });
  openHandles.push(handle);
  const host = document.querySelector<HTMLElement>('manga-reader');
  if (!host?.shadowRoot) throw new Error('reader host missing');
  await settleTime(0);
  return { handle, shadow: host.shadowRoot, host, callbacks: spies };
}

/** Lets timers and promise callbacks run for `ms` of fake time. */
export async function settleTime(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

/** Dispatches a key press at window level, then lets the resulting transition finish. */
export async function press(key: string, init: KeyboardEventInit = {}, wait = 2000): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(event);
  await settleTime(wait);
  return event;
}

export function slider(shadow: ShadowRoot): HTMLElement {
  const element = shadow.querySelector<HTMLElement>('[role="slider"]');
  if (!element) throw new Error('slider missing');
  return element;
}
