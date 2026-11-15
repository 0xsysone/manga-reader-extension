import { i18n } from '#i18n';
import type { Direction } from '@/shared/types';
import type { Disposer } from '../disposer';
import { clamp, h, setText } from '../dom';

/** Above this page count, the track shows no tick per page. */
const MAX_TICKS = 80;
/** Pages skipped by Page Up / Page Down on the slider. */
const PAGE_KEY_STEP = 10;
/** Keeps a pointer at the far edge on the last page instead of one past it. */
const EDGE_EPSILON = 0.0001;

export interface ScrubberHandlers {
  /** Show page `page` at once (dragging, Page Up/Down). */
  jumpTo(page: number): void;
  /** Turn one spread forward (`1`) or back (`-1`), animated. */
  step(delta: 1 | -1): void;
  edge(edge: 'first' | 'last'): void;
  /** Small cached image of a page for the hover preview. */
  thumbnail(page: number): Promise<HTMLCanvasElement | null>;
  /** The user started or stopped dragging. */
  dragging(active: boolean): void;
}

export interface ScrubberState {
  direction: Direction;
  total: number;
  /** First page of the current spread (0-based). */
  page: number;
  /** Last page of the current spread (0-based). */
  lastPage: number;
  /** Human label such as `6–7 / 19`. */
  label: string;
}

/**
 * Reading progress as an ARIA slider: fills from the right in right-to-left reading, previews the hovered
 * page, can be dragged, and answers the arrow, Home / End and Page Up / Down keys.
 */
export class Scrubber {
  readonly element: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly ticks: HTMLElement;
  private readonly preview: HTMLElement;
  private readonly previewCanvas: HTMLCanvasElement;
  private readonly previewLabel: HTMLElement;
  private state: ScrubberState = { direction: 'rtl', total: 0, page: 0, lastPage: 0, label: '' };
  private previewPage = -1;
  private dragging = false;

  constructor(
    private readonly handlers: ScrubberHandlers,
    disposer: Disposer,
  ) {
    this.fill = h('div', 'mr-fill');
    this.ticks = h('div', 'mr-ticks');
    this.knob = h('div', 'mr-knob');
    this.previewCanvas = h('canvas', 'mr-preview-canvas');
    this.previewLabel = h('div', 'mr-preview-label');
    this.preview = h('div', 'mr-preview mr-glass', [
      h('div', 'mr-preview-img', [this.previewCanvas]),
      this.previewLabel,
    ]);
    this.preview.setAttribute('aria-hidden', 'true');
    this.element = h('div', 'mr-scrub', [
      h('div', 'mr-track', [this.fill, this.ticks, this.knob]),
      this.preview,
    ]);
    this.element.tabIndex = 0;
    this.element.setAttribute('role', 'slider');
    this.element.setAttribute('aria-label', i18n.t('reading'));
    this.element.setAttribute('aria-valuemin', '1');

    const element = this.element;
    disposer.listen(element, 'pointermove', (event) => {
      const { page, x } = this.pageAt(event.clientX);
      this.showPreview(page, x);
      if (this.dragging) handlers.jumpTo(page);
    });
    disposer.listen(element, 'pointerleave', () => {
      if (!this.dragging) this.hidePreview();
    });
    disposer.listen(element, 'pointerdown', (event) => {
      this.dragging = true;
      this.element.classList.add('is-dragging');
      handlers.dragging(true);
      try {
        this.element.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic pointer: nothing to capture.
      }
      handlers.jumpTo(this.pageAt(event.clientX).page);
    });
    const end = (): void => {
      if (!this.dragging) return;
      this.dragging = false;
      this.element.classList.remove('is-dragging');
      this.hidePreview();
      handlers.dragging(false);
    };
    disposer.listen(element, 'pointerup', end);
    disposer.listen(element, 'pointercancel', end);
  }

  update(state: ScrubberState): void {
    if (state.total !== this.state.total) this.renderTicks(state.total);
    this.state = state;
    const fraction = state.total ? (state.lastPage + 1) / state.total : 0;
    this.fill.style.width = `${fraction * 100}%`;
    this.knob.style.left = `${(state.direction === 'rtl' ? 1 - fraction : fraction) * 100}%`;
    this.element.setAttribute('aria-valuemax', String(Math.max(1, state.total)));
    this.element.setAttribute('aria-valuenow', String(Math.min(state.total, state.page + 1)));
    this.element.setAttribute('aria-valuetext', state.label);
  }

  /** Handles a key pressed while the slider has focus. Returns `true` when the key was used. */
  handleKey(event: KeyboardEvent): boolean {
    const rtl = this.state.direction === 'rtl';
    switch (event.key) {
      case 'ArrowLeft':
        this.handlers.step(rtl ? 1 : -1);
        return true;
      case 'ArrowRight':
        this.handlers.step(rtl ? -1 : 1);
        return true;
      case 'ArrowUp':
        this.handlers.step(1);
        return true;
      case 'ArrowDown':
        this.handlers.step(-1);
        return true;
      case 'Home':
        this.handlers.edge('first');
        return true;
      case 'End':
        this.handlers.edge('last');
        return true;
      case 'PageUp':
        this.handlers.jumpTo(clamp(this.state.page + PAGE_KEY_STEP, 0, this.state.total - 1));
        return true;
      case 'PageDown':
        this.handlers.jumpTo(clamp(this.state.page - PAGE_KEY_STEP, 0, this.state.total - 1));
        return true;
      default:
        return false;
    }
  }

  /** Page under the pointer (the track is mirrored in right-to-left reading). */
  private pageAt(clientX: number): { page: number; x: number } {
    const rect = this.element.getBoundingClientRect();
    const x = clientX - rect.left;
    let fraction = clamp(rect.width ? x / rect.width : 0, 0, 1 - EDGE_EPSILON);
    if (this.state.direction === 'rtl') fraction = 1 - fraction;
    const page = clamp(Math.floor(fraction * this.state.total), 0, Math.max(0, this.state.total - 1));
    return { page, x };
  }

  /** Updates the preview only when the hovered page changes; the image is a small cached thumbnail. */
  private showPreview(page: number, x: number): void {
    this.preview.style.left = `${x}px`;
    this.preview.classList.add('is-visible');
    if (page === this.previewPage) return;
    this.previewPage = page;
    setText(this.previewLabel, i18n.t('pageN', [page + 1]));
    this.previewCanvas.width = 0;
    this.previewCanvas.height = 0;
    void this.handlers.thumbnail(page).then((thumbnail) => {
      if (!thumbnail || this.previewPage !== page) return;
      this.previewCanvas.width = thumbnail.width;
      this.previewCanvas.height = thumbnail.height;
      try {
        this.previewCanvas.getContext('2d')?.drawImage(thumbnail, 0, 0);
      } catch {
        // Thumbnail unavailable: the placeholder stays.
      }
    });
  }

  private hidePreview(): void {
    this.preview.classList.remove('is-visible');
    this.previewPage = -1;
  }

  private renderTicks(total: number): void {
    this.ticks.replaceChildren();
    if (total > MAX_TICKS) return;
    for (let index = 0; index < total; index++) this.ticks.append(h('span', 'mr-tick'));
  }
}
