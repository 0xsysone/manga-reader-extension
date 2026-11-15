/**
 * Message envelopes between the popup, the service worker and the content script.
 * Every request gets a reply, failures included, so a sender never waits forever.
 */
import { browser } from 'wxt/browser';
import { isRecord } from '@/domain/guards';
import type { ChapterStatus, RuntimeMessage } from '@/shared/types';

/** Reply to any message: the value, or the error message. */
export type MessageReply<T> = { ok: true; value: T } | { ok: false; error: string };

/** What the content script answers to each {@link RuntimeMessage}. */
export interface RuntimeReplies {
  'mr:status': ChapterStatus;
  /** `true` when the reader is (now) open. */
  'mr:open': boolean;
}

/** Requests handled by the service worker, the only writer of the enabled-sites list. */
export type SiteMessage =
  { type: 'mr:enableSite'; host: string; tabId?: number } | { type: 'mr:disableSite'; host: string };

/** What the service worker answers to each {@link SiteMessage}. */
export interface SiteReplies {
  'mr:enableSite': boolean;
  'mr:disableSite': null;
}

const RUNTIME_TYPES: readonly string[] = ['mr:status', 'mr:open'] satisfies RuntimeMessage['type'][];

/** Type guard for messages sent to the content script. */
export function isRuntimeMessage(value: unknown): value is RuntimeMessage {
  return isRecord(value) && typeof value.type === 'string' && RUNTIME_TYPES.includes(value.type);
}

/** Type guard for messages sent to the service worker. */
export function isSiteMessage(value: unknown): value is SiteMessage {
  if (!isRecord(value) || typeof value.host !== 'string') return false;
  if (value.type === 'mr:disableSite') return true;
  return value.type === 'mr:enableSite' && (value.tabId === undefined || typeof value.tabId === 'number');
}

/** Turns any thrown value into a readable message. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Runs `task` and wraps its outcome in a {@link MessageReply}. Never rejects. */
export async function toReply<T>(task: () => Promise<T>): Promise<MessageReply<T>> {
  try {
    return { ok: true, value: await task() };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

function isReply(value: unknown): value is MessageReply<unknown> {
  return isRecord(value) && typeof value.ok === 'boolean';
}

/** Sends a message to the content script of a tab. `null` when nothing answers (no script there). */
export async function sendToTab<M extends RuntimeMessage>(
  tabId: number,
  message: M,
): Promise<MessageReply<RuntimeReplies[M['type']]> | null> {
  try {
    const reply: unknown = await browser.tabs.sendMessage(tabId, message);
    return isReply(reply) ? (reply as MessageReply<RuntimeReplies[M['type']]>) : null;
  } catch {
    return null;
  }
}

/** Sends a request to the service worker. Rejects with the worker's error message on failure. */
export async function sendToWorker<M extends SiteMessage>(message: M): Promise<SiteReplies[M['type']]> {
  const reply: unknown = await browser.runtime.sendMessage(message);
  if (!isReply(reply)) throw new Error('No reply from the service worker');
  if (!reply.ok) throw new Error(reply.error);
  return reply.value as SiteReplies[M['type']];
}
