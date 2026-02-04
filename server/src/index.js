import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

async function start() {
  try {
    if (!process.env.MONGODB_URI) {
      console.log("⚠️ MONGODB_URI not set yet (OK for now). Starting without DB...");
    } else {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log("✅ Connected to MongoDB");
    }

    const port = process.env.PORT || 4000;
    app.listen(port, () => console.log(`✅ Server running on port ${port}`));
  } catch (err) {
    console.error("❌ Server failed to start:", err.message);
    process.exit(1);
  }
}

start();