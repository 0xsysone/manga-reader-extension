/** A dotted web domain made of letters, digits and dashes (no single-label hosts such as `localhost`). */
const WEB_DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const IPV4_ADDRESS = /^\d+(\.\d+){3}$/;
const WWW_PREFIX = 'www.';

/** Normalizes a hostname (`www.Example.com.` → `example.com`); `null` when it is not a web domain. */
export function siteHost(hostname: string | null | undefined): string | null {
  const host = (hostname ?? '')
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^www\./, '');
  return WEB_DOMAIN.test(host) ? host : null;
}

function matchPattern(host: string): string {
  return `*://${host}/*`;
}

/**
 * Host permission patterns that cover one site: the exact host and its `www.` variant
 * (an IPv4 address alone). Subdomains are deliberately not included, so enabling a site on a
 * shared suffix (`github.io`, `blogspot.com`) never grants its neighbours. `null` for a non-web host.
 */
export function sitePatterns(hostname: string | null | undefined): string[] | null {
  const host = siteHost(hostname);
  if (host === null) return null;
  if (IPV4_ADDRESS.test(host)) return [matchPattern(host)];
  return [matchPattern(host), matchPattern(WWW_PREFIX + host)];
}
