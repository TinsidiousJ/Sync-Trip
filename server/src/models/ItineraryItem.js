import mongoose from "mongoose";

// itinerary item data
const itineraryItemSchema = new mongoose.Schema(
  {
    sessionCode: { type: String, required: true, index: true },
    optionId: { type: mongoose.Schema.Types.ObjectId, ref: "Option", required: true },

    type: {
      type: String,
      enum: ["ACCOMMODATION", "ACTIVITIES"],
      required: true,
    },

    title: { type: String, required: true },
    subtitle: { type: String, default: "" },

    price: { type: Number, default: null },
    priceLevelText: { type: String, default: "" },
    currency: { type: String, default: "GBP" },

    rating: { type: Number, default: null },
    image: { type: String, default: "" },
    link: { type: String, default: "" },

    tags: { type: [String], default: [] },

    source: { type: String, default: "MOCK" },
    sourceId: { type: String, default: "" },

    orderIndex: { type: Number, required: true },

    scheduledDate: { type: String, default: "" },
    scheduledTime: { type: String, default: "" },
  },
  { timestamps: true }
);

itineraryItemSchema.index({ sessionCode: 1, orderIndex: 1 });
itineraryItemSchema.index({ sessionCode: 1, optionId: 1 }, { unique: true });

export default mongoose.model("ItineraryItem", itineraryItemSchema);
