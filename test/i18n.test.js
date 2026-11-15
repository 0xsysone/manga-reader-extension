'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const LOCALES = fs.readdirSync(path.join(ROOT, '_locales')).sort();
const load = (lang) => JSON.parse(read(`_locales/${lang}/messages.json`));
const en = load('en');

// Placeholder names used in a message ($NAME$ is case-insensitive in Chrome).
const used = (msg) => [...msg.matchAll(/\$([A-Za-z0-9_@]+)\$/g)].map((m) => m[1].toLowerCase()).sort();

// Every key the code asks for: T('k'), T(a ? 'k1' : 'k2'), T({ x: 'k' }[s]), help rows k('k', …),
// data-i18n="k" in the popup and __MSG_k__ in the manifest.
function keysUsedInCode() {
  const keys = new Set();
  for (const f of ['src/reader.js', 'src/content.js', 'popup/popup.js']) {
    const src = read(f);
    for (const m of src.matchAll(/\bT\(([^()]*)/g)) for (const s of m[1].matchAll(/(?<![=!]==\s*)'([A-Za-z]+)'/g)) keys.add(s[1]);
    for (const m of src.matchAll(/\bk\('([A-Za-z]+)'/g)) keys.add(m[1]);
  }
  for (const m of read('popup/popup.html').matchAll(/data-i18n="([A-Za-z]+)"/g)) keys.add(m[1]);
  for (const m of read('manifest.json').matchAll(/__MSG_([A-Za-z]+)__/g)) keys.add(m[1]);
  return keys;
}

test('the expected seven languages ship, with English as default', () => {
  assert.deepEqual(LOCALES, ['de', 'en', 'es', 'fr', 'id', 'ja', 'pt_BR']);
  assert.equal(JSON.parse(read('manifest.json')).default_locale, 'en');
});

test('every key used in the code exists in English', () => {
  const keys = keysUsedInCode();
  assert.ok(keys.size > 90, `only ${keys.size} keys found: the scan is broken`);
  const missing = [...keys].filter((k) => !en[k]);
  assert.deepEqual(missing, []);
});

test('no English key is left unused', () => {
  const keys = keysUsedInCode();
  assert.deepEqual(Object.keys(en).filter((k) => !keys.has(k)), []);
});

for (const lang of LOCALES) {
  test(`${lang}: same keys and placeholders as English`, () => {
    const msgs = load(lang);
    assert.deepEqual(Object.keys(msgs).sort(), Object.keys(en).sort());
    for (const [key, entry] of Object.entries(msgs)) {
      assert.equal(typeof entry.message, 'string', key);
      assert.ok(entry.message.trim(), `${lang}.${key} is empty`);
      const names = Object.keys(entry.placeholders || {}).sort();
      assert.deepEqual(names, Object.keys(en[key].placeholders || {}).sort(), `${lang}.${key} placeholders`);
      assert.deepEqual([...new Set(used(entry.message))], names, `${lang}.${key} uses undeclared or skips placeholders`);
      for (const n of names) assert.equal(entry.placeholders[n].content, en[key].placeholders[n].content, `${lang}.${key}.${n}`);
    }
  });
}

test('Chrome Web Store limits: name ≤ 75 chars, short name ≤ 12, description ≤ 132', () => {
  for (const lang of LOCALES) {
    const m = load(lang);
    assert.ok(m.extName.message.length <= 75, `${lang} extName`);
    assert.ok(m.extShortName.message.length <= 12, `${lang} extShortName`);
    assert.ok(m.extDescription.message.length <= 132, `${lang} extDescription (${m.extDescription.message.length})`);
  }
});

test('MRI18n.t passes substitutions to chrome.i18n and falls back to the key', () => {
  const seen = [];
  const sandbox = { chrome: { i18n: { getMessage: (k, subs) => (seen.push([k, subs]), k === 'chapterN' ? `Chapter ${subs[0]}` : ''), getUILanguage: () => 'ja' } } };
  new Function('self', read('src/i18n.js'))(sandbox);
  assert.equal(sandbox.MRI18n.t('chapterN', 12), 'Chapter 12');
  assert.deepEqual(seen[0], ['chapterN', ['12']]);
  assert.equal(sandbox.MRI18n.t('unknownKey'), 'unknownKey');
  assert.equal(sandbox.MRI18n.uiLang(), 'ja');
  const bare = {};
  new Function('self', read('src/i18n.js'))(bare);
  assert.equal(bare.MRI18n.t('read'), 'read');
  assert.equal(bare.MRI18n.uiLang(), 'en');
});
