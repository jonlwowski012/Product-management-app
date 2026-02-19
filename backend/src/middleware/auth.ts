import { Request, Response, NextFunction } from 'express';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  next();
}
