import { Request, Response, NextFunction } from 'express';

/**
 * Simple password authentication middleware
 * For Phase 1 only - use proper auth in production
 */
export function simpleAuth(req: Request, res: Response, next: NextFunction): void {
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    res.status(500).json({ error: 'Authentication not configured' });
    return;
  }

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // Support both "Bearer password" and just "password" formats
  const token = authHeader.startsWith('Bearer ') 
    ? authHeader.substring(7) 
    : authHeader;

  if (token !== adminPassword) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  next();
}

