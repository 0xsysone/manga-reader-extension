import { h, setText } from '../dom';

/** A toolbar button. Its tooltip is visual only: the accessible name is `aria-label`. */
export function toolButton(className = ''): HTMLButtonElement {
  const button = h('button', `mr-btn ${className}`.trim());
  button.type = 'button';
  return button;
}

/** Sets the tooltip (with an optional shortcut) and the accessible name of a button. */
export function setTip(button: HTMLElement, tip: string, shortcut: string | null = null, label = tip): void {
  let tooltip = button.querySelector<HTMLElement>(':scope > .mr-tip');
  if (!tooltip) {
    tooltip = h('span', 'mr-tip');
    tooltip.setAttribute('aria-hidden', 'true');
    button.append(tooltip);
  }
  const text = tooltip.firstChild ?? tooltip.appendChild(document.createTextNode(''));
  setText(text, tip);
  let kbd = tooltip.querySelector('kbd');
  if (shortcut) {
    kbd ??= tooltip.appendChild(h('kbd'));
    setText(kbd, shortcut);
  } else {
    kbd?.remove();
  }
  if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
}

/** Replaces the visible content of a button, keeping its tooltip. */
export function setButtonContent(button: HTMLElement, content: readonly Node[]): void {
  for (const child of [...button.childNodes]) {
    if (child instanceof HTMLElement && child.classList.contains('mr-tip')) continue;
    child.remove();
  }
  button.prepend(...content);
}
