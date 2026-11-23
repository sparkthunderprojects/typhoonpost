// Copies the shared crypto files into the edge function that needs them. The function is deployed
// on its own, so it cannot import from src/. A test checks the copies stay identical.
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';

const SHARED = ['bytes.ts', 'seal.ts', 'envelope.ts'];
const DEST = 'supabase/functions/resend-inbound/crypto';
mkdirSync(DEST, { recursive: true });
for (const f of SHARED) copyFileSync(`src/lib/crypto/${f}`, `${DEST}/${f}`);

// Same exports as src/lib/crypto/noble.ts, resolved through Deno's npm: specifiers at the same pins.
writeFileSync(
  `${DEST}/noble.ts`,
  `// Edge-function counterpart of src/lib/crypto/noble.ts. Keep the versions in step with package.json.
export { xchacha20poly1305 } from 'npm:@noble/ciphers@2.4.0/chacha.js';
export { x25519 } from 'npm:@noble/curves@2.4.0/ed25519.js';
export { hkdf } from 'npm:@noble/hashes@2.4.0/hkdf.js';
export { sha256 } from 'npm:@noble/hashes@2.4.0/sha2.js';
export { randomBytes } from 'npm:@noble/hashes@2.4.0/utils.js';
`,
);
console.log('synced', SHARED.join(', '), '+ noble.ts');
