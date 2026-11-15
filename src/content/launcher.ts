/** Floating "Read in book mode" button, isolated from the page in its own shadow root. */
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createShadowRootUi, type ShadowRootContentScriptUi } from 'wxt/utils/content-script-ui/shadow-root';
import type { LauncherControl } from './environment';

/** Custom element hosting the launcher; `launcher.css` scopes its `:host` rules to it. */
export const LAUNCHER_ELEMENT = 'mr-launcher';

/** Class added one frame after mounting, so the entrance transition plays. */
const VISIBLE_CLASS = 'mr-launcher--visible';

/** Page events kept from reaching the site's own handlers (its reader may react to clicks and keys). */
const ISOLATED_EVENTS = ['click', 'pointerdown', 'mousedown', 'keydown', 'keyup', 'keypress'];

/** Texts of the launcher, already translated. */
export interface LauncherTexts {
  label: string;
  title: string;
  pageCount(count: number): string;
}

/** Builds the button. Exported for tests. */
export function createLauncherButton(
  texts: LauncherTexts,
  pageCount: number,
  onOpen: () => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mr-launcher__button';
  button.title = texts.title;
  const count = texts.pageCount(pageCount);
  button.setAttribute('aria-label', `${texts.label}, ${count}`);

  const seal = document.createElement('span');
  seal.className = 'mr-launcher__seal';
  seal.setAttribute('aria-hidden', 'true');
  seal.textContent = '読';

  const label = document.createElement('span');
  label.className = 'mr-launcher__label';
  label.textContent = texts.label;
  const small = document.createElement('small');
  small.className = 'mr-launcher__count';
  small.textContent = count;
  label.append(small);

  button.append(seal, label);
  button.addEventListener('click', () => {
    onOpen();
  });
  return button;
}

/** Launcher bound to the content script context: removed automatically when the context ends. */
export function createLauncher(ctx: ContentScriptContext, texts: LauncherTexts): LauncherControl {
  let ui: Promise<ShadowRootContentScriptUi<void>> | null = null;
  let current: { pageCount: number; onOpen: () => void } = { pageCount: 0, onOpen: () => undefined };
  let visible = false;
  const shouldShow = (): boolean => visible && ctx.isValid;

  const getUi = (): Promise<ShadowRootContentScriptUi<void>> =>
    (ui ??= createShadowRootUi(ctx, {
      name: LAUNCHER_ELEMENT,
      position: 'inline',
      anchor: () => document.documentElement,
      isolateEvents: ISOLATED_EVENTS,
      onMount: (container) => {
        const button = createLauncherButton(texts, current.pageCount, current.onOpen);
        container.append(button);
        ctx.requestAnimationFrame(() => button.classList.add(VISIBLE_CLASS));
      },
    }));

  return {
    async show(options) {
      current = options;
      visible = true;
      const launcher = await getUi();
      // Hidden again (or context gone) while the stylesheet was loading.
      if (!shouldShow()) return;
      launcher.remove();
      launcher.mount();
    },
    hide() {
      visible = false;
      void ui?.then((launcher) => {
        if (!visible) launcher.remove();
      });
    },
  };
}
