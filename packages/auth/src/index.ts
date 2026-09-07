import * as argon2 from 'argon2';
import jwt from 'jsonwebtoken';

export type Role = 'ADMIN' | 'STAFF' | 'STUDENT';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}

export function signJwt(payload: object, secret: string, expiresIn: string): string {
  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
}

export function verifyJwt(token: string, secret: string): object {
  return jwt.verify(token, secret, { algorithms: ['HS256'] }) as object;
}
