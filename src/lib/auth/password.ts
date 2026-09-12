import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Password hashing with scrypt from node:crypto.
 *
 * scrypt rather than bcrypt so there is no native module to compile: the Docker
 * image stays small and `npm install` never needs a toolchain. Format is
 * `scrypt$N$r$p$salt$hash`, all base64url, so the parameters can be raised
 * later without invalidating existing hashes: every hash is verified with the
 * parameters it was written with, and `needsRehash` tells the caller when a
 * stored hash is behind.
 *
 * This module deliberately imports nothing but node:crypto. The Docker image
 * copies this single file into the runtime so the seed can hash the first
 * password, and any further import would have to be copied with it.
 */
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

/**
 * Parameters for new hashes. N=2^17 with r=8, p=1 is the OWASP minimum for
 * scrypt and costs about 128 MB of memory and a fraction of a second per
 * attempt, which is the point: it is the only brake on someone working through
 * a stolen hash offline.
 */
const PARAMS: ScryptParams = { N: 131072, r: 8, p: 1 };

// A stored hash is data, and parsing it decides how much memory the process is
// about to allocate, so the parameters are range-checked before they are used.
const MAX_N = 1 << 20;
const MAX_R = 32;
const MAX_P = 16;

/**
 * A syntactically valid hash at the current parameters, for spending the same
 * effort on an unknown username as on a known one. It has to parse and it has
 * to carry a full-length key, or verifying it would return early and the timing
 * would say whether the username exists.
 */
export const TIMING_DUMMY_HASH = [
  'scrypt',
  PARAMS.N,
  PARAMS.r,
  PARAMS.p,
  'A'.repeat(22),
  'A'.repeat(86),
].join('$');

/**
 * Node refuses to run when `128 * N * r` exceeds `maxmem`, and its default is
 * 32 MB — a quarter of what N=131072 needs. Doubling the requirement leaves
 * room for the working buffers; the parameters reaching here are bounded, so
 * this cannot be talked into an unbounded allocation by a stored hash.
 */
function maxmemFor(params: ScryptParams): number {
  return 128 * params.N * params.r * 2;
}

function deriveKey(
  password: string,
  salt: Buffer,
  keyLength: number,
  params: ScryptParams,
): Promise<Buffer> {
  const options: ScryptOptions = { ...params, maxmem: maxmemFor(params) };
  return new Promise((resolve, reject) => {
    // The parameters are passed explicitly. Leaving them out silently uses
    // Node's defaults, which is how the stored `$N$r$p$` segments came to be
    // decorative: raising them changed the string and not the computation.
    scryptCallback(password.normalize('NFKC'), salt, keyLength, options, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

interface StoredHash {
  params: ScryptParams;
  salt: Buffer;
  hash: Buffer;
}

function parseStored(stored: string): StoredHash | null {
  const parts = stored.split('$');
  if (parts.length !== 6) return null;

  const [scheme, rawN, rawR, rawP, saltB64, hashB64] = parts;
  if (scheme !== 'scrypt' || !rawN || !rawR || !rawP || !saltB64 || !hashB64) return null;

  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  // N must be a power of two greater than one; scrypt rejects anything else.
  if (!Number.isInteger(N) || N < 2 || N > MAX_N || (N & (N - 1)) !== 0) return null;
  if (!Number.isInteger(r) || r < 1 || r > MAX_R) return null;
  if (!Number.isInteger(p) || p < 1 || p > MAX_P) return null;

  const salt = Buffer.from(saltB64, 'base64url');
  const hash = Buffer.from(hashB64, 'base64url');
  if (salt.length === 0 || hash.length === 0) return null;

  return { params: { N, r, p }, salt, hash };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await deriveKey(password, salt, KEY_LENGTH, PARAMS);
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
  const parsed = parseStored(stored);
  if (!parsed) return false;

  try {
    const derived = await deriveKey(password, parsed.salt, parsed.hash.length, parsed.params);
    // Constant-time compare so a wrong password cannot be found by timing.
    return derived.length === parsed.hash.length && timingSafeEqual(derived, parsed.hash);
  } catch {
    return false;
  }
}

/**
 * True when a stored hash was written with weaker parameters than the ones in
 * use now. Sign-in is the only moment the plaintext is available, so that is
 * where an old hash can be quietly replaced with a current one.
 */
export function needsRehash(stored: string): boolean {
  const parsed = parseStored(stored);
  // A hash that cannot be read is not at the current parameters by definition.
  if (!parsed) return true;
  return parsed.params.N < PARAMS.N || parsed.params.r < PARAMS.r || parsed.params.p < PARAMS.p;
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
