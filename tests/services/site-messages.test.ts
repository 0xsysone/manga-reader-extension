import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { isSiteMessage, sendToWorker } from '@/services/messages';
import { siteMessageListener } from '@/services/site-messages';
import { getEnabledSites } from '@/services/sites';
import { pendingActivationItem } from '@/services/storage';
import { installFakeExtensionApis, type FakeExtensionApis } from './fake-extension-apis';

let apis: FakeExtensionApis;

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  apis = installFakeExtensionApis();
  fakeBrowser.runtime.onMessage.addListener(siteMessageListener);
});

describe('site messages', () => {
  it('validates the message shape', () => {
    expect(isSiteMessage({ type: 'mr:enableSite', host: 'a.test', tabId: 1 })).toBe(true);
    expect(isSiteMessage({ type: 'mr:disableSite', host: 'a.test' })).toBe(true);
    expect(isSiteMessage({ type: 'mr:enableSite', host: 'a.test', tabId: '1' })).toBe(false);
    expect(isSiteMessage({ type: 'mr:status' })).toBe(false);
  });

  it('enables a site in the worker, clears the pending activation and replies', async () => {
    apis.granted.add('*://a.test/*').add('*://www.a.test/*');
    await pendingActivationItem.setValue({ host: 'a.test', tabId: 2 });

    await expect(sendToWorker({ type: 'mr:enableSite', host: 'a.test', tabId: 2 })).resolves.toBe(true);

    expect(await getEnabledSites()).toEqual(['a.test']);
    expect(await pendingActivationItem.getValue()).toBeNull();
  });

  it('replies with the error when the operation fails', async () => {
    vi.mocked(fakeBrowser.scripting.registerContentScripts).mockRejectedValue(new Error('quota'));

    await expect(sendToWorker({ type: 'mr:enableSite', host: 'a.test' })).rejects.toThrow('quota');
  });

  it('ignores messages that are not site requests', () => {
    expect(siteMessageListener({ type: 'mr:status' }, {}, vi.fn())).toBeUndefined();
  });
});
