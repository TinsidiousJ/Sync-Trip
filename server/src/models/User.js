import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    userId: String,
    displayName: String,
    sessionCode: String,
    joinedAt: Date
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);