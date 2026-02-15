import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    sessionCode: {
      type: String,
      required: true,
      unique: true
    },
    hostUserId: {
      type: String,
      required: true
    },
    sessionName: String,
    destination: String,
    stage: String,
    isStarted: {
      type: Boolean,
      default: false
    },
    startedAt: Date
  },
  { timestamps: true }
);

export default mongoose.model("Session", sessionSchema);