import { beforeEach, describe, expect, it } from 'vitest';
import {
  leaveNavigationIntent,
  TAB_KEYS,
  takeLegacyTabState,
  takeNavigationIntent,
} from '@/services/tab-state';

describe('tab state', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('hands an intent over to the next page and clears it once read', () => {
    leaveNavigationIntent(sessionStorage, { autostart: true, openAtEndPath: '/manga/1' });

    expect(takeNavigationIntent(sessionStorage)).toEqual({ autostart: true, openAtEndPath: '/manga/1' });
    expect(takeNavigationIntent(sessionStorage)).toEqual({ autostart: false, openAtEndPath: null });
    expect(sessionStorage.getItem(TAB_KEYS.autostart)).toBeNull();
  });

  it('reads and clears the 1.x flags', () => {
    sessionStorage.setItem('yomu:autostart', '1');
    sessionStorage.setItem('yomu:startAtEnd', '/old');

    expect(takeNavigationIntent(sessionStorage)).toEqual({ autostart: true, openAtEndPath: '/old' });
    expect(sessionStorage.length).toBe(0);
  });

  it('returns the 1.x position of the current path and deletes every legacy position', () => {
    sessionStorage.setItem('yomu:pos:/chapter-2', '5');
    sessionStorage.setItem('yomu:pos:/chapter-1', '9');
    sessionStorage.setItem('unrelated', 'x');

    expect(takeLegacyTabState(sessionStorage, '/chapter-2')).toEqual({ position: 5 });
    expect(sessionStorage.length).toBe(1);
    expect(takeLegacyTabState(sessionStorage, '/chapter-2')).toEqual({ position: null });
  });

  it('ignores an invalid 1.x position', () => {
    sessionStorage.setItem('yomu:pos:/c', 'abc');
    expect(takeLegacyTabState(sessionStorage, '/c')).toEqual({ position: null });
  });
});
