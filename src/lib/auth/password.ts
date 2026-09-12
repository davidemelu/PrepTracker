import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

/**
 * Password hashing with scrypt from node:crypto.
 *
 * scrypt rather than bcrypt so there is no native module to compile: the Docker
 * image stays small and `npm install` never needs a toolchain. Format is
 * `scrypt$N$r$p$salt$hash`, all base64url, so the parameters can be raised
 * later without invalidating existing hashes.
 */
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const PARAMS = { N: 16384, r: 8, p: 1 } as const;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH);
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, , , , saltB64, hashB64] = parts;
  if (!saltB64 || !hashB64) return false;

  try {
    const salt = Buffer.from(saltB64, 'base64url');
    const expected = Buffer.from(hashB64, 'base64url');
    const derived = await scrypt(password.normalize('NFKC'), salt, expected.length);
    // Constant-time compare so a wrong password cannot be found by timing.
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export interface PasswordStrength {
  ok: boolean;
  message?: string;
}

export function checkPasswordStrength(password: string): PasswordStrength {
  if (password.length < 8) {
    return { ok: false, message: 'Password must be at least 8 characters.' };
  }
  if (password.length > 200) {
    return { ok: false, message: 'Password must be 200 characters or fewer.' };
  }
  return { ok: true };
}
