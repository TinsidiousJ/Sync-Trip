import mongoose from "mongoose";

const optionSchema = new mongoose.Schema(
  {
    sessionCode: { type: String, required: true, index: true },

    type: {
      type: String,
      enum: ["ACCOMMODATION", "ACTIVITIES"],
      required: true,
    },

    source: { type: String, default: "MOCK" },
    sourceId: { type: String, required: true },

    title: { type: String, required: true },
    subtitle: { type: String, default: "" },

    price: { type: Number, default: null },
    priceLevelText: { type: String, default: "" },
    currency: { type: String, default: "GBP" },

    rating: { type: Number, default: null },
    image: { type: String, default: "" },
    link: { type: String, default: "" },

    tags: { type: [String], default: [] },
  },
  { timestamps: true }
);

optionSchema.index({ sessionCode: 1, type: 1, sourceId: 1 }, { unique: true });

export default mongoose.model("Option", optionSchema);