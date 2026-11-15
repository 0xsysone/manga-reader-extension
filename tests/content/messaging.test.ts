import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createMessageListener, type MessageTarget } from '@/content/messaging';
import type { ChapterStatus } from '@/shared/types';

const STATUS: ChapterStatus = { found: true, open: false, title: 'Series', chapter: '3', pageCount: 20 };

function target(overrides: Partial<MessageTarget> = {}): MessageTarget {
  return { status: () => Promise.resolve(STATUS), open: () => Promise.resolve(true), ...overrides };
}

beforeEach(() => {
  fakeBrowser.reset();
});

describe('content script messages', () => {
  it('answers mr:status with the chapter status', async () => {
    fakeBrowser.runtime.onMessage.addListener(createMessageListener(target()));

    await expect(fakeBrowser.runtime.sendMessage({ type: 'mr:status' })).resolves.toEqual({
      ok: true,
      value: STATUS,
    });
  });

  it('answers mr:open', async () => {
    const open = vi.fn(() => Promise.resolve(true));
    fakeBrowser.runtime.onMessage.addListener(createMessageListener(target({ open })));

    await expect(fakeBrowser.runtime.sendMessage({ type: 'mr:open' })).resolves.toEqual({
      ok: true,
      value: true,
    });
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('replies with the error instead of leaving the popup waiting', async () => {
    const status = () => Promise.reject(new Error('detection crashed'));
    fakeBrowser.runtime.onMessage.addListener(createMessageListener(target({ status })));

    await expect(fakeBrowser.runtime.sendMessage({ type: 'mr:status' })).resolves.toEqual({
      ok: false,
      error: 'detection crashed',
    });
  });

  it('ignores other messages', () => {
    const listener = createMessageListener(target());
    const sendResponse = vi.fn();

    expect(listener({ type: 'mr:enableSite', host: 'a.test' }, {}, sendResponse)).toBeUndefined();
    expect(listener('mr:status', {}, sendResponse)).toBeUndefined();
    expect(sendResponse).not.toHaveBeenCalled();
  });
});
