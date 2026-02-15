import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import crypto from "crypto";

import Session from "./models/Session.js";
import User from "./models/User.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

function generateSessionCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

async function createUniqueSessionCode() {
  for (let i = 0; i < 10; i++) {
    const code = generateSessionCode(6);
    const exists = await Session.findOne({ sessionCode: code }).lean();
    if (!exists) return code;
  }
  throw new Error("Failed to generate unique session code");
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    mongoConnected: mongoose.connection.readyState === 1,
  });
});

app.post("/sessions/draft", async (req, res) => {
  try {
    const sessionCode = await createUniqueSessionCode();
    await Session.create({
      sessionCode,
      stage: "DRAFT",
      isStarted: false,
    });

    res.json({ sessionCode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/sessions/activate", async (req, res) => {
  try {
    const { sessionCode, displayName, planningType, sessionName, destination } =
      req.body;

    if (!sessionCode || !displayName || !planningType || !sessionName || !destination) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const session = await Session.findOne({ sessionCode });
    if (!session) return res.status(404).json({ error: "Session not found" });

    const userId = crypto.randomUUID();

    session.stage = "LOBBY";
    session.hostUserId = userId;
    session.sessionName = sessionName;
    session.destination = destination;
    session.planningType = planningType;

    await session.save();

    await User.create({
      userId,
      displayName,
      sessionCode,
    });

    res.json({
      sessionCode,
      userId,
      session,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/sessions/join", async (req, res) => {
  try {
    const { sessionCode, displayName } = req.body;

    if (!sessionCode || !displayName) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const session = await Session.findOne({ sessionCode }).lean();
    if (!session || session.stage === "DRAFT") {
      return res.status(404).json({ error: "Room doesn’t exist yet" });
    }

    const userId = crypto.randomUUID();

    await User.create({
      userId,
      displayName,
      sessionCode,
    });

    res.json({ sessionCode, userId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/sessions/:code/lobby", async (req, res) => {
  try {
    const sessionCode = req.params.code;

    const session = await Session.findOne({ sessionCode }).lean();
    if (!session) return res.status(404).json({ error: "Session not found" });

    const users = await User.find({ sessionCode })
      .sort({ joinedAt: 1 })
      .lean();

    res.json({
      sessionCode,
      session: {
        sessionCode: session.sessionCode,
        stage: session.stage,
        hostUserId: session.hostUserId,
        sessionName: session.sessionName,
        destination: session.destination,
        planningType: session.planningType,
        isStarted: session.isStarted,
      },
      users: users.map((u) => ({
        userId: u.userId,
        displayName: u.displayName,
        sessionCode: u.sessionCode,
        joinedAt: u.joinedAt,
        filters: u.filters || { budgetMin: null, budgetMax: null, tags: [] },
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/sessions/:code/filters", async (req, res) => {
  try {
    const sessionCode = req.params.code;
    const { userId, filters } = req.body;

    const user = await User.findOne({ sessionCode, userId });
    if (!user) return res.status(404).json({ error: "User not found" });

    const next = { ...(user.filters?.toObject?.() ?? user.filters ?? {}) };

    if ("budgetMin" in filters)
      next.budgetMin =
        filters.budgetMin === "" || filters.budgetMin === null
          ? null
          : Number(filters.budgetMin);

    if ("budgetMax" in filters)
      next.budgetMax =
        filters.budgetMax === "" || filters.budgetMax === null
          ? null
          : Number(filters.budgetMax);

    if ("tags" in filters)
      next.tags = Array.isArray(filters.tags)
        ? filters.tags.map((t) => String(t)).filter(Boolean)
        : [];

    user.filters = next;
    await user.save();

    res.json({ sessionCode, userId, filters: user.filters });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function start() {
  try {
    const uri = process.env.MONGODB_URI;
    await mongoose.connect(uri);

    const port = process.env.PORT || 4000;
    app.listen(port, () => console.log(`Server running on port ${port}`));
  } catch (err) {
    console.error("Server failed:", err.message);
    process.exit(1);
  }
}

start();