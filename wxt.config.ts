import { defineConfig } from 'wxt';

const E2E_ORIGIN = 'http://127.0.0.1/*';

export default defineConfig({
  srcDir: 'src',
  // Explicit imports everywhere: easier to read, search and type-check.
  imports: false,
  modules: ['@wxt-dev/i18n/module'],
  manifest: ({ mode }) => ({
    name: '__MSG_extName__',
    short_name: '__MSG_extShortName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    permissions: ['storage', 'scripting', 'activeTab'],
    optional_host_permissions: ['*://*/*'],
    action: { default_title: 'Manga Reader' },
    // End-to-end tests (`--mode e2e`) run against a local server, so that origin is granted up front.
    ...(mode === 'e2e' && { host_permissions: [E2E_ORIGIN] }),
  }),
  hooks: {
    // The runtime-registered content script declares `*://*/*` so its UI stylesheet is web-accessible on any
    // site the user enables. WXT copies those matches into host_permissions; access must stay opt-in per site
    // (optional_host_permissions), so the blanket grant is removed here.
    'build:manifestGenerated': (_wxt, manifest) => {
      const declared = (manifest.host_permissions ?? []) as string[];
      const hostPermissions = declared.filter((pattern) => pattern !== '*://*/*');
      if (hostPermissions.length > 0) manifest.host_permissions = hostPermissions;
      else delete manifest.host_permissions;
    },
  },
});
