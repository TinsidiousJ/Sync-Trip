import mongoose from "mongoose";

const itineraryChangeRequestSchema = new mongoose.Schema(
  {
    sessionCode: { type: String, required: true, index: true },

    type: {
      type: String,
      enum: ["REMOVE", "MOVE"],
      required: true,
    },

    itineraryItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ItineraryItem",
      required: true,
    },

    requestedByUserId: { type: String, required: true },

    approvals: {
      type: [String],
      default: [],
    },

    moveDirection: {
      type: String,
      enum: ["UP", "DOWN", ""],
      default: "",
    },

    status: {
      type: String,
      enum: ["PENDING", "APPLIED"],
      default: "PENDING",
    },
  },
  { timestamps: true }
);

itineraryChangeRequestSchema.index({ sessionCode: 1, status: 1 });

export default mongoose.model("ItineraryChangeRequest", itineraryChangeRequestSchema);