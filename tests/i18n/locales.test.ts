import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const LOCALES_DIR = join(import.meta.dirname, '../../src/locales');
const DEFAULT_LOCALE = 'en';
const EXPECTED_LOCALES = ['de', 'en', 'es', 'fr', 'id', 'ja', 'pt_BR'];

type Messages = Record<string, string>;

function readLocale(code: string): Messages {
  return JSON.parse(readFileSync(join(LOCALES_DIR, `${code}.json`), 'utf8')) as Messages;
}

/** Positional substitutions (`$1`…`$9`) used by a message, sorted; `$$` is an escaped dollar sign. */
function placeholders(message: string): string[] {
  return [...message.replaceAll('$$', '').matchAll(/\$[1-9]/g)].map((match) => match[0]).sort();
}

const locales = readdirSync(LOCALES_DIR)
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.replace(/\.json$/, ''))
  .sort();
const reference = readLocale(DEFAULT_LOCALE);

describe('locales', () => {
  it('ships every supported language', () => {
    expect(locales).toEqual(EXPECTED_LOCALES);
  });

  it.each(locales)('%s has exactly the keys of the default locale', (code) => {
    expect(Object.keys(readLocale(code)).sort()).toEqual(Object.keys(reference).sort());
  });

  it.each(locales)('%s keeps the placeholders of every message', (code) => {
    const messages = readLocale(code);
    for (const [key, message] of Object.entries(reference)) {
      expect(placeholders(messages[key] ?? ''), key).toEqual(placeholders(message));
    }
  });

  it.each(locales)('%s has no empty message', (code) => {
    const empty = Object.entries(readLocale(code)).filter(([, message]) => message.trim() === '');
    expect(empty).toEqual([]);
  });
});
