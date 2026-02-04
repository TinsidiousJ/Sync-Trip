import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    mongoConnected: mongoose.connection.readyState === 1,
  });
});

const port = Number(process.env.PORT) || 4000;

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

async function connectMongo() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error("MONGODB_URI missing in server/.env");
    return;
  }

  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 7000,
      connectTimeoutMS: 7000,
    });
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
  }
}

connectMongo();