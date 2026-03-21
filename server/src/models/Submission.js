import mongoose from "mongoose";

const submissionSchema = new mongoose.Schema(
  {
    sessionCode: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    optionId: { type: mongoose.Schema.Types.ObjectId, ref: "Option", required: true },
  },
  { timestamps: true }
);

submissionSchema.index({ sessionCode: 1, userId: 1 }, { unique: true });

export default mongoose.model("Submission", submissionSchema);