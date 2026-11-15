import type { Disposer } from '../disposer';
import { h, replace } from '../dom';
import { icon, type IconName } from '../icons';

/** How long a flash message stays on screen. */
export const FLASH_MS = 1100;

/** Short message in the middle of the screen confirming a setting change (mode, direction…). */
export class Flash {
  readonly element: HTMLElement;
  private timer: number | undefined;

  constructor(private readonly disposer: Disposer) {
    this.element = h('div', 'mr-flash mr-glass');
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');
  }

  show(iconName: IconName, text: string): void {
    replace(this.element, [icon(iconName), h('span', '', [text])]);
    this.element.classList.add('is-visible');
    this.disposer.clearTimeout(this.timer);
    this.timer = this.disposer.timeout(() => this.element.classList.remove('is-visible'), FLASH_MS);
  }
}
