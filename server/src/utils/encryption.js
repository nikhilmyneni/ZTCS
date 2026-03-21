const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;
const PBKDF2_ITERATIONS = 100000;

/**
 * Derive a per-file encryption key from the master key + random salt.
 */
const deriveKey = (masterKey, salt) => {
  return crypto.pbkdf2Sync(masterKey, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512');
};

/**
 * Encrypt a buffer using AES-256-GCM with a derived per-file key.
 * Returns the encrypted buffer and metadata needed for decryption.
 */
const encryptBuffer = (buffer, masterKey) => {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(masterKey, salt);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedBuffer: encrypted,
    iv: iv.toString('hex'),
    salt: salt.toString('hex'),
    authTag: authTag.toString('hex'),
    algorithm: ALGORITHM,
  };
};

/**
 * Decrypt a buffer using AES-256-GCM with stored metadata.
 * Returns the original plaintext buffer.
 */
const decryptBuffer = (encryptedBuffer, masterKey, ivHex, saltHex, authTagHex) => {
  const iv = Buffer.from(ivHex, 'hex');
  const salt = Buffer.from(saltHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = deriveKey(masterKey, salt);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);

  return decrypted;
};

module.exports = { encryptBuffer, decryptBuffer };
