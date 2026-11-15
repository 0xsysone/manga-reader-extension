/** Content-script side of the popup messages ({@link RuntimeMessage}). */
import { browser } from 'wxt/browser';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { isRuntimeMessage, toReply, type MessageReply, type RuntimeReplies } from '@/services/messages';
import type { ChapterStatus, RuntimeMessage } from '@/shared/types';

/** What the popup can ask the page. */
export interface MessageTarget {
  status(): Promise<ChapterStatus>;
  open(): Promise<boolean>;
}

type AnyRuntimeReply = MessageReply<RuntimeReplies[RuntimeMessage['type']]>;

/** Performs a request. */
export function handleRuntimeMessage(
  message: RuntimeMessage,
  target: MessageTarget,
): Promise<AnyRuntimeReply> {
  return message.type === 'mr:status' ? toReply(() => target.status()) : toReply(() => target.open());
}

/**
 * Builds the `runtime.onMessage` listener: answers our requests (always, errors included) and ignores the
 * rest. Returns `true` to keep the channel open for the asynchronous reply.
 */
export function createMessageListener(target: MessageTarget) {
  return (
    message: unknown,
    _sender: unknown,
    sendResponse: (reply: AnyRuntimeReply) => void,
  ): true | undefined => {
    if (!isRuntimeMessage(message)) return undefined;
    void handleRuntimeMessage(message, target).then(sendResponse);
    return true;
  };
}

/** Listens to the popup until the content script is invalidated. */
export function listenForMessages(ctx: ContentScriptContext, target: MessageTarget): void {
  const listener = createMessageListener(target);
  browser.runtime.onMessage.addListener(listener);
  ctx.onInvalidated(() => {
    browser.runtime.onMessage.removeListener(listener);
  });
}
