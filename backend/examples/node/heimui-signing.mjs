/**
 * Signs HeimUI screens: ES256, in the JWS format the SDK verifies.
 *
 * One signature, two ways to deliver it:
 *
 * - `signDetached(bytes)` is the `X-Heim-Signature` header for a response whose body is exactly
 *   `bytes`. What a service that answers the device sends.
 * - `seal(bytes)` is the screen with its signature wrapped around it. What goes in a bucket or on a
 *   CDN, which cannot send a header of its own.
 *
 * Sign last. Whatever produces the bytes -- hydration, localisation, serialisation -- runs first, and
 * nothing touches the body afterwards: the app verifies the bytes it receives, one by one.
 *
 * `verifyDetached` and `openSealed` are the checks the SDK makes, for your tests. The device never
 * needs them from you.
 *
 * No dependencies. Node 16 or later.
 */
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';

const b64url = (bytes) => Buffer.from(bytes).toString('base64url');

/**
 * The RFC 7638 thumbprint of a P-256 public key: the `kid` a signature names, and the value the SDK
 * derives from the key the app trusts. Computed, never chosen, so the two cannot disagree.
 */
export function keyIdOf(key) {
  // A PEM, a private key to derive it from, or a public key already: createPublicKey refuses the last.
  const publicKey = typeof key === 'object' && key !== null && key.type === 'public' ? key : createPublicKey(key);
  const { crv, kty, x, y } = publicKey.export({ format: 'jwk' });
  if (kty !== 'EC' || crv !== 'P-256') throw new Error('ES256 needs a P-256 key');
  const canonical = `{"crv":"${crv}","kty":"${kty}","x":"${x}","y":"${y}"}`;
  return b64url(createHash('sha256').update(canonical).digest());
}

/** A signer for one PKCS#8 private key (`-----BEGIN PRIVATE KEY-----`). */
export function createSigner(privateKeyPem) {
  const privateKey = createPrivateKey(privateKeyPem);
  const publicKey = createPublicKey(privateKey);
  const keyId = keyIdOf(publicKey);
  const protectedHeader = b64url(JSON.stringify({ alg: 'ES256', kid: keyId }));

  // `ieee-p1363` is r || s, which JWS defines for ES256. Node's default is DER, which the SDK refuses.
  const signInput = (input) =>
    b64url(sign('sha256', Buffer.from(input, 'ascii'), { key: privateKey, dsaEncoding: 'ieee-p1363' }));

  return {
    keyId,
    /** What the app puts in `HeimConfig.trustedSigningKeys`. */
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),

    signDetached(bytes) {
      return `${protectedHeader}..${signInput(`${protectedHeader}.${b64url(bytes)}`)}`;
    },

    seal(bytes) {
      const payload = b64url(bytes);
      return JSON.stringify({ protected: protectedHeader, payload, signature: signInput(`${protectedHeader}.${payload}`) });
    },
  };
}

/** Canonical, unpadded base64url, or null. Two spellings of one payload must not both verify. */
function decodeCanonical(text) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  const bytes = Buffer.from(text, 'base64url');
  return b64url(bytes) === text ? bytes : null;
}

function check(publicKeyPem, protectedHeader, payload, signature) {
  const headerBytes = decodeCanonical(protectedHeader);
  if (headerBytes === null || decodeCanonical(payload) === null) return false;

  let header;
  try {
    header = JSON.parse(headerBytes.toString('utf8'));
  } catch {
    return false;
  }
  if (header === null || typeof header !== 'object' || Array.isArray(header)) return false;
  // Exactly ES256 -- never `none`, never whatever the header asks for -- and nothing half-understood.
  if (header.alg !== 'ES256' || 'crit' in header || 'b64' in header) return false;
  if (header.kid !== keyIdOf(publicKeyPem)) return false;

  const raw = decodeCanonical(signature);
  if (raw === null || raw.length !== 64) return false;
  return verify(
    'sha256',
    Buffer.from(`${protectedHeader}.${payload}`, 'ascii'),
    { key: createPublicKey(publicKeyPem), dsaEncoding: 'ieee-p1363' },
    raw
  );
}

/** Whether `header` is a detached ES256 signature by `publicKeyPem` over exactly `bytes`. */
export function verifyDetached(publicKeyPem, bytes, header) {
  if (typeof header !== 'string') return false;
  const parts = header.split('.');
  if (parts.length !== 3 || parts[1] !== '') return false;
  return check(publicKeyPem, parts[0], b64url(bytes), parts[2]);
}

/** The screen inside a sealed copy when its signature holds, otherwise null. */
export function openSealed(publicKeyPem, text) {
  let sealed;
  try {
    sealed = JSON.parse(text);
  } catch {
    return null;
  }
  if (sealed === null || typeof sealed !== 'object') return null;
  const { protected: protectedHeader, payload, signature } = sealed;
  if (![protectedHeader, payload, signature].every((part) => typeof part === 'string')) return null;
  return check(publicKeyPem, protectedHeader, payload, signature) ? Buffer.from(payload, 'base64url') : null;
}
