/**
 * Reader content script. Not declared in the manifest: `services/sites.ts` registers it for each site the
 * user enables (output file `content-scripts/reader.js`) and injects it right away on activation.
 */
import '@/reader/reader.css';
import '@/content/launcher.css';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { startContentScript } from '@/content/main';

export default defineContentScript({
  registration: 'runtime',
  // Only used by WXT to make the UI stylesheet web-accessible on every site the user may enable;
  // wxt.config.ts strips it from host_permissions, which stay optional and per site.
  matches: ['*://*/*'],
  cssInjectionMode: 'ui',
  main(ctx) {
    startContentScript(ctx);
  },
});
