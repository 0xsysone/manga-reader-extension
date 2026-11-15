import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LivePages } from '@/shared/types';
import { FAKED_TIMERS, chapter, closeAll, open, press, settleTime, slider } from './helpers';

vi.mock('#i18n', async () => (await import('./mocks')).i18nModule);
vi.mock('wxt/utils/content-script-ui/shadow-root', async () => (await import('./mocks')).shadowRootModule);

/** Long enough for any transition, toast or close fade of the reader. */
const LONG = 6000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: [...FAKED_TIMERS] });
});

afterEach(async () => {
  await closeAll();
  document.body.replaceChildren();
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
  vi.useRealTimers();
});

describe('lifecycle', () => {
  it('mounts an accessible modal, locks the page scroll and moves the focus in', async () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    const { shadow, host } = await open(chapter(4));
    const root = shadow.querySelector('.mr');
    expect(root?.getAttribute('role')).toBe('dialog');
    expect(root?.getAttribute('aria-modal')).toBe('true');
    expect(root?.getAttribute('aria-label')).toBe('Series');
    expect(document.activeElement).toBe(host);
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('releases listeners, timers and the page on close', async () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    const { handle, callbacks } = await open(chapter(6), { animation: 'flip', mode: 'double' });
    await press('ArrowLeft');
    handle.close();
    expect(handle.isOpen).toBe(false);
    await settleTime(LONG);

    expect(callbacks.onClose).toHaveBeenCalledTimes(1);
    expect(document.querySelector('manga-reader')).toBeNull();
    expect(document.documentElement.style.overflow).toBe('');
    expect(document.activeElement).toBe(outside);
    expect(vi.getTimerCount()).toBe(0);

    const pagesBefore = callbacks.onPageChange.mock.calls.length;
    const event = await press('ArrowLeft');
    expect(event.defaultPrevented).toBe(false);
    expect(callbacks.onPageChange.mock.calls.length).toBe(pagesBefore);
  });

  it('closes safely in the middle of a page turn', async () => {
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent): void => {
      errors.push(event.error);
    };
    window.addEventListener('error', onError);
    const { handle, shadow, callbacks } = await open(chapter(8), { animation: 'flip', mode: 'double' });
    // Past the wait for the next pages: the leaf is turning.
    await press('ArrowLeft', {}, 450);
    expect(shadow.querySelector('.mr-leaf')).not.toBeNull();
    handle.close();
    await settleTime(LONG);
    window.removeEventListener('error', onError);
    expect(errors).toEqual([]);
    expect(callbacks.onClose).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('subscribes to live pages, follows them with syncTo and unsubscribes on close', async () => {
    const unsubscribe = vi.fn();
    const subscribe = vi.fn(() => unsubscribe);
    const syncTo = vi.fn<(page: number) => void>();
    const live: LivePages = { subscribe, syncTo, blocker: () => null };
    const { handle } = await open(chapter(5, {}, { live }), { mode: 'single' });
    expect(subscribe).toHaveBeenCalledTimes(1);
    await press('ArrowLeft');
    expect(syncTo).toHaveBeenLastCalledWith(1);
    handle.close();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('swaps chapters and cancels the probe of the previous one', async () => {
    const unknownSizes = chapter(30);
    for (const page of unknownSizes.pages) page.ratio = 0;
    const { handle, shadow } = await open(unknownSizes, { mode: 'single' });
    handle.replaceChapter(chapter(3, { title: 'Other', chapter: '13' }), 2);
    await settleTime(LONG);
    expect(slider(shadow).getAttribute('aria-valuemax')).toBe('3');
    expect(slider(shadow).getAttribute('aria-valuenow')).toBe('3');
    expect(shadow.querySelector('.mr-title-name')?.textContent).toBe('Other');
  });
});

describe('navigation', () => {
  it('turns spreads forward with ← in right-to-left reading', async () => {
    const { shadow, callbacks } = await open(chapter(6), { mode: 'double', direction: 'rtl' });
    expect(slider(shadow).getAttribute('aria-valuetext')).toBe('1 / 6');
    await press('ArrowLeft');
    expect(slider(shadow).getAttribute('aria-valuetext')).toBe('2–3 / 6');
    await press('ArrowLeft');
    expect(slider(shadow).getAttribute('aria-valuetext')).toBe('4–5 / 6');
    await press('ArrowRight');
    expect(slider(shadow).getAttribute('aria-valuetext')).toBe('2–3 / 6');
    expect(callbacks.onPageChange).toHaveBeenLastCalledWith(1);
  });

  it('turns spreads forward with → in left-to-right reading', async () => {
    const { shadow } = await open(chapter(6), { mode: 'double', direction: 'ltr' });
    await press('ArrowRight');
    expect(slider(shadow).getAttribute('aria-valuetext')).toBe('2–3 / 6');
    await press('ArrowLeft');
    expect(slider(shadow).getAttribute('aria-valuetext')).toBe('1 / 6');
  });

  it('queues fast presses during a page turn', async () => {
    const { shadow } = await open(chapter(10), { mode: 'single', animation: 'slide' });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    await settleTime(LONG);
    expect(slider(shadow).getAttribute('aria-valuenow')).toBe('10');
  });

  it('shows a toast at the end, then asks for the next chapter on a second press', async () => {
    const { shadow, callbacks } = await open(chapter(2, { nextUrl: 'https://example.test/ch-13' }), {
      mode: 'single',
    });
    await press('ArrowLeft');
    const toast = shadow.querySelector('.mr-toast');
    expect(toast?.classList.contains('is-visible')).toBe(false);

    await press('ArrowLeft', {}, 100);
    expect(toast?.classList.contains('is-visible')).toBe(true);
    expect(toast?.getAttribute('role')).toBe('status');
    expect(toast?.textContent).toContain('endOfChapterN(12)');
    expect(toast?.querySelector('kbd')?.textContent).toBe('←');
    expect(callbacks.onNavigateChapter).not.toHaveBeenCalled();

    await press('ArrowLeft', {}, 100);
    expect(callbacks.onNavigateChapter).toHaveBeenCalledWith('next');
  });

  it('never changes chapter on an auto-repeated key press', async () => {
    const { shadow, callbacks } = await open(chapter(2, { nextUrl: 'https://example.test/ch-13' }), {
      mode: 'single',
    });
    await press('ArrowLeft', { repeat: true });
    await press('ArrowLeft', { repeat: true });
    await press('ArrowLeft', { repeat: true });
    expect(shadow.querySelector('.mr-toast')?.classList.contains('is-visible')).toBe(false);
    expect(callbacks.onNavigateChapter).not.toHaveBeenCalled();
  });

  it('brings the stage back when the chapter change does not happen', async () => {
    const { shadow, handle } = await open(chapter(1, { nextUrl: 'https://example.test/ch-13' }), {
      mode: 'single',
    });
    await press('n', {}, 100);
    const stage = shadow.querySelector<HTMLElement>('.mr-stage');
    expect(stage?.style.opacity).toBe('0');
    handle.showNotice({ title: 'Unavailable', detail: 'Try again' });
    expect(stage?.style.opacity).toBe('');
    expect(shadow.querySelector('.mr-toast')?.textContent).toContain('Unavailable');
  });
});

describe('scrubber', () => {
  it('is an ARIA slider that follows the current spread', async () => {
    const { shadow } = await open(chapter(9), { mode: 'double' });
    const element = slider(shadow);
    expect(element.tabIndex).toBe(0);
    expect(element.getAttribute('aria-valuemin')).toBe('1');
    expect(element.getAttribute('aria-valuemax')).toBe('9');
    expect(element.getAttribute('aria-valuenow')).toBe('1');
    await press('ArrowLeft');
    expect(element.getAttribute('aria-valuenow')).toBe('2');
    expect(element.getAttribute('aria-valuetext')).toBe('2–3 / 9');
  });

  it('answers Home / End and the arrows when focused', async () => {
    const { shadow } = await open(chapter(9), { mode: 'single', direction: 'ltr' });
    const element = slider(shadow);
    element.focus();
    await press('End');
    expect(element.getAttribute('aria-valuenow')).toBe('9');
    await press('Home');
    expect(element.getAttribute('aria-valuenow')).toBe('1');
    await press('ArrowRight');
    expect(element.getAttribute('aria-valuenow')).toBe('2');
    await press('PageUp');
    expect(element.getAttribute('aria-valuenow')).toBe('9');
  });
});

describe('untrusted strings', () => {
  it('inserts a malicious title and chapter labels as text', async () => {
    const payload = '<img src=x onerror="window.__pwned = true">';
    const { shadow } = await open(
      chapter(3, {
        title: payload,
        chapter: payload,
        nextUrl: 'https://example.test/next',
        nextLabel: payload,
        seriesUrl: 'javascript:alert(1)',
      }),
      { mode: 'single' },
    );
    expect(shadow.querySelector('.mr-title-name')?.textContent).toBe(payload);
    expect(shadow.querySelectorAll('img[src="x"]')).toHaveLength(0);
    expect(shadow.querySelector('.mr-title')?.hasAttribute('href')).toBe(false);
    // The end-of-chapter toast repeats the labels.
    await press('End');
    await press('ArrowLeft', {}, 100);
    expect(shadow.querySelector('.mr-toast')?.textContent).toContain(payload);
    expect(shadow.querySelectorAll('img[src="x"]')).toHaveLength(0);
  });
});
