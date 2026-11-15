/**
 * Tiny DOM builders. Text always goes through `textContent`: strings that come from the site
 * (titles, chapter labels) can never be parsed as markup.
 */

export type Child = Node | string | null | undefined | false;

/** Creates an element with optional classes and children (strings become text nodes). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  children: readonly Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  append(node, children);
  return node;
}

/** Appends children, skipping empty ones. */
export function append(parent: ParentNode, children: readonly Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child);
  }
}

/** Replaces all children of `parent`. */
export function replace(parent: Element, children: readonly Child[]): void {
  parent.replaceChildren();
  append(parent, children);
}

/** Sets text only when it changed (avoids needless mutations and live-region chatter). */
export function setText(node: Node, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/** Forces a style flush so that a following class change starts a CSS transition. */
export function reflow(node: HTMLElement): void {
  node.getBoundingClientRect();
}

export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

/** `true` for an `http(s):` URL, the only kind the reader links to. */
export function isWebUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const { protocol } = new URL(url, location.href);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** Shrinks a canvas to nothing so the browser can release its backing store right away. */
export function releaseCanvases(root: ParentNode): void {
  for (const canvas of root.querySelectorAll('canvas')) {
    canvas.width = 0;
    canvas.height = 0;
  }
}
