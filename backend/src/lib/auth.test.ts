import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './auth.js';

describe('auth', () => {
  describe('hashPassword', () => {
    it('returns a salt:hash string', () => {
      const result = hashPassword('mysecret');
      const parts = result.split(':');

      expect(parts).toHaveLength(2);
      // Salt is 16 random bytes → 32 hex chars
      expect(parts[0]).toHaveLength(32);
      // Key length is 64 bytes → 128 hex chars
      expect(parts[1]).toHaveLength(128);
    });

    it('produces different hashes for the same password (unique salts)', () => {
      const hash1 = hashPassword('samepassword');
      const hash2 = hashPassword('samepassword');

      expect(hash1).not.toEqual(hash2);
    });
  });

  describe('verifyPassword', () => {
    it('returns true for a matching password', () => {
      const stored = hashPassword('correcthorse');

      expect(verifyPassword('correcthorse', stored)).toBe(true);
    });

    it('returns false for a wrong password', () => {
      const stored = hashPassword('correcthorse');

      expect(verifyPassword('wrongpassword', stored)).toBe(false);
    });

    it('returns false for a malformed stored hash (no colon)', () => {
      expect(verifyPassword('anything', 'nocolonhere')).toBe(false);
    });

    it('returns false for an empty stored hash', () => {
      expect(verifyPassword('anything', '')).toBe(false);
    });
  });
});
