// Copies the shared crypto files into the edge functions that need them. Each function is
// deployed on its own, so it cannot import from src/. A test checks the copies stay identical.
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';

export const TARGETS = {
  'resend-inbound': ['bytes.ts', 'seal.ts', 'envelope.ts'],
  'deliver-local': ['bytes.ts', 'seal.ts', 'attest.ts'],
};

// Same exports as src/lib/crypto/noble.ts, resolved through Deno's npm: specifiers at the same pins.
const NOBLE = `// Edge-function counterpart of src/lib/crypto/noble.ts. Keep the versions in step with package.json.
export { xchacha20poly1305 } from 'npm:@noble/ciphers@2.4.0/chacha.js';
export { x25519 } from 'npm:@noble/curves@2.4.0/ed25519.js';
export { hkdf } from 'npm:@noble/hashes@2.4.0/hkdf.js';
export { sha256 } from 'npm:@noble/hashes@2.4.0/sha2.js';
export { randomBytes } from 'npm:@noble/hashes@2.4.0/utils.js';
`;

for (const [fn, files] of Object.entries(TARGETS)) {
  const dest = `supabase/functions/${fn}/crypto`;
  mkdirSync(dest, { recursive: true });
  for (const f of files) copyFileSync(`src/lib/crypto/${f}`, `${dest}/${f}`);
  writeFileSync(`${dest}/noble.ts`, NOBLE);
  console.log(fn, '←', files.join(', '), '+ noble.ts');
}
