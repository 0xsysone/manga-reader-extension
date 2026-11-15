import type { PageSize } from '@/domain/layout';
import { fitPage } from '@/domain/layout';
import { spreadShift, spreadSides } from '@/domain/spreads';
import type { Direction, PageSlice, Spread, SpreadSides } from '@/shared/types';
import { h, releaseCanvases } from './dom';
import type { PageLoader } from './page-loader';

/** Margin (px) kept around the book. */
export const BOOK_PADDING = 12;
/** Canvas pages are drawn at most at this device pixel ratio. */
const MAX_CANVAS_PIXEL_RATIO = 2;

export type Side = 'left' | 'right';
export type SlotSide = Side | 'single';

export const otherSide = (side: Side): Side => (side === 'left' ? 'right' : 'left');

/** Geometry of the open book for the current viewport and settings. */
export interface BookLayout {
  double: boolean;
  /** Size of one page of a double spread. */
  pageSize: PageSize;
  viewport: PageSize;
  /** Reference page ratio (median of the portrait pages). */
  referenceRatio: number;
  direction: Direction;
}

/** Builds page elements (an `<img>` for URL pages, a canvas for pages the site decoded itself). */
export class PageRenderer {
  constructor(
    private readonly loader: PageLoader,
    private readonly viewport: () => PageSize,
  ) {}

  /** A page (or half of a wide page) for `side`; `gutter` adds the binding shadow toward the spine. */
  render(slice: PageSlice, side: SlotSide, gutter: boolean): HTMLDivElement {
    const page = h('div', 'mr-page');
    const media = this.media(slice.page, page);
    if (slice.part === 'full') {
      page.append(media);
    } else {
      const half = h('div', 'mr-half', [media]);
      half.style.left = slice.part === 'left' ? '0' : '-100%';
      page.append(half);
      page.classList.add('is-wide-half');
    }
    if (gutter && side !== 'single')
      page.classList.add('has-gutter', side === 'left' ? 'gutter-right' : 'gutter-left');
    return page;
  }

  private media(index: number, page: HTMLElement): HTMLImageElement | HTMLCanvasElement {
    const source = this.loader.pages[index]?.source;
    if (source?.kind !== 'url') return this.canvas(source?.kind === 'element' ? source.element : null, page);
    const image = h('img');
    image.alt = '';
    image.draggable = false;
    image.decoding = 'async';
    image.src = source.url;
    if (this.loader.isLoaded(index) && image.complete) {
      image.classList.add('is-ready');
    } else {
      page.classList.add('is-loading');
      image.addEventListener(
        'load',
        () => {
          image.classList.add('is-ready');
          page.classList.remove('is-loading');
        },
        { once: true },
      );
      image.addEventListener('error', () => page.classList.remove('is-loading'), { once: true });
    }
    return image;
  }

  /**
   * A page the site handed over as an already decoded `<img>` (its URL may be revoked): drawn at display
   * resolution, without a downloadable copy (context menu blocked, like on the site). A page that is still
   * pending shows the loading shimmer until the site delivers it.
   */
  private canvas(element: HTMLImageElement | null, page: HTMLElement): HTMLCanvasElement {
    const canvas = h('canvas');
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    if (!element?.complete || !element.naturalWidth) {
      page.classList.add('is-loading');
      return canvas;
    }
    const { width, height } = this.viewport();
    const cap = Math.ceil(
      Math.max(width, height) * Math.min(window.devicePixelRatio || 1, MAX_CANVAS_PIXEL_RATIO),
    );
    const scale = Math.min(1, cap / Math.max(element.naturalWidth, element.naturalHeight));
    canvas.width = Math.max(1, Math.round(element.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(element.naturalHeight * scale));
    try {
      canvas.getContext('2d')?.drawImage(element, 0, 0, canvas.width, canvas.height);
      canvas.classList.add('is-ready');
    } catch {
      page.classList.add('is-loading');
    }
    return canvas;
  }
}

/** One side of the open book: holds a page and the shadow cast on it by a turning leaf. */
export class PageSlot {
  readonly element: HTMLDivElement;
  /** Shadow cast by the turning leaf (animated by the flip). */
  readonly cast: HTMLDivElement;

  constructor(
    readonly side: SlotSide,
    left: number,
    width: number,
  ) {
    this.cast = h('div', `mr-cast ${side === 'left' ? 'from-right' : 'from-left'}`);
    this.element = h('div', 'mr-slot', [this.cast]);
    this.element.style.left = `${left}px`;
    this.element.style.width = `${width}px`;
  }

  /** Replaces the page shown in this slot (releasing canvases of the old one). */
  fill(page: HTMLElement | null): void {
    for (const child of [...this.element.children]) {
      if (child === this.cast) continue;
      releaseCanvases(child);
      child.remove();
    }
    if (page) this.element.prepend(page);
  }
}

/** The DOM of one open spread, positioned in the middle of the stage. */
export class Book {
  readonly element: HTMLDivElement;
  /** Spread shown (updated by a double-page flip, which reuses the book). */
  spreadIndex: number;
  /** Horizontal translation (px) that centres a lone page. */
  shift = 0;
  readonly left: PageSlot | null = null;
  readonly right: PageSlot | null = null;
  readonly single: PageSlot | null = null;

  constructor(
    spreadIndex: number,
    spread: Spread | undefined,
    layout: BookLayout,
    private readonly renderer: PageRenderer,
    pageRatio: (page: number) => number,
  ) {
    this.spreadIndex = spreadIndex;
    this.element = h('div', 'mr-book');
    if (!spread) return;
    const style = this.element.style;
    if (layout.double) {
      const { width, height } = layout.pageSize;
      Object.assign(style, {
        width: `${width * 2}px`,
        height: `${height}px`,
        marginLeft: `${-width}px`,
        marginTop: `${-height / 2}px`,
      });
      this.left = new PageSlot('left', 0, width);
      this.right = new PageSlot('right', width, width);
      this.element.append(this.left.element, this.right.element);
      const sides = spreadSides(spread, layout.direction);
      this.fillSide('left', sides);
      this.fillSide('right', sides);
      this.setShift(spreadShift(sides) * width);
    } else {
      const first = spread.pages[0] ?? 0;
      const { width, height } = fitPage(
        layout.viewport.width,
        layout.viewport.height,
        pageRatio(first) || layout.referenceRatio,
        1,
        BOOK_PADDING,
      );
      Object.assign(style, {
        width: `${width}px`,
        height: `${height}px`,
        marginLeft: `${-width / 2}px`,
        marginTop: `${-height / 2}px`,
      });
      this.single = new PageSlot('single', 0, width);
      this.element.append(this.single.element);
      this.single.fill(this.renderer.render({ page: first, part: 'full' }, 'single', false));
    }
  }

  slot(side: Side): PageSlot | null {
    return side === 'left' ? this.left : this.right;
  }

  /** Shows `sides[side]` in that slot (with the binding shadow when both sides hold a page). */
  fillSide(side: Side, sides: SpreadSides): void {
    const content = sides[side];
    const gutter = sides.left !== null && sides.right !== null;
    this.slot(side)?.fill(content ? this.renderer.render(content, side, gutter) : null);
  }

  setShift(shift: number): void {
    this.shift = shift;
    this.element.style.transform = `translateX(${shift}px)`;
  }

  /** Removes the book and frees its canvases. */
  destroy(): void {
    releaseCanvases(this.element);
    this.element.remove();
  }
}
