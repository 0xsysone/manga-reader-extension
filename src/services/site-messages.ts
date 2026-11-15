/** Service-worker side of the {@link SiteMessage} requests sent by the popup. */
import { clearPending, disableSite, enableSite } from './sites';
import { isSiteMessage, toReply, type MessageReply, type SiteMessage } from './messages';

/** Performs a site request. */
export async function handleSiteMessage(message: SiteMessage): Promise<boolean | null> {
  if (message.type === 'mr:enableSite') {
    const enabled = await enableSite(message.host, message.tabId);
    await clearPending(message.host);
    return enabled;
  }
  await disableSite(message.host);
  return null;
}

/**
 * `runtime.onMessage` listener: answers site requests (always, errors included) and ignores the rest.
 * Returns `true` to keep the channel open for the asynchronous reply.
 */
export function siteMessageListener(
  message: unknown,
  _sender: unknown,
  sendResponse: (reply: MessageReply<boolean | null>) => void,
): true | undefined {
  if (!isSiteMessage(message)) return undefined;
  void toReply(() => handleSiteMessage(message)).then(sendResponse);
  return true;
}
