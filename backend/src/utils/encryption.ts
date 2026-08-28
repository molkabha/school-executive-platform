import crypto from 'crypto';

/**
 * Item 11 — Encryption key derivation review.
 *
 * The ORIGINAL (v1) key derivation below — sha256(secret).base64().substr(0,32)
 * — is weaker than a proper KDF: it's a single unsalted hash with an ad-hoc
 * truncation, not something like scrypt/PBKDF2/HKDF with a per-secret salt
 * and iteration/cost factor. However, changing what getKey() returns would
 * silently break decryption of every API key already encrypted in
 * production with the v1 scheme, since v1 has no version marker and the key
 * material is derived identically for encrypt and decrypt.
 *
 * Per the audit instructions ("if it would make existing encrypted
 * production API keys undecryptable, STOP — don't rotate/change the format
 * automatically; if backward-compatible, implement it safely"), this file
 * takes the backward-compatible path:
 *   - v1 ciphertexts (`iv:authTag:encrypted`, no prefix) continue to decrypt
 *     using the EXACT original v1 key derivation — untouched, so nothing
 *     already in the database becomes unreadable.
 *   - All NEW encryptions use a v2 format (`v2:salt:iv:authTag:encrypted`)
 *     with a proper per-secret-random-salt scrypt KDF, which is materially
 *     stronger (salted, memory-hard, unique key per secret) than v1.
 * No existing ciphertext is rewritten or migrated automatically; the two
 * formats simply coexist, and a value naturally upgrades to v2 the next
 * time it's re-saved (e.g. the AI API key is edited again in Settings).
 */

const ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) {
  // In production this is fatal (caught by index.ts startup check).
  // In development, log a warning so the developer knows.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[FATAL] APP_ENCRYPTION_KEY is not set. Cannot encrypt or decrypt secrets.');
  }
  console.warn('[SECURITY WARNING] APP_ENCRYPTION_KEY is not set. Using an insecure development-only fallback. Set this variable before going to production.');
}
const _ENCRYPTION_KEY: string = ENCRYPTION_KEY || 'dev-only-fallback-do-not-use-in-production!!';

const ALGORITHM = 'aes-256-gcm';
const V2_PREFIX = 'v2';
const SCRYPT_KEY_LENGTH = 32;

// --- v1 (legacy) key derivation — DO NOT MODIFY ---
// Preserved byte-for-byte so already-encrypted production secrets remain
// decryptable. Only used on the decrypt path for data without the v2 prefix.
const getKeyV1 = () => {
  return crypto.createHash('sha256').update(String(_ENCRYPTION_KEY)).digest('base64').substr(0, 32);
};

// --- v2 key derivation — used for all new encryptions ---
// scrypt with a random per-secret salt is a proper password-based KDF
// (memory-hard, salted) rather than a single unsalted hash truncation.
const getKeyV2 = (salt: Buffer) => {
  return crypto.scryptSync(String(_ENCRYPTION_KEY), salt, SCRYPT_KEY_LENGTH);
};

export function encryptSecret(text: string): string {
  if (!text) return text;

  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKeyV2(salt), iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  // Format: v2:salt:iv:authTag:encryptedText
  return `${V2_PREFIX}:${salt.toString('hex')}:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptSecret(encryptedData: string): string {
  if (!encryptedData || !encryptedData.includes(':')) return encryptedData;

  try {
    const parts = encryptedData.split(':');

    if (parts[0] === V2_PREFIX) {
      if (parts.length !== 5) return encryptedData;
      const [, saltHex, ivHex, authTagHex, encryptedText] = parts;
      const salt = Buffer.from(saltHex, 'hex');
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');

      const decipher = crypto.createDecipheriv(ALGORITHM, getKeyV2(salt), iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }

    // Legacy v1 format: iv:authTag:encryptedText (no version prefix).
    if (parts.length !== 3) return encryptedData;

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encryptedText = parts[2];

    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(getKeyV1()), iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('[Decryption Error] Failed to decrypt secret.');
    throw new Error('Decryption failed: the encryption key may be incorrect or the data is corrupted.');
  }
}
