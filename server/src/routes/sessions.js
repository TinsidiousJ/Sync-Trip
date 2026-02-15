import express from "express";
import { v4 as uuidv4 } from "uuid";
import Session from "../models/Session.js";
import User from "../models/User.js";
import generateCode from "../utils/generateCode.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { displayName, sessionName, destination, stage } = req.body;

    const sessionCode = generateCode();
    const userId = uuidv4();

    const session = await Session.create({
      sessionCode,
      hostUserId: userId,
      sessionName,
      destination,
      stage
    });

    await User.create({
      userId,
      displayName,
      sessionCode,
      joinedAt: new Date()
    });

    res.json({
      sessionCode,
      userId,
      session
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/join", async (req, res) => {
  try {
    const { sessionCode, displayName } = req.body;

    const session = await Session.findOne({ sessionCode });
    if (!session) {
    return res.status(404).json({ error: "Session not found" });
    }

    const userId = uuidv4();

    await User.create({
      userId,
      displayName,
      sessionCode,
      joinedAt: new Date()
    });

    res.json({ sessionCode, userId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:sessionCode/users", async (req, res) => {
  try {
    const users = await User.find({
      sessionCode: req.params.sessionCode
    });

    res.json({
      sessionCode: req.params.sessionCode,
      users
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;