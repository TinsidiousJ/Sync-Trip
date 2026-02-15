import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    sessionCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    stage: {
      type: String,
      enum: ["DRAFT", "LOBBY"],
      default: "DRAFT",
    },

    hostUserId: {
      type: String,
      default: null,
    },

    sessionName: {
      type: String,
      default: "",
    },

    destination: {
      type: String,
      default: "",
    },

    planningType: {
      type: String,
      enum: ["ACCOMMODATION", "ACTIVITIES"],
      default: "ACCOMMODATION",
    },
    filters: {
      budgetMin: { type: Number, default: null },
      budgetMax: { type: Number, default: null },
      area: { type: String, default: "" },
      categories: { type: [String], default: [] },
    },

    isStarted: {
      type: Boolean,
      default: false,
    },

    startedAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model("Session", sessionSchema);