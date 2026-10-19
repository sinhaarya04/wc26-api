import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "./auth";
import { User } from "../models/user";

/**
 * requireAdmin — verify a Supabase Bearer JWT AND that the bearer is an admin.
 * Replies 401 if missing/invalid token, 403 if authenticated but not admin.
 */

declare module "express-serve-static-core" {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface Request {
    userId?: string;
    isAdmin?: boolean;
  }
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || !/^Bearer$/i.test(parts[0])) {
    res.status(401).json({ error: "Token malformatted" });
    return;
  }

  const claims = await verifyToken(parts[1]);
  if (!claims || !claims.sub) {
    res.status(401).json({ error: "Token invalid" });
    return;
  }
  const sub = claims.sub;

  const user = await User.findById(sub)
    .select("+isAdmin")
    .lean<{ _id: string; isAdmin?: boolean }>();
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  if (!user.isAdmin) {
    res.status(403).json({ error: "Forbidden — admin only" });
    return;
  }

  req.userId = sub;
  req.isAdmin = true;
  next();
}

export default requireAdmin;
