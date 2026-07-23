/**
 * ARCH_REVIEW: Web Crypto keypair helpers using ECDSA with P-256.
 *
 * Algorithm choice rationale:
 * - P-256 (ES256) has the broadest Web Crypto support across Chrome, Firefox, Safari.
 * - Ed25519 would be faster and have smaller signatures, but Safari's Web Crypto
 *   implementation lacks Ed25519 support as of mid-2026.
 * - ECDH (for symmetric key exchange in Phase 2 E2E) could share the same P-256 curve.
 *   If we switch to ECDH, this module would be replaced with a combined ECDSA+ECDH key
 *   (P-256 can do both) — revisit when adding E2E encryption.
 */

const KEY_ALGORITHM: EcKeyGenParams = {
  name: 'ECDSA',
  namedCurve: 'P-256',
};

const SIGN_ALGORITHM: EcdsaParams = {
  name: 'ECDSA',
  hash: { name: 'SHA-256' },
};

const KEY_USAGES: KeyUsage[] = ['sign', 'verify'];

/**
 * Generate an ephemeral ECDSA P-256 keypair.
 * Returns both the CryptoKey objects and base64-encoded SPKI public key string.
 */
export async function generateKeypair(): Promise<{
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicKeyBase64: string;
}> {
  const { privateKey, publicKey } = await crypto.subtle.generateKey(
    KEY_ALGORITHM,
    false, // non-exportable private key (prevents exfiltration from the browser)
    KEY_USAGES
  );

  const spki = await crypto.subtle.exportKey('spki', publicKey);
  const publicKeyBase64 = arrayBufferToBase64(spki);

  return { privateKey, publicKey, publicKeyBase64 };
}

/**
 * Sign a message with the private key.
 * Returns base64-encoded signature.
 */
export async function sign(
  privateKey: CryptoKey,
  data: string
): Promise<string> {
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    SIGN_ALGORITHM,
    privateKey,
    encoder.encode(data)
  );
  return arrayBufferToBase64(signature);
}

/**
 * Verify a signature against a public key.
 * The public key can be a CryptoKey or a base64 SPKI string (imported on the fly).
 */
export async function verify(
  publicKey: CryptoKey | string,
  data: string,
  signatureBase64: string
): Promise<boolean> {
  const key =
    typeof publicKey === 'string'
      ? await importPublicKey(publicKey)
      : publicKey;

  const encoder = new TextEncoder();
  const signature = base64ToArrayBuffer(signatureBase64);

  return crypto.subtle.verify(
    SIGN_ALGORITHM,
    key,
    signature,
    encoder.encode(data)
  );
}

/**
 * Import a base64-encoded SPKI public key string into a CryptoKey.
 */
export async function importPublicKey(
  publicKeyBase64: string
): Promise<CryptoKey> {
  const spki = base64ToArrayBuffer(publicKeyBase64);
  return crypto.subtle.importKey(
    'spki',
    spki,
    KEY_ALGORITHM,
    true, // extractable so we can re-export if needed
    ['verify']
  );
}

/**
 * Export a CryptoKey public key to base64 SPKI string.
 */
export async function exportPublicKey(
  publicKey: CryptoKey
): Promise<string> {
  const spki = await crypto.subtle.exportKey('spki', publicKey);
  return arrayBufferToBase64(spki);
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}