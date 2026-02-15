import mongoose from "mongoose";

const filtersSchema = new mongoose.Schema(
  {
    budgetMin: { type: Number, default: null },
    budgetMax: { type: Number, default: null },
    tags: { type: [String], default: [] },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    displayName: { type: String, required: true },
    sessionCode: { type: String, required: true, index: true },
    joinedAt: { type: Date, default: Date.now },

    filters: { type: filtersSchema, default: () => ({}) },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);