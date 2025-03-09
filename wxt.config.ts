import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  extensionApi: 'chrome',
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    permissions: [
      // Your other specific permissions here
      "webRequest",
      "webRequestBlocking"
    ],
    // For access to all hosts
    host_permissions: [
      "<all_urls>"
    ]
  }
});
