import { describe, expect, it, vi } from 'vitest';
import { createLauncherButton } from '@/content/launcher';
import { resolveStartPage } from '@/content/start-page';

describe('resolveStartPage', () => {
  const base = { pageCount: 10, savedPage: null, siteStartPage: undefined, openAtEnd: false };

  it('starts at the first page by default', () => {
    expect(resolveStartPage(base)).toBe(0);
  });

  it('prefers the saved page over the site page', () => {
    expect(resolveStartPage({ ...base, savedPage: 4, siteStartPage: 7 })).toBe(4);
    expect(resolveStartPage({ ...base, savedPage: 0, siteStartPage: 7 })).toBe(0);
  });

  it('uses the site page when past the first page', () => {
    expect(resolveStartPage({ ...base, siteStartPage: 7 })).toBe(7);
  });

  it('opens on the last page when coming back from the next chapter', () => {
    expect(resolveStartPage({ ...base, savedPage: 2, openAtEnd: true })).toBe(9);
  });

  it('stays within the chapter', () => {
    expect(resolveStartPage({ ...base, savedPage: 42 })).toBe(9);
    expect(resolveStartPage({ ...base, savedPage: -1 })).toBe(0);
    expect(resolveStartPage({ ...base, pageCount: 0, openAtEnd: true })).toBe(0);
  });
});

describe('launcher button', () => {
  const texts = {
    label: 'Read in book mode',
    title: 'Open Manga Reader',
    pageCount: (n: number) => `${n} pages`,
  };

  it('is an accessible button whose name includes the visible text', () => {
    const button = createLauncherButton(texts, 12, vi.fn());

    expect(button.type).toBe('button');
    expect(button.getAttribute('aria-label')).toBe('Read in book mode, 12 pages');
    expect(button.title).toBe('Open Manga Reader');
    expect(button.textContent).toContain('12 pages');
    expect(button.querySelector('[aria-hidden="true"]')?.textContent).toBe('読');
  });

  it('opens the reader on click', () => {
    const onOpen = vi.fn();
    createLauncherButton(texts, 3, onOpen).click();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
