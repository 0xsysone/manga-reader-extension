import { i18n } from '#i18n';
import type { Direction } from '@/shared/types';
import type { Disposer } from '../disposer';
import { h, reflow, setText } from '../dom';
import { icon } from '../icons';
import { setButtonContent, setTip, toolButton } from './button';
import { Scrubber, type ScrubberHandlers } from './scrubber';

/** Vertical travel (px) of the page counter when it changes. */
const COUNTER_BUMP = 6;

export interface DockHandlers extends ScrubberHandlers {
  chapter(direction: 'next' | 'prev'): void;
}

export interface DockState {
  direction: Direction;
  total: number;
  /** First and last page (0-based) of the current spread. */
  page: number;
  lastPage: number;
  /** `6–7 / 19`. */
  label: string;
  /** Direction of the last turn, for the counter animation (0: none). */
  bump: -1 | 0 | 1;
  /** Label of the previous / next chapter (`''` when unknown), `null` when there is none. */
  prevChapter: string | null;
  nextChapter: string | null;
}

/** Bottom bar: chapter buttons, page counter and progress scrubber. */
export class Dock {
  readonly element: HTMLElement;
  readonly scrubber: Scrubber;
  private readonly dock: HTMLElement;
  private readonly prevButton: HTMLButtonElement;
  private readonly nextButton: HTMLButtonElement;
  private readonly counterNow: HTMLElement;
  private readonly counterTotal: HTMLElement;
  private shownDirection: Direction | null = null;
  private shownLabels = '';

  constructor(handlers: DockHandlers, disposer: Disposer) {
    this.prevButton = toolButton('mr-ch-btn');
    this.nextButton = toolButton('mr-ch-btn');
    this.prevButton.addEventListener('click', () => handlers.chapter('prev'));
    this.nextButton.addEventListener('click', () => handlers.chapter('next'));
    setTip(this.prevButton, i18n.t('prevChapter'), 'P');
    setTip(this.nextButton, i18n.t('nextChapter'), 'N');
    this.counterNow = h('span', 'mr-counter-now');
    this.counterTotal = h('span', 'mr-counter-total');
    const counter = h('div', 'mr-counter', [this.counterNow, this.counterTotal]);
    counter.setAttribute('aria-hidden', 'true');
    this.scrubber = new Scrubber(handlers, disposer);
    this.dock = h('div', 'mr-dock mr-glass', [
      this.prevButton,
      counter,
      this.scrubber.element,
      this.nextButton,
    ]);
    this.element = h('footer', 'mr-bottom', [this.dock]);
  }

  update(state: DockState): void {
    const rtl = state.direction === 'rtl';
    const [now = '', total = ''] = state.label.split(' / ');
    if (this.counterNow.textContent !== now) {
      this.counterNow.textContent = now;
      if (state.bump !== 0) {
        this.counterNow.style.setProperty('--bump', `${state.bump * COUNTER_BUMP}px`);
        this.counterNow.classList.remove('bump');
        reflow(this.counterNow);
        this.counterNow.classList.add('bump');
      }
    }
    setText(this.counterTotal, `/ ${total}`);
    this.dock.dataset.dir = state.direction;
    this.scrubber.update(state);

    // Chapter buttons: in right-to-left reading, "next" sits on the left.
    const labels = `${state.direction}|${state.prevChapter ?? '∅'}|${state.nextChapter ?? '∅'}`;
    if (labels !== this.shownLabels || this.shownDirection !== state.direction) {
      const nextText = state.nextChapter ? i18n.t('chShort', [state.nextChapter]) : i18n.t('next');
      const prevText = state.prevChapter ? i18n.t('chShort', [state.prevChapter]) : i18n.t('previous');
      const label = (text: string): HTMLElement => h('span', 'mr-ch-label', [text]);
      setButtonContent(
        this.nextButton,
        rtl ? [icon('left'), label(nextText)] : [label(nextText), icon('right')],
      );
      setButtonContent(
        this.prevButton,
        rtl ? [label(prevText), icon('right')] : [icon('left'), label(prevText)],
      );
      this.shownLabels = labels;
      this.shownDirection = state.direction;
    }
    this.nextButton.disabled = state.nextChapter === null;
    this.prevButton.disabled = state.prevChapter === null;
  }
}
