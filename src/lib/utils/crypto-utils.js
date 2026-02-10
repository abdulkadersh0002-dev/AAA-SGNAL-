/**
 * Cryptographic Utilities
 * Secure random number generation and cryptographic operations
 */

import crypto from 'crypto';

/**
 * Generate a cryptographically secure random string
 * Replaces Math.random().toString(36).substr() pattern
 *
 * @param {number} length - Desired length of random string (default: 9)
 * @returns {string} Secure random string using base36 encoding
 */
export function secureRandomString(length = 9) {
  // Generate enough random bytes (4 bytes per base36 char is safe)
  const bytes = crypto.randomBytes(Math.ceil(length * 0.75));
  // Convert to base36 and take desired length
  return bytes.toString('hex').slice(0, length);
}

/**
 * Generate a cryptographically secure random integer
 * Replaces Math.floor(Math.random() * max) pattern
 *
 * @param {number} max - Maximum value (exclusive)
 * @param {number} min - Minimum value (inclusive, default: 0)
 * @returns {number} Secure random integer between min (inclusive) and max (exclusive)
 */
export function secureRandomInt(max, min = 0) {
  if (max <= min) {
    throw new Error('max must be greater than min');
  }
  const range = max - min;
  // Use crypto.randomInt for secure random integers
  return crypto.randomInt(min, max);
}

/**
 * Generate a cryptographically secure random float
 * Replaces Math.random() pattern for float generation
 *
 * @returns {number} Secure random float between 0 (inclusive) and 1 (exclusive)
 */
export function secureRandomFloat() {
  // Generate 4 random bytes for good distribution
  const bytes = crypto.randomBytes(4);
  // Convert to unsigned 32-bit integer
  const randomInt = bytes.readUInt32BE(0);
  // Divide by max value to get float between 0 and 1
  return randomInt / 0xffffffff;
}

/**
 * Generate a cryptographically secure UUID
 * Best for unique identifiers
 *
 * @returns {string} Secure UUID v4
 */
export function secureUUID() {
  return crypto.randomUUID();
}

/**
 * Generate a secure random value in a range
 * Replaces Math.random() * range + min pattern
 *
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Secure random float between min and max
 */
export function secureRandomRange(min, max) {
  if (max <= min) {
    throw new Error('max must be greater than min');
  }
  const range = max - min;
  return secureRandomFloat() * range + min;
}

/**
 * Generate secure random bytes
 * Direct access to crypto.randomBytes
 *
 * @param {number} size - Number of bytes to generate
 * @returns {Buffer} Buffer of random bytes
 */
export function secureRandomBytes(size) {
  return crypto.randomBytes(size);
}

export default {
  secureRandomString,
  secureRandomInt,
  secureRandomFloat,
  secureUUID,
  secureRandomRange,
  secureRandomBytes,
};
