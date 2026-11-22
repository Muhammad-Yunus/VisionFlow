import crypto from 'node:crypto';
import net from 'node:net';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import type { Request, Response, NextFunction } from 'express';

const EPHEMERAL_JWT_SECRET = crypto.randomBytes(32).toString('hex');

function getJwtSecret(): string {
  return process.env.JWT_SECRET?.trim() || EPHEMERAL_JWT_SECRET;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signAuthToken(user: AuthUser): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    getJwtSecret(),
    { expiresIn: '7d' }
  );
}

export function verifyAuthToken(token: string): AuthUser | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload;
    if (!decoded || typeof decoded.sub !== 'string') {
      return null;
    }
    return {
      id: decoded.sub,
      email: String(decoded.email ?? ''),
      name: String(decoded.name ?? ''),
      role: String(decoded.role ?? 'member'),
    };
  } catch {
    return null;
  }
}

export function extractBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return null;
  }
  return auth.slice(7).trim() || null;
}

export function optionalAuthMiddleware(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  const token = extractBearerToken(req);
  if (token) {
    const user = verifyAuthToken(token);
    if (user) {
      req.user = user;
    }
  }
  next();
}

export function requireAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  const user = verifyAuthToken(token);
  if (!user) {
    res.status(401).json({ error: 'Invalid or expired authentication token.' });
    return;
  }
  req.user = user;
  next();
}

function isPrivateOrLoopbackIp(host: string): boolean {
  const cleanHost = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    cleanHost === 'localhost' ||
    cleanHost === '0.0.0.0' ||
    cleanHost === '::1' ||
    cleanHost.endsWith('.local') ||
    cleanHost.endsWith('.internal')
  ) {
    return true;
  }

  if (net.isIPv4(cleanHost)) {
    const parts = cleanHost.split('.').map(Number);
    const [a, b] = parts;
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }

  if (net.isIPv6(cleanHost)) {
    if (
      cleanHost.startsWith('fe80:') ||
      cleanHost.startsWith('fc') ||
      cleanHost.startsWith('fd') ||
      cleanHost === '::1'
    ) {
      return true;
    }
  }

  return false;
}

export function validateExternalUrl(
  rawUrl: string,
  allowedProtocols: string[] = ['http:', 'https:']
): { valid: boolean; url?: URL; error?: string } {
  try {
    const parsed = new URL(rawUrl.trim());
    if (!allowedProtocols.includes(parsed.protocol)) {
      return {
        valid: false,
        error: `Unsupported URL scheme "${parsed.protocol}". Allowed: ${allowedProtocols.join(', ')}`,
      };
    }
    if (isPrivateOrLoopbackIp(parsed.hostname)) {
      return {
        valid: false,
        error: 'Loopback, private network, and link-local addresses are blocked.',
      };
    }
    return { valid: true, url: parsed };
  } catch {
    return { valid: false, error: 'Invalid URL format.' };
  }
}
