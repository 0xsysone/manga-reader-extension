import { describe, expect, it } from 'vitest';
import { extractJsonAfter, parseJsString } from '@/sites/parsers/script-values';

describe('extractJsonAfter', () => {
  it('reads arrays and objects, brackets inside strings included', () => {
    expect(extractJsonAfter('var pages = [{"a":"]"},{"b":2}];', 'var pages =')).toEqual([
      { a: ']' },
      { b: 2 },
    ]);
    expect(extractJsonAfter('f({"x":{"y":[1]}})', 'f(')).toEqual({ x: { y: [1] } });
    expect(extractJsonAfter('f({"quote":"a\\"}b"})', 'f(')).toEqual({ quote: 'a"}b' });
  });

  it('is null when the marker, the value or valid JSON is missing', () => {
    expect(extractJsonAfter('var pages = 3;', 'var pages =')).toBeNull();
    expect(extractJsonAfter('var pages = [1,', 'var pages =')).toBeNull();
    expect(extractJsonAfter('nothing', 'var pages =')).toBeNull();
    expect(extractJsonAfter('var pages = [nope]', 'var pages =')).toBeNull();
    expect(extractJsonAfter(undefined, 'x')).toBeNull();
    expect(extractJsonAfter(null, 'x')).toBeNull();
  });
});

describe('parseJsString', () => {
  it('reads var, let and const declarations with escapes', () => {
    expect(parseJsString('var next_chapter = "https://s.io/a/1" ;', 'next_chapter')).toBe('https://s.io/a/1');
    expect(parseJsString('let prev_chapter="x\\"y";', 'prev_chapter')).toBe('x"y');
    expect(parseJsString('const next_chapter = "";', 'next_chapter')).toBe('');
  });

  it('is null when the variable is missing', () => {
    expect(parseJsString('var other = "a";', 'next_chapter')).toBeNull();
    expect(parseJsString(null, 'x')).toBeNull();
  });

  it('treats the variable name literally', () => {
    expect(parseJsString('var a_b = "x";', 'a.b')).toBeNull();
  });
});
