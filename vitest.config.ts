import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// The edge functions import noble through Deno `npm:` specifiers. Map them back to the installed
// packages so their real handlers can be exercised from the same test run as the web app.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: fileURLToPath(new URL('./src/', import.meta.url)) },
      { find: /^npm:@noble\/(ciphers|curves|hashes)@[\d.]+\/(.*)$/, replacement: '@noble/$1/$2' },
    ],
  },
  test: { include: ['src/**/*.test.ts'] },
});
