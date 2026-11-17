import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
export function hashPassword(password: string) { const salt = randomBytes(16).toString('hex'); return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`; }
export function verifyPassword(password: string, hash: string) { if (!hash.startsWith('scrypt$'))
    return false; const [, salt, key] = hash.split('$'); const expected = Buffer.from(key, 'hex'); const actual = scryptSync(password, salt, 64); return expected.length === actual.length && timingSafeEqual(expected, actual); }
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
