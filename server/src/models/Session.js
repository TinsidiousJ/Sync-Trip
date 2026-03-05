import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    sessionCode: { type: String, required: true, unique: true, index: true },

    stage: {
      type: String,
      enum: ["DRAFT", "LOBBY", "SEARCH"],
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
  },
  { timestamps: true }
);

export default mongoose.model("Session", sessionSchema);