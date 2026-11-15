import { describe, expect, it } from 'vitest';
import { pickNavLinks, sameSiteUrl } from '@/sites/navigation';

const HERE = 'https://site.io/manga/ch-10/';

describe('pickNavLinks', () => {
  it('ranks class over rel over text, ignoring anchors and other origins', () => {
    const links = [
      { href: '#/next/', text: 'Suivant', className: 'ch-next-btn' },
      { href: 'https://other.io/ch-11', text: 'Next', className: 'next' },
      { href: '/manga/ch-11/', text: 'Chapitre suivant' },
      { href: '/manga/ch-12/', text: 'whatever', rel: 'next' },
      { href: '/manga/ch-9/', text: 'Précédent', className: 'btn prev_page' },
      { href: '/blog/', text: 'Lire la suite de cet article très long qui parle de next et d’autres choses' },
    ];
    expect(pickNavLinks(links, HERE)).toEqual({
      next: 'https://site.io/manga/ch-12/',
      prev: 'https://site.io/manga/ch-9/',
    });
  });

  it('finds a single next or previous link', () => {
    expect(pickNavLinks([{ href: '/manga/ch-11/', text: 'Next ›', className: 'nav-next' }], HERE)).toEqual({
      next: 'https://site.io/manga/ch-11/',
      prev: null,
    });
    expect(pickNavLinks([{ href: '/manga/ch-9/', text: 'previous', rel: 'prev' }], HERE)).toEqual({
      next: null,
      prev: 'https://site.io/manga/ch-9/',
    });
    expect(pickNavLinks([{ href: '/manga/ch-11/', text: 'Chapitre suivant' }], HERE)).toEqual({
      next: 'https://site.io/manga/ch-11/',
      prev: null,
    });
  });

  it('prefers a class name over rel', () => {
    const links = [
      { href: '/a/', text: 'x', rel: 'next' },
      { href: '/b/', text: 'y', className: 'next' },
    ];
    expect(pickNavLinks(links, HERE).next).toBe('https://site.io/b/');
  });

  it('matches link texts up to 40 characters', () => {
    const text40 = 'suivant'.padEnd(40, '.');
    expect(pickNavLinks([{ href: '/c/', text: text40 }], HERE).next).toBe('https://site.io/c/');
    expect(pickNavLinks([{ href: '/c/', text: `${text40}.` }], HERE).next).toBeNull();
  });

  it('ignores the current page and links without href', () => {
    expect(pickNavLinks([{ href: '/manga/ch-10/', text: 'next' }], HERE)).toEqual({ next: null, prev: null });
    expect(pickNavLinks([{ text: 'next' }, { href: '' }], HERE)).toEqual({ next: null, prev: null });
    expect(pickNavLinks([], HERE)).toEqual({ next: null, prev: null });
  });

  it('finds nothing for an invalid current URL', () => {
    expect(pickNavLinks([{ href: '/manga/ch-11/', className: 'next' }], 'not a url')).toEqual({
      next: null,
      prev: null,
    });
  });

  it('never uses one link as both next and previous', () => {
    expect(pickNavLinks([{ href: '/x/', text: 'next / prev' }], HERE)).toEqual({
      next: 'https://site.io/x/',
      prev: null,
    });
  });
});

describe('sameSiteUrl', () => {
  const base = new URL(HERE);

  it('resolves relative links on the same origin', () => {
    expect(sameSiteUrl('../ch-9/', base)).toBe('https://site.io/manga/ch-9/');
  });

  it('is null for other origins, invalid or missing links', () => {
    expect(sameSiteUrl('https://other.io/', base)).toBeNull();
    expect(sameSiteUrl('http://[bad', base)).toBeNull();
    expect(sameSiteUrl(null, base)).toBeNull();
  });
});
