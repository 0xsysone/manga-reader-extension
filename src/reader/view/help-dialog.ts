import { i18n } from '#i18n';
import type { Direction } from '@/shared/types';
import { h, replace } from '../dom';

type KeyLabel =
  | 'nextPage'
  | 'prevPage'
  | 'startEnd'
  | 'chapterNextPrev'
  | 'modeCycle'
  | 'shiftPairs'
  | 'readingDirection'
  | 'animation'
  | 'themeToggle'
  | 'zoomFollows'
  | 'fullscreen'
  | 'close';

/** Modal list of the keyboard shortcuts. */
export class HelpDialog {
  readonly element: HTMLElement;
  private readonly card: HTMLElement;
  private returnFocus: HTMLElement | null = null;

  constructor(onDismiss: () => void) {
    this.card = h('div', 'mr-help-card mr-glass');
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-modal', 'true');
    this.card.setAttribute('aria-labelledby', 'mr-help-title');
    this.card.tabIndex = -1;
    this.element = h('div', 'mr-help', [this.card]);
    this.element.addEventListener('click', (event) => {
      if (event.target === this.element) onDismiss();
    });
  }

  get isOpen(): boolean {
    return this.element.classList.contains('is-visible');
  }

  /** Opens the dialog and moves the focus into it; `returnFocus` gets it back on close. */
  open(direction: Direction, returnFocus: HTMLElement | null): void {
    const rtl = direction === 'rtl';
    const row = (label: KeyLabel, keys: readonly string[]): HTMLElement =>
      h('div', 'mr-key', [
        h('span', '', [i18n.t(label)]),
        h(
          'span',
          '',
          keys.map((key) => h('kbd', '', [key])),
        ),
      ]);
    const space = i18n.t('keySpace');
    const title = h('h2', '', [i18n.t('shortcuts')]);
    title.id = 'mr-help-title';
    replace(this.card, [
      title,
      h('p', 'mr-help-sub', [i18n.t(rtl ? 'helpRtl' : 'helpLtr')]),
      h('div', 'mr-keys', [
        row('nextPage', [rtl ? '←' : '→', space]),
        row('prevPage', [rtl ? '→' : '←', `⇧ ${space}`]),
        row('startEnd', ['↖', '↘']),
        row('chapterNextPrev', ['N', 'P']),
        row('modeCycle', ['D']),
        row('shiftPairs', ['O']),
        row('readingDirection', ['S']),
        row('animation', ['A']),
        row('themeToggle', ['M']),
        row('zoomFollows', ['Z']),
        row('fullscreen', ['F']),
        row('close', [i18n.t('keyEsc')]),
      ]),
      h('div', 'mr-help-foot', [i18n.t(rtl ? 'helpFootRtl' : 'helpFootLtr')]),
    ]);
    this.returnFocus = returnFocus;
    this.element.classList.add('is-visible');
    this.card.focus({ preventScroll: true });
  }

  close(): void {
    if (!this.isOpen) return;
    this.element.classList.remove('is-visible');
    const target = this.returnFocus;
    this.returnFocus = null;
    if (target?.isConnected) target.focus({ preventScroll: true });
  }

  /** Keeps Tab inside the dialog while it is open. Returns `true` when the key was handled. */
  trapFocus(event: KeyboardEvent): boolean {
    if (!this.isOpen || event.key !== 'Tab') return false;
    this.card.focus({ preventScroll: true });
    return true;
  }
}
