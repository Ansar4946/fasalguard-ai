import type { NextFunction, Request, Response } from 'express';

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.removeHeader('X-Powered-By');
  next();
}
