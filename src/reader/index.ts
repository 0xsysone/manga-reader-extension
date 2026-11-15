import type { ReaderHandle, ReaderOptions } from '@/shared/types';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { Reader } from './reader';

/** Tag name of the element hosting the reader's shadow root. */
export const READER_HOST_NAME = 'manga-reader';
/** Above everything the site may stack. */
const MAX_Z_INDEX = 2147483647;

/**
 * Opens the full-screen reader over the page, inside an isolated shadow root (styles from `reader.css`, imported by
 * the content script with `cssInjectionMode: 'ui'`). The page scroll is locked and the focus moved into the reader
 * until it closes; everything is released when it closes or when the content script is invalidated.
 */
export async function openReader(ctx: ContentScriptContext, options: ReaderOptions): Promise<ReaderHandle> {
  const ui = await createShadowRootUi<Reader>(ctx, {
    name: READER_HOST_NAME,
    position: 'modal',
    zIndex: MAX_Z_INDEX,
    // Keys typed in the reader's widgets never reach the site's own shortcuts.
    isolateEvents: ['keydown', 'keyup', 'keypress'],
    onMount: (container, _shadow, host) =>
      new Reader(
        {
          host,
          container,
          remove: () => {
            ui.remove();
          },
        },
        options,
      ),
    onRemove: (reader) => reader?.dispose(),
  });
  ui.mount();
  const reader = ui.mounted;
  if (!reader) throw new Error('The reader could not be mounted.');
  reader.start();
  return reader.handle;
}
