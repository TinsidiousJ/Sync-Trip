import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    sessionCode: { type: String, required: true, unique: true, index: true },

    stage: {
      type: String,
      enum: ["DRAFT", "LOBBY", "SEARCH", "VOTING", "TIEBREAK", "RESULT", "REPLAN_PROMPT"],
      default: "DRAFT",
    },

    hostUserId: { type: String, default: null },

    sessionName: { type: String, default: "" },
    destination: { type: String, default: "" },

    planningType: {
      type: String,
      enum: ["ACCOMMODATION", "ACTIVITIES"],
      default: "ACCOMMODATION",
    },

    isStarted: { type: Boolean, default: false },
    startedAt: { type: Date, default: null },

    currentVoteRound: { type: Number, default: 1 },
    tieBreakOptionIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Option" }],
      default: [],
    },

    replanPrompt: {
      active: { type: Boolean, default: false },
      promptId: { type: String, default: "" },
      requestedByUserId: { type: String, default: "" },
      planningType: {
        type: String,
        enum: ["", "ACCOMMODATION", "ACTIVITIES"],
        default: "",
      },
      acceptedUserIds: { type: [String], default: [] },
      declinedUserIds: { type: [String], default: [] },
      createdAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

export default mongoose.model("Session", sessionSchema);