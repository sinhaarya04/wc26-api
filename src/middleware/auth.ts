import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { config } from "../config/env";
import { User } from "../models/user";

/**
 * Supabase JWT-bearer middleware.
 *
 * Verifies `Authorization: Bearer <token>` using whichever signing scheme the
 * token uses:
 *   - ES256 / RS256 (newer Supabase "JWT Signing Keys") — verified against the
 *     project's public JWKS at `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`.
 *   - HS256 (legacy shared secret) — verified with SUPABASE_JWT_SECRET.
 *
 * Extracts the `sub` claim as `req.userId` (Supabase UUID).
 *
 * Lazy registration: if no User doc exists for this `sub`, one is created
 * automatically from the JWT's `email` and `user_metadata` claims.
 */

declare module "express-serve-static-core" {
  interface Request {
    userId?: string;
  }
}

interface SupabaseClaims {
  sub: string;
  email?: string;
  user_metadata?: {
    display_name?: string;
    full_name?: string;
  };
}

// JWKS is fetched once and cached by jose; rotates automatically when Supabase
// rotates keys. Only constructed if SUPABASE_URL is set.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (jwks) return jwks;
  if (!config.SUPABASE_URL) return null;
  jwks = createRemoteJWKSet(
    new URL(`${config.SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
  );
  return jwks;
}

export async function verifyToken(token: string): Promise<SupabaseClaims | null> {
  // Peek at the header to decide which path to use.
  const header = jwt.decode(token, { complete: true })?.header;
  const alg = header?.alg;

  if (alg && alg !== "HS256") {
    // Asymmetric (ES256/RS256/EdDSA) — verify via JWKS.
    const set = getJwks();
    if (!set) return null;
    try {
      const { payload } = await jwtVerify(token, set);
      return payload as unknown as SupabaseClaims;
    } catch {
      return null;
    }
  }

  // HS256 legacy path.
  try {
    const decoded = jwt.verify(token, config.SUPABASE_JWT_SECRET, {
      algorithms: ["HS256"],
    });
    if (typeof decoded === "string") return null;
    return decoded as unknown as SupabaseClaims;
  } catch {
    return null;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).send({ error: "No token provided" });
    return;
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || !/^Bearer$/i.test(parts[0])) {
    res.status(401).send({ error: "Token malformatted" });
    return;
  }

  const claims = await verifyToken(parts[1]);
  if (!claims) {
    res.status(401).send({ error: "Token invalid" });
    return;
  }

  if (!claims.sub) {
    res.status(401).send({ error: "Token missing sub claim" });
    return;
  }

  req.userId = claims.sub;

  // Lazy registration — ensure a User doc exists for this Supabase user.
  try {
    const existing = await User.findById(claims.sub).lean();
    if (!existing) {
      const email = claims.email ?? "unknown@northeastern.edu";
      const name =
        claims.user_metadata?.display_name ??
        claims.user_metadata?.full_name ??
        email.split("@")[0];
      await User.create({ _id: claims.sub, name, email });
    }
  } catch (err) {
    // Duplicate key race — another request created the doc first. Safe to ignore.
    if ((err as { code?: number }).code !== 11000) {
      console.error("Lazy registration failed:", err);
    }
  }

  next();
}

export default requireAuth;
