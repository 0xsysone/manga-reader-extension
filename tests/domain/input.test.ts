import { describe, expect, it } from 'vitest';
import { keyToAction, swipeToAction, zoneToAction, type KeyPress } from '@/domain/input';

const key = (name: string, modifiers: Omit<KeyPress, 'key'> = {}): KeyPress => ({
  key: name,
  shiftKey: false,
  ...modifiers,
});

describe('keyToAction', () => {
  it('maps the arrows to the physical book sides', () => {
    expect(keyToAction(key('ArrowLeft'), 'rtl')).toBe('next');
    expect(keyToAction(key('ArrowRight'), 'rtl')).toBe('prev');
    expect(keyToAction(key('ArrowLeft'), 'ltr')).toBe('prev');
    expect(keyToAction(key('ArrowRight'), 'ltr')).toBe('next');
  });

  it('maps space, page and vertical keys regardless of direction', () => {
    expect(keyToAction(key(' '), 'rtl')).toBe('next');
    expect(keyToAction(key('Spacebar'), 'rtl')).toBe('next');
    expect(keyToAction(key(' ', { shiftKey: true }), 'rtl')).toBe('prev');
    expect(keyToAction(key('PageDown'), 'ltr')).toBe('next');
    expect(keyToAction(key('ArrowDown'), 'rtl')).toBe('next');
    expect(keyToAction(key('PageUp'), 'ltr')).toBe('prev');
    expect(keyToAction(key('ArrowUp'), 'rtl')).toBe('prev');
    expect(keyToAction(key('Home'), 'rtl')).toBe('first');
    expect(keyToAction(key('End'), 'rtl')).toBe('last');
    expect(keyToAction(key('Escape'), 'rtl')).toBe('close');
  });

  it('maps letter shortcuts case-insensitively', () => {
    expect(keyToAction(key('D'), 'rtl')).toBe('cycleMode');
    expect(keyToAction(key('m'), 'rtl')).toBe('toggleTheme');
    expect(keyToAction(key('t'), 'rtl')).toBe('toggleTheme');
    expect(keyToAction(key('s'), 'rtl')).toBe('toggleDirection');
    expect(keyToAction(key('o'), 'rtl')).toBe('toggleOffset');
    expect(keyToAction(key('a'), 'rtl')).toBe('cycleAnimation');
    expect(keyToAction(key('f'), 'rtl')).toBe('fullscreen');
    expect(keyToAction(key('z'), 'rtl')).toBe('zoom');
    expect(keyToAction(key('n'), 'rtl')).toBe('nextChapter');
    expect(keyToAction(key('p'), 'rtl')).toBe('prevChapter');
    expect(keyToAction(key('h'), 'rtl')).toBe('help');
    expect(keyToAction(key('?'), 'rtl')).toBe('help');
  });

  it('ignores unknown keys and browser shortcuts', () => {
    expect(keyToAction(key('x'), 'rtl')).toBeNull();
    expect(keyToAction(key('constructor'), 'rtl')).toBeNull();
    expect(keyToAction(key('ArrowLeft', { metaKey: true }), 'rtl')).toBeNull();
    expect(keyToAction(key('f', { ctrlKey: true }), 'rtl')).toBeNull();
    expect(keyToAction(key('f', { altKey: true }), 'rtl')).toBeNull();
  });
});

describe('zoneToAction', () => {
  it('turns forward with a click on the left in right-to-left reading', () => {
    expect(zoneToAction(0.1, 'rtl')).toBe('next');
    expect(zoneToAction(0.9, 'rtl')).toBe('prev');
    expect(zoneToAction(0.1, 'ltr')).toBe('prev');
    expect(zoneToAction(0.9, 'ltr')).toBe('next');
  });

  it('toggles the UI in the middle, bounds included', () => {
    expect(zoneToAction(0.5, 'rtl')).toBe('toggleUi');
    expect(zoneToAction(0.38, 'rtl')).toBe('toggleUi');
    expect(zoneToAction(0.62, 'rtl')).toBe('toggleUi');
    expect(zoneToAction(0.379, 'rtl')).toBe('next');
    expect(zoneToAction(0.621, 'rtl')).toBe('prev');
  });
});

describe('swipeToAction', () => {
  it('turns forward when pulling toward the right in right-to-left reading', () => {
    expect(swipeToAction(120, 5, 'rtl')).toBe('next');
    expect(swipeToAction(-120, 5, 'rtl')).toBe('prev');
    expect(swipeToAction(120, 5, 'ltr')).toBe('prev');
    expect(swipeToAction(-120, 5, 'ltr')).toBe('next');
  });

  it('needs at least 40 px of horizontal travel', () => {
    expect(swipeToAction(39, 0, 'rtl')).toBeNull();
    expect(swipeToAction(40, 0, 'rtl')).toBe('next');
    expect(swipeToAction(-40, 0, 'rtl')).toBe('prev');
  });

  it('rejects gestures less than 1.3 times more horizontal than vertical', () => {
    expect(swipeToAction(100, 90, 'rtl')).toBeNull();
    expect(swipeToAction(130, 100, 'rtl')).toBe('next');
    expect(swipeToAction(129, 100, 'rtl')).toBeNull();
  });
});
