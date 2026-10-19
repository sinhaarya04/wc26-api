import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * User account. The _id is the Supabase UUID (string) — set by lazy
 * registration in the auth middleware when a user first hits the API.
 *
 * Auth is handled entirely by Supabase (E[X] platform). This model stores
 * only the fields the WC26 game needs for predictions and leaderboard.
 */
const UserSchema = new Schema(
  {
    _id:      { type: String, required: true },
    name:     { type: String, required: true },
    email:    { type: String, required: true, unique: true, lowercase: true },
    isAdmin:  { type: Boolean, default: false, select: false },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false, _id: false },
);

export type UserDoc = InferSchemaType<typeof UserSchema>;
export const User = model("User", UserSchema);
export default User;
