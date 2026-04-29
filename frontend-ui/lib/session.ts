import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const _envSecret = process.env.SOVEREIGN_JWT_SECRET;
if (!_envSecret && process.env.NODE_ENV === 'production') {
  throw new Error(
    'SOVEREIGN_JWT_SECRET environment variable is not set. ' +
    'Refusing to start in production without a secure secret.'
  );
}
const SECRET = new TextEncoder().encode(
  _envSecret ?? 'sovereign-test-secret-not-for-production'
);

const COOKIE = 'sovereign_session';
const EXPIRE_HOURS = 8;

export interface SessionPayload {
  username: string;
  role: string;
  session_id?: string;
}

export async function encrypt(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${EXPIRE_HOURS}h`)
    .sign(SECRET);
}

export async function decrypt(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET, { algorithms: ['HS256'] });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function createSession(payload: SessionPayload) {
  const token = await encrypt(payload);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: EXPIRE_HOURS * 3600,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return null;
  return decrypt(token);
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE);
}
