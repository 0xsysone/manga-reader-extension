import { describe, expect, it } from 'vitest';
import { chapterFromUrl, isAdjacentChapter, parseChapterTitle } from '@/domain/chapter';

describe('parseChapterTitle', () => {
  it('splits a trailing chapter number', () => {
    expect(parseChapterTitle('Sakamoto Days 66')).toEqual({ title: 'Sakamoto Days', chapter: '66' });
    expect(parseChapterTitle('  One Piece -  Chapitre 1100.5 ')).toEqual({
      title: 'One Piece',
      chapter: '1100.5',
    });
    expect(parseChapterTitle('Kagurabachi chapter 3,5')).toEqual({ title: 'Kagurabachi', chapter: '3.5' });
  });

  it('keeps a title without number, or made of a number only', () => {
    expect(parseChapterTitle('Oneshot')).toEqual({ title: 'Oneshot', chapter: '' });
    expect(parseChapterTitle('66')).toEqual({ title: '66', chapter: '' });
    expect(parseChapterTitle(null)).toEqual({ title: '', chapter: '' });
  });

  it('reads the "Title #123: subtitle" format', () => {
    expect(parseChapterTitle('One Piece  #1198: L’île où vivent les monstres')).toEqual({
      title: 'One Piece',
      chapter: '1198',
    });
    expect(parseChapterTitle('Kingdom #889.5')).toEqual({ title: 'Kingdom', chapter: '889.5' });
  });
});

describe('isAdjacentChapter', () => {
  it('wants a greater number for the next chapter and a smaller one for the previous', () => {
    expect(isAdjacentChapter('174', '0', 'next')).toBe(false);
    expect(isAdjacentChapter('174', '175', 'next')).toBe(true);
    expect(isAdjacentChapter('174', '174', 'next')).toBe(false);
    expect(isAdjacentChapter('174', '173', 'prev')).toBe(true);
    expect(isAdjacentChapter('171,5', '171', 'prev')).toBe(true);
    expect(isAdjacentChapter('174', '174', 'prev')).toBe(false);
  });

  it('accepts the candidate when a number is unknown', () => {
    expect(isAdjacentChapter('Extra', '3', 'next')).toBe(true);
    expect(isAdjacentChapter('3', null, 'prev')).toBe(true);
  });
});

describe('chapterFromUrl', () => {
  it('reads a named chapter segment', () => {
    expect(chapterFromUrl('https://s.io/manga/chapitre-12/')).toBe('12');
    expect(chapterFromUrl('https://s.io/manga/Chapter_3,5')).toBe('3.5');
    expect(chapterFromUrl('https://s.io/manga/chap 7/page/2')).toBe('7');
  });

  it('falls back to a trailing number, a dash being a decimal separator', () => {
    expect(chapterFromUrl('https://s.io/manga/12/')).toBe('12');
    expect(chapterFromUrl('https://s.io/manga/12-5')).toBe('12.5');
  });

  it('is empty without a number', () => {
    expect(chapterFromUrl('https://s.io/manga/one-piece')).toBe('');
    expect(chapterFromUrl(null)).toBe('');
  });
});
