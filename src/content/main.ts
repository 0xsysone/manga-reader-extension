/** Entry point of the content-script logic, called by `entrypoints/reader.content`. */
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { ChapterSession } from './chapter-session';
import { listenForMessages } from './messaging';
import { createPageEnvironment, LOG_PREFIX } from './page-environment';

/**
 * Starts a session for this page. A second injection of the script (registration + immediate
 * `executeScript` on enable) invalidates the first context, which disposes its session: no global flag.
 */
export function startContentScript(ctx: ContentScriptContext): ChapterSession {
  const session = new ChapterSession(createPageEnvironment(ctx));
  ctx.onInvalidated(() => {
    session.dispose();
  });
  listenForMessages(ctx, session);
  // Single-page sites (MangaDex…) change the URL without loading a new page.
  ctx.addEventListener(window, 'wxt:locationchange', (event) => {
    session.handleLocationChange(event.newUrl);
  });
  session.start().catch((error: unknown) => {
    console.warn(LOG_PREFIX, 'start failed', error);
  });
  return session;
}
