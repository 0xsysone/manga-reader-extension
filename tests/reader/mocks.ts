/**
 * Stand-ins for the WXT runtime pieces the reader uses, wired with `vi.mock` in each test file:
 * - `#i18n`: returns the key, with substitutions in parentheses (`chapterN(12)`);
 * - `createShadowRootUi`: a real shadow root on a `<manga-reader>` element, without the CSS fetch.
 */

type Substitution = string | number;

export const i18nModule = {
  i18n: {
    t: (key: string, substitutions?: readonly Substitution[]): string =>
      substitutions?.length ? `${key}(${substitutions.join(',')})` : key,
  },
};

interface UiOptions<T> {
  name: string;
  onMount: (container: HTMLElement, shadow: ShadowRoot, host: HTMLElement) => T;
  onRemove?: (mounted: T | undefined) => void;
}

export const shadowRootModule = {
  createShadowRootUi<T>(_context: unknown, options: UiOptions<T>) {
    const host = document.createElement(options.name);
    const shadow = host.attachShadow({ mode: 'open' });
    const container = document.createElement('div');
    shadow.append(container);
    let mounted: T | undefined;
    return Promise.resolve({
      shadowHost: host,
      shadow,
      uiContainer: container,
      mount() {
        document.body.append(host);
        mounted = options.onMount(container, shadow, host);
      },
      remove() {
        options.onRemove?.(mounted);
        host.remove();
        mounted = undefined;
      },
      autoMount() {
        // Not used by the reader.
      },
      get mounted() {
        return mounted;
      },
    });
  },
};
