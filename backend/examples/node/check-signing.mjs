/**
 * Runs the published signing vectors against this implementation.
 *
 * The vectors are cases the SDK accepts or refuses. A signer that agrees with every one of them, and
 * whose own signatures pass the same checks, produces screens the app will render.
 *
 *     node check-signing.mjs [path/to/es256-vectors.json]
 */
import { readFileSync } from 'node:fs';
import { createSigner, keyIdOf, openSealed, verifyDetached } from './heimui-signing.mjs';

const file = process.argv[2] ?? '../../signing/es256-vectors.json';
const vectors = JSON.parse(readFileSync(file, 'utf8'));

let checks = 0;
const failures = [];
const expect = (name, ok) => {
  checks++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) failures.push(name);
};

expect('the key id is the RFC 7638 thumbprint', keyIdOf(vectors.publicKeyPem) === vectors.keyId);

for (const testCase of vectors.cases) {
  const verdict =
    testCase.delivery === 'header'
      ? verifyDetached(vectors.publicKeyPem, Buffer.from(testCase.body, 'utf8'), testCase.signature)
      : openSealed(vectors.publicKeyPem, testCase.body) !== null;
  expect(`${testCase.valid ? 'accepts' : 'refuses'} ${testCase.name}`, verdict === testCase.valid);
}

// What this implementation signs has to pass the same checks.
const signer = createSigner(vectors.privateKeyPem);
const screen = Buffer.from('{"id":"home","root":{"id":"r","type":"text","text":"Hola, María"}}', 'utf8');
const header = signer.signDetached(screen);

expect('signs under the key id the SDK derives', signer.keyId === vectors.keyId);
expect('a detached signature holds over the exact bytes', verifyDetached(vectors.publicKeyPem, screen, header));
expect(
  'and not over the same screen serialised again',
  !verifyDetached(vectors.publicKeyPem, Buffer.from(JSON.stringify(JSON.parse(screen), null, 2), 'utf8'), header)
);
const opened = openSealed(vectors.publicKeyPem, signer.seal(screen));
expect('a sealed copy opens to the exact bytes', opened !== null && opened.equals(screen));

console.log();
if (failures.length > 0) {
  console.error(`${failures.length} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`${checks}/${checks} checks pass.`);
