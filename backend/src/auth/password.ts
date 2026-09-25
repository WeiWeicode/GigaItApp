/**
 * 密碼雜湊:Node 內建 scrypt(不需原生套件),格式 scrypt$N$r$p$salt$hash(base64url)。
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const N = 16384;
const R = 8;
const P = 1;
const KEY_LEN = 32;

function scrypt(password: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCb(password, salt, KEY_LEN, opts, (err, key) => (err ? reject(err) : resolve(key))));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const key = await scrypt(password, Buffer.from(salt, 'base64url'), { N: Number(n), r: Number(r), p: Number(p) });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** 密碼規則:至少 8 碼,含英文字母與數字 */
export function checkPasswordPolicy(password: string): string | null {
  if (password.length < 8) return '密碼至少 8 碼';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return '密碼需包含英文字母與數字';
  return null;
}

/** 臨時密碼(重設用):12 碼,保證含字母與數字 */
export function generateTempPassword(): string {
  const [a = 0, d = 0] = randomBytes(2);
  return randomBytes(8).toString('base64url').slice(0, 10) + 'abcdefghjkmnpqrstuvwxyz'[a % 23] + String(d % 10);
}
