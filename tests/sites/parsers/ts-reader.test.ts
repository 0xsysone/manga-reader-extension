import { describe, expect, it } from 'vitest';
import { imagesFromTsReader, parseTsReader } from '@/sites/parsers/ts-reader';

describe('parseTsReader', () => {
  it('extracts the configuration, strings with braces included', () => {
    const script =
      'foo; ts_reader.run({"a":"x}{\\"y","prevUrl":"https:\\/\\/s\\/65","sources":[{"source":"S1","images":["https:\\/\\/i\\/1.jpg"]}]});bar';
    const config = parseTsReader(script);
    expect(config?.a).toBe('x}{"y');
    expect(config?.prevUrl).toBe('https://s/65');
    expect(imagesFromTsReader(config)).toEqual(['https://i/1.jpg']);
  });

  it('reads a call at the very start of the text', () => {
    expect(parseTsReader('ts_reader.run({"a":1});')).toEqual({ a: 1 });
  });

  it('is null without a valid object argument', () => {
    expect(parseTsReader('nothing here')).toBeNull();
    expect(parseTsReader('ts_reader.run({"a":')).toBeNull();
    expect(parseTsReader('ts_reader.run({bad json});')).toBeNull();
    expect(parseTsReader('ts_reader.run(foo);')).toBeNull();
    expect(parseTsReader('ts_reader.run([1,2]);')).toBeNull();
    expect(parseTsReader('var x = {"a":1};')).toBeNull();
    expect(parseTsReader(undefined)).toBeNull();
  });
});

describe('imagesFromTsReader', () => {
  it('uses the default source and keeps http(s) URLs only', () => {
    const config = {
      defaultSource: 'S2',
      sources: [
        { source: 'S1', images: ['https://a/1.jpg'] },
        { source: 'S2', images: ['https://b/1.jpg', 'javascript:alert(1)', 42, 'http://b/2.jpg'] },
      ],
    };
    expect(imagesFromTsReader(config)).toEqual(['https://b/1.jpg', 'http://b/2.jpg']);
  });

  it('falls back to the first source', () => {
    expect(imagesFromTsReader({ sources: [{ source: 'S1', images: ['https://a/1.jpg'] }] })).toEqual([
      'https://a/1.jpg',
    ]);
  });

  it('is empty without usable sources', () => {
    expect(imagesFromTsReader({ sources: [] })).toEqual([]);
    expect(imagesFromTsReader(null)).toEqual([]);
    expect(imagesFromTsReader({ sources: [{ source: 'S1' }] })).toEqual([]);
    expect(imagesFromTsReader({})).toEqual([]);
    expect(imagesFromTsReader({ sources: 'x' })).toEqual([]);
  });
});
