// June 12, 2026 1:00 PM ET = June 12 17:00 UTC.
// Single source of truth for the bracket lock. Every deadline check anywhere
// in the codebase must import this constant. Do not hardcode the date elsewhere.
export const SUBMISSION_DEADLINE_UTC = new Date("2026-06-12T17:00:00.000Z");
