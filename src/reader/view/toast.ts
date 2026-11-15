import type { Disposer } from '../disposer';
import { h, replace, type Child } from '../dom';
import { icon, type IconName } from '../icons';

/** Delay before the toast hides itself when nothing has focus inside it. */
export const TOAST_MS = 5200;

export interface ToastAction {
  label: string;
  icon?: IconName;
  /** The icon follows the label instead of preceding it. */
  iconAfter?: boolean;
  run: () => void;
}

export interface ToastContent {
  title: string;
  /** Text, possibly with `<kbd>` elements (built by the caller, never parsed from strings). */
  detail: readonly Child[];
  action?: ToastAction;
}

/** Message near the bottom of the screen (chapter boundaries, notices), announced politely. */
export class Toast {
  readonly element: HTMLElement;
  private timer: number | undefined;

  /** `onHide` runs whenever the toast goes away (timer, `hide()`). */
  constructor(
    private readonly disposer: Disposer,
    private readonly onHide: () => void,
  ) {
    this.element = h('div', 'mr-toast mr-glass');
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');
  }

  get visible(): boolean {
    return this.element.classList.contains('is-visible');
  }

  /** Shows `content`; it hides itself after `duration` ms unless `duration` is `null` (persistent). */
  show(content: ToastContent, duration: number | null): void {
    const text = h('div', 'mr-toast-text', [
      h('div', 'mr-toast-title', [content.title]),
      h('div', 'mr-toast-sub', content.detail),
    ]);
    const children: Child[] = [text];
    const { action } = content;
    if (action) {
      const button = h('button', 'mr-cta');
      button.type = 'button';
      const label = h('span', '', [action.label]);
      const glyph = action.icon ? icon(action.icon) : null;
      if (action.iconAfter) button.append(label, ...(glyph ? [glyph] : []));
      else button.append(...(glyph ? [glyph] : []), label);
      button.addEventListener('click', () => action.run());
      children.push(button);
    }
    replace(this.element, children);
    this.element.classList.add('is-visible');
    this.disposer.clearTimeout(this.timer);
    this.timer =
      duration === null ? undefined : this.disposer.timeout(() => this.autoHide(duration), duration);
  }

  hide(): void {
    this.disposer.clearTimeout(this.timer);
    this.timer = undefined;
    this.element.classList.remove('is-visible');
    this.onHide();
  }

  private autoHide(duration: number): void {
    const root = this.element.getRootNode() as Document | ShadowRoot;
    if (root.activeElement && this.element.contains(root.activeElement)) {
      // Never pull the toast from under the keyboard focus.
      this.timer = this.disposer.timeout(() => this.autoHide(duration), duration);
      return;
    }
    this.hide();
  }
}
