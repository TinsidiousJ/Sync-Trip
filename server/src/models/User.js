import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    displayName: { type: String, required: true },
    sessionCode: { type: String, required: true, index: true },
    joinedAt: { type: Date, default: Date.now },

    filters: {
      budgetMin: { type: Number, default: null },
      budgetMax: { type: Number, default: null },
      minRating: { type: Number, default: null },
      tags: { type: [String], default: [] },
    },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);