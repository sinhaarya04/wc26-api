import type { Request, Response } from "express";
import { User } from "../models/user";
import { Score } from "../models/Score";
import { Prediction } from "../models/Prediction";
import {
  buildLeaderboard,
  type ScoreRow,
  type UserRow,
} from "../services/leaderboardService";

/**
 * Fold a flat list of `{userId, submittedAt}` rows into a map of
 * userId → MAX(submittedAt). This is the user's "finalisation time", the
 * fourth and final leaderboard tiebreaker (earlier wins).
 */
function buildSubmissionTimes(
  rows: Array<{ userId: unknown; submittedAt: unknown }>,
): Map<string, Date> {
  const out = new Map<string, Date>();
  for (const r of rows) {
    const uid =
      typeof r.userId === "string"
        ? r.userId
        : r.userId == null
          ? ""
          : String(r.userId);
    if (!uid) continue;
    const t = r.submittedAt instanceof Date ? r.submittedAt : new Date(r.submittedAt as string);
    if (Number.isNaN(t.getTime())) continue;
    const cur = out.get(uid);
    if (!cur || t.getTime() > cur.getTime()) out.set(uid, t);
  }
  return out;
}

/**
 * GET /leaderboard/overall — all E[X] users. No company scoping.
 */
export async function getOverallLeaderboard(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    // User _id is now a string (Supabase UUID). companyId no longer exists.
    const users = (await User.find({}).select({ _id: 1, name: 1 }).lean()) as Array<{
      _id: string;
      name: string;
    }>;

    // Map to UserRow shape expected by buildLeaderboard (companyId is vestigial).
    const userRows: UserRow[] = users.map((u) => ({
      _id: u._id,
      name: u.name,
      companyId: "northeastern",
    }));

    const userIds = users.map((u) => u._id);
    const [scores, predictionRows] = await Promise.all([
      Score.find({ userId: { $in: userIds } })
        .select({ userId: 1, points: 1, exact: 1, outcome: 1 })
        .lean<ScoreRow[]>(),
      Prediction.find({ userId: { $in: userIds } })
        .select({ userId: 1, submittedAt: 1 })
        .lean<Array<{ userId: unknown; submittedAt: unknown }>>(),
    ]);

    const submissionTimes = buildSubmissionTimes(predictionRows);
    const rows = buildLeaderboard(userRows, scores, undefined, submissionTimes);
    res.json({ leaderboard: rows });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}
