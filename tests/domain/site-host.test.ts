import { describe, expect, it } from 'vitest';
import { siteHost, sitePatterns } from '@/domain/site-host';

describe('siteHost', () => {
  it('normalizes the domain', () => {
    expect(siteHost('www.Example.com')).toBe('example.com');
    expect(siteHost('scans.example.co.uk.')).toBe('scans.example.co.uk');
  });

  it('rejects what is not a web domain', () => {
    expect(siteHost('localhost')).toBeNull();
    expect(siteHost('')).toBeNull();
    expect(siteHost('exa mple.com')).toBeNull();
    expect(siteHost(undefined)).toBeNull();
  });
});

describe('sitePatterns', () => {
  it('covers the exact host and its www variant, never other subdomains', () => {
    expect(sitePatterns('www.Example.com')).toEqual(['*://example.com/*', '*://www.example.com/*']);
    expect(sitePatterns('user.github.io')).toEqual(['*://user.github.io/*', '*://www.user.github.io/*']);
  });

  it('covers an IPv4 address exactly', () => {
    expect(sitePatterns('192.168.1.10')).toEqual(['*://192.168.1.10/*']);
  });

  it('is null for a non-web host', () => {
    expect(sitePatterns('chrome')).toBeNull();
    expect(sitePatterns(null)).toBeNull();
  });
});
