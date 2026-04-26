import mongoose from "mongoose";

// vote data
const voteSchema = new mongoose.Schema(
  {
    sessionCode: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    optionId: { type: mongoose.Schema.Types.ObjectId, ref: "Option", required: true },

    roundNumber: { type: Number, required: true, default: 1 },

    approval: { type: Boolean, required: true },
    ranking: {
      type: Number,
      default: null,
      min: 1,
      max: 5,
    },

    acknowledgedFilterViolation: { type: Boolean, default: false },

    submittedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

voteSchema.index({ sessionCode: 1, userId: 1, optionId: 1, roundNumber: 1 }, { unique: true });

export default mongoose.model("Vote", voteSchema);
