import type { Request, Response } from "express";
import { User } from "../models/user";

/**
 * Auth is handled by Supabase (E[X] platform). The middleware does lazy
 * registration, so by the time a handler runs, the User doc exists.
 *
 *   GET /auth/me — return the current user's profile.
 */

export async function getMe(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const user = await User.findById(req.userId).lean();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
    },
  });
}
