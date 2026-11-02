import type { NextFunction, Request, Response } from "express";
import { verifyToken, type AuthRole } from "../lib/auth";

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Silakan login terlebih dahulu." });
    return;
  }

  const token = header.slice("Bearer ".length).trim();

  try {
    req.auth = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Sesi login tidak valid atau sudah berakhir." });
  }
}

export function requireRole(...roles: AuthRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: "Silakan login terlebih dahulu." });
      return;
    }

    if (!roles.includes(req.auth.role)) {
      res.status(403).json({ error: "Anda tidak memiliki akses untuk aksi ini." });
      return;
    }

    next();
  };
}
