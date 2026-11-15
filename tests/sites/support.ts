import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Chapter, DetectContext, Page } from '@/shared/types';

const DEFAULT_VIEWPORT_WIDTH = 1440;

/** Saved HTML page from `tests/fixtures/`. */
export function loadFixture(name: string): string {
  return readFileSync(join(import.meta.dirname, '../fixtures', name), 'utf8');
}

export function parseDocument(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

/** A detection context over `html`, with a `fetchJson` that fails unless given. */
export function createContext(
  html: string,
  url: string,
  overrides: Partial<DetectContext> = {},
): DetectContext {
  return {
    document: parseDocument(html),
    url: new URL(url),
    viewportWidth: DEFAULT_VIEWPORT_WIDTH,
    fetchJson: () => Promise.reject(new Error(`unexpected fetch`)),
    ...overrides,
  };
}

/** URL of every page, `null` for pages that are not URL-based. */
export function pageUrls(chapter: Chapter | null): (string | null)[] {
  return (chapter?.pages ?? []).map((page: Page) => (page.source.kind === 'url' ? page.source.url : null));
}

/** Makes an `<img>` look decoded, as happy-dom never decodes images. */
export function markDecoded(image: HTMLImageElement, naturalWidth = 800): void {
  Object.defineProperty(image, 'complete', { configurable: true, value: true });
  Object.defineProperty(image, 'naturalWidth', { configurable: true, value: naturalWidth });
}
