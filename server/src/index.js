import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import crypto from "crypto";

import Session from "./models/Session.js";
import User from "./models/User.js";
import Option from "./models/Option.js";
import Submission from "./models/Submission.js";
import Vote from "./models/Vote.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const GEOAPIFY_API_KEY = process.env.GEOAPIFY_API_KEY || "";
const TRIPADVISOR_API_KEY = process.env.TRIPADVISOR_API_KEY || "";

function generateSessionCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
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

function safeNumber(value) {
  if (value === null || typeof value === "undefined" || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parsePrice(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const cleaned = value.replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseRating(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function uniqueStrings(values) {
  return [...new Set((values || []).filter(Boolean).map((v) => String(v).trim()).filter(Boolean))];
}

function textIncludesAny(text, needles) {
  const hay = String(text || "").toLowerCase();
  return needles.some((n) => hay.includes(String(n).toLowerCase()));
}

function inferAccommodationTagsFromText(text) {
  const tags = [];

  if (textIncludesAny(text, ["wifi", "wi-fi", "internet"])) tags.push("WIFI");
  if (textIncludesAny(text, ["breakfast"])) tags.push("BREAKFAST_INCLUDED");
  if (textIncludesAny(text, ["parking"])) tags.push("PARKING");
  if (textIncludesAny(text, ["pool", "swimming"])) tags.push("POOL");
  if (textIncludesAny(text, ["gym", "fitness"])) tags.push("GYM");
  if (textIncludesAny(text, ["air conditioning", "air-conditioning", "ac"])) tags.push("AIR_CONDITIONING");
  if (textIncludesAny(text, ["pet", "pets"])) tags.push("PET_FRIENDLY");

  return uniqueStrings(tags);
}

function inferActivityTags(categories = [], text = "") {
  const joined = `${(categories || []).join(" ")} ${text || ""}`.toLowerCase();
  const tags = [];

  if (joined.includes("tourism")) tags.push("TOURISM");
  if (joined.includes("entertainment")) tags.push("ENTERTAINMENT");
  if (joined.includes("catering")) tags.push("CATERING");
  if (joined.includes("leisure")) tags.push("LEISURE");
  if (joined.includes("natural")) tags.push("NATURAL");

  return uniqueStrings(tags);
}

function optionMatchesFilters(option, filters) {
  const budgetMin = safeNumber(filters?.budgetMin);
  const budgetMax = safeNumber(filters?.budgetMax);
  const minRating = safeNumber(filters?.minRating);
  const selectedTags = Array.isArray(filters?.tags) ? filters.tags : [];

  let budgetOk = true;
  if (option.price !== null && budgetMin !== null && option.price < budgetMin) budgetOk = false;
  if (option.price !== null && budgetMax !== null && option.price > budgetMax) budgetOk = false;

  let ratingOk = true;
  if (option.rating !== null && minRating !== null && option.rating < minRating) ratingOk = false;

  const tagOk =
    selectedTags.length === 0 ||
    selectedTags.some((tag) => Array.isArray(option.tags) && option.tags.includes(tag));

  return {
    budgetOk,
    ratingOk,
    tagOk,
    matchesFilters: budgetOk && ratingOk && tagOk,
  };
}

function serialisePublicOption(option, number = null) {
  return {
    optionId: String(option._id),
    label: number !== null ? `Candidate ${number}` : undefined,
    source: option.source,
    sourceId: option.sourceId,
    title: option.title,
    subtitle: option.subtitle,
    price: option.price,
    currency: option.currency,
    rating: option.rating,
    image: option.image,
    link: option.link,
    tags: option.tags || [],
  };
}

function compareSummaryValues(a, b) {
  if (b.approvalRate !== a.approvalRate) return b.approvalRate - a.approvalRate;
  if (b.approvalCount !== a.approvalCount) return b.approvalCount - a.approvalCount;
  if (b.averageRanking !== a.averageRanking) return b.averageRanking - a.averageRanking;

  const aRating = typeof a.option.rating === "number" ? a.option.rating : -Infinity;
  const bRating = typeof b.option.rating === "number" ? b.option.rating : -Infinity;
  if (bRating !== aRating) return bRating - aRating;

  const aPrice = typeof a.option.price === "number" ? a.option.price : Infinity;
  const bPrice = typeof b.option.price === "number" ? b.option.price : Infinity;
  if (aPrice !== bPrice) return aPrice - bPrice;

  const aTitle = String(a.option.title || "").toLowerCase();
  const bTitle = String(b.option.title || "").toLowerCase();
  if (aTitle < bTitle) return -1;
  if (aTitle > bTitle) return 1;

  const aSourceId = String(a.option.sourceId || "").toLowerCase();
  const bSourceId = String(b.option.sourceId || "").toLowerCase();
  if (aSourceId < bSourceId) return -1;
  if (aSourceId > bSourceId) return 1;

  return 0;
}

async function getSubmissionOwnership(sessionCode) {
  const submissions = await Submission.find({ sessionCode }).lean();

  const ownedOptionIdsByUserId = new Map();
  const ownerCountByOptionId = new Map();

  for (const submission of submissions) {
    const userId = String(submission.userId);
    const optionId = String(submission.optionId);

    if (!ownedOptionIdsByUserId.has(userId)) {
      ownedOptionIdsByUserId.set(userId, new Set());
    }

    ownedOptionIdsByUserId.get(userId).add(optionId);
    ownerCountByOptionId.set(optionId, (ownerCountByOptionId.get(optionId) || 0) + 1);
  }

  return {
    submissions,
    ownedOptionIdsByUserId,
    ownerCountByOptionId,
  };
}

async function getRoundOptions(session) {
  if (session.stage === "TIEBREAK" && Array.isArray(session.tieBreakOptionIds) && session.tieBreakOptionIds.length > 0) {
    return Option.find({ _id: { $in: session.tieBreakOptionIds } }).sort({ createdAt: 1 }).lean();
  }

  return Option.find({ sessionCode: session.sessionCode }).sort({ createdAt: 1 }).lean();
}

async function getVotingComputation(sessionCode) {
  const session = await Session.findOne({ sessionCode }).lean();
  if (!session) throw new Error("Session not found");

  const [options, users, ownership, votes] = await Promise.all([
    getRoundOptions(session),
    User.find({ sessionCode }).lean(),
    getSubmissionOwnership(sessionCode),
    Vote.find({ sessionCode, roundNumber: session.currentVoteRound }).lean(),
  ]);

  const voteCountByUserId = new Map();
  const votesByOptionId = new Map();

  for (const vote of votes) {
    const userId = String(vote.userId);
    const optionId = String(vote.optionId);

    voteCountByUserId.set(userId, (voteCountByUserId.get(userId) || 0) + 1);

    if (!votesByOptionId.has(optionId)) {
      votesByOptionId.set(optionId, []);
    }
    votesByOptionId.get(optionId).push(vote);
  }

  const expectedVotesByUserId = new Map();
  for (const user of users) {
    const ownedSet = ownership.ownedOptionIdsByUserId.get(String(user.userId)) || new Set();
    const currentRoundOptionIds = options.map((option) => String(option._id));
    const ownedInCurrentRound = currentRoundOptionIds.filter((optionId) => ownedSet.has(optionId)).length;
    expectedVotesByUserId.set(String(user.userId), Math.max(options.length - ownedInCurrentRound, 0));
  }

  const totalExpectedVotes = [...expectedVotesByUserId.values()].reduce((sum, value) => sum + value, 0);

  const summaries = options.map((option) => {
    const optionId = String(option._id);
    const optionVotes = votesByOptionId.get(optionId) || [];
    const approvals = optionVotes.filter((vote) => vote.approval === true);
    const approvalCount = approvals.length;
    const rankingTotal = approvals.reduce((sum, vote) => sum + (vote.ranking || 0), 0);
    const averageRanking = approvalCount > 0 ? rankingTotal / approvalCount : 0;
    const ownerCount = ownership.ownerCountByOptionId.get(optionId) || 0;
    const eligibleVoters = Math.max(users.length - ownerCount, 0);
    const approvalRate = eligibleVoters > 0 ? approvalCount / eligibleVoters : 0;

    return {
      option,
      approvalCount,
      approvalRate,
      averageRanking,
      rankingTotal,
      eligibleVoters,
      ownerCount,
    };
  });

  const completedUsers = users.filter((user) => {
    const userId = String(user.userId);
    const cast = voteCountByUserId.get(userId) || 0;
    const expected = expectedVotesByUserId.get(userId) || 0;
    return cast === expected;
  }).length;

  const allVotesComplete = totalExpectedVotes > 0 && votes.length === totalExpectedVotes;

  return {
    session,
    options,
    votes,
    users,
    summaries,
    expectedVotesByUserId,
    voteCountByUserId,
    totalExpectedVotes,
    completedUsers,
    allVotesComplete,
    ownership,
  };
}

function getTopTiedOptionIds(sortedSummaries) {
  if (!sortedSummaries.length) return [];

  const top = sortedSummaries[0];
  const tied = [String(top.option._id)];

  for (let i = 1; i < sortedSummaries.length; i++) {
    if (compareSummaryValues(top, sortedSummaries[i]) === 0) {
      tied.push(String(sortedSummaries[i].option._id));
    } else {
      break;
    }
  }

  return tied;
}

async function geoapifyGeocode(destination) {
  if (!GEOAPIFY_API_KEY) throw new Error("Missing GEOAPIFY_API_KEY");

  const url =
    `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(destination)}` +
    `&limit=1&lang=en&apiKey=${encodeURIComponent(GEOAPIFY_API_KEY)}`;

  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) throw new Error(data?.message || "Geoapify geocoding failed");

  const feature = data?.features?.[0];
  if (!feature?.properties) throw new Error("No destination found from Geoapify");

  return {
    lat: feature.properties.lat,
    lon: feature.properties.lon,
    formatted: feature.properties.formatted || destination,
  };
}

async function searchGeoapifyActivities(destination, limit = 12) {
  const location = await geoapifyGeocode(destination);

  const categories = ["tourism.attraction", "entertainment", "catering", "leisure", "natural"].join(",");

  const url =
    `https://api.geoapify.com/v2/places?categories=${encodeURIComponent(categories)}` +
    `&filter=circle:${location.lon},${location.lat},5000` +
    `&bias=proximity:${location.lon},${location.lat}` +
    `&limit=${limit}` +
    `&lang=en` +
    `&apiKey=${encodeURIComponent(GEOAPIFY_API_KEY)}`;

  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) throw new Error(data?.message || "Geoapify places search failed");

  const features = Array.isArray(data?.features) ? data.features : [];

  return features.map((item) => {
    const props = item.properties || {};
    const rawText = [
      props.name,
      props.formatted,
      props.address_line1,
      props.address_line2,
      ...(props.categories || []),
    ].join(" ");

    return {
      source: "GEOAPIFY",
      sourceId: String(props.place_id || item.id || crypto.randomUUID()),
      title: props.name || "Unnamed activity",
      subtitle: props.formatted || props.address_line2 || "",
      price: null,
      currency: "GBP",
      rating: null,
      image: "",
      link: props.website || "",
      tags: inferActivityTags(props.categories || [], rawText),
    };
  });
}

function normaliseTripadvisorNearbyHotel(item, detail = null) {
  const base = detail || item || {};

  const title = base?.name || item?.name || "Unnamed hotel";
  const sourceId = base?.location_id || item?.location_id || crypto.randomUUID();

  const subtitle =
    base?.address_obj?.address_string ||
    base?.address_string ||
    item?.address_obj?.address_string ||
    item?.address_string ||
    "";

  const rating = parseRating(base?.rating) ?? parseRating(item?.rating);
  const price = parsePrice(base?.price_level) ?? parsePrice(item?.price_level);
  const link = base?.web_url || item?.web_url || "";
  const image = base?.photo?.images?.large?.url || base?.photo?.images?.original?.url || "";

  const textBlob = [title, subtitle, base?.price_level || "", JSON.stringify(base?.amenities || [])].join(" ");

  return {
    source: "TRIPADVISOR",
    sourceId: String(sourceId),
    title,
    subtitle,
    price,
    currency: "GBP",
    rating,
    image,
    link,
    tags: inferAccommodationTagsFromText(textBlob),
  };
}

async function fetchTripadvisorLocationDetails(locationId) {
  const url =
    `https://api.content.tripadvisor.com/api/v1/location/${encodeURIComponent(locationId)}/details` +
    `?key=${encodeURIComponent(TRIPADVISOR_API_KEY)}&language=en`;

  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.message || `Tripadvisor details failed for ${locationId}`);
  }

  return data;
}

async function searchTripadvisorHotels(destination, limit = 12) {
  if (!TRIPADVISOR_API_KEY) throw new Error("Missing TRIPADVISOR_API_KEY");

  const location = await geoapifyGeocode(destination);

  const nearbyUrl =
    `https://api.content.tripadvisor.com/api/v1/location/nearby_search` +
    `?key=${encodeURIComponent(TRIPADVISOR_API_KEY)}` +
    `&latLong=${encodeURIComponent(`${location.lat},${location.lon}`)}` +
    `&category=hotels` +
    `&language=en`;

  const nearbyRes = await fetch(nearbyUrl);
  const nearbyData = await nearbyRes.json();

  if (!nearbyRes.ok) {
    throw new Error(nearbyData?.message || "Tripadvisor nearby hotel search failed");
  }

  const rows = Array.isArray(nearbyData?.data) ? nearbyData.data : [];

  if (!rows.length) {
    console.log("Tripadvisor nearby_search response:", JSON.stringify(nearbyData, null, 2));
    return [];
  }

  const sliced = rows.slice(0, limit);

  const detailedRows = await Promise.all(
    sliced.map(async (row) => {
      try {
        const locationId = row?.location_id;
        if (!locationId) return { row, detail: null };

        const detail = await fetchTripadvisorLocationDetails(locationId);
        return { row, detail };
      } catch (err) {
        console.log(`Tripadvisor details fallback for location ${row?.location_id}: ${err.message}`);
        return { row, detail: null };
      }
    })
  );

  return detailedRows
    .map(({ row, detail }) => normaliseTripadvisorNearbyHotel(row, detail))
    .filter((item) => item.title && item.sourceId);
}

function buildMockResults(sessionCode, planningType, destination) {
  if (planningType === "ACTIVITIES") {
    return [
      {
        source: "MOCK",
        sourceId: `${sessionCode}-activity-1`,
        title: `City Museum (${destination})`,
        subtitle: "Sample activity result",
        price: 15,
        currency: "GBP",
        rating: 4.3,
        image: "",
        link: "",
        tags: ["TOURISM", "ENTERTAINMENT"],
      },
      {
        source: "MOCK",
        sourceId: `${sessionCode}-activity-2`,
        title: `Riverside Walk (${destination})`,
        subtitle: "Sample activity result",
        price: 0,
        currency: "GBP",
        rating: 4.1,
        image: "",
        link: "",
        tags: ["LEISURE", "NATURAL"],
      },
    ];
  }

  return [
    {
      source: "MOCK",
      sourceId: `${sessionCode}-hotel-1`,
      title: `Central Stay (${destination})`,
      subtitle: "Sample hotel result",
      price: 120,
      currency: "GBP",
      rating: 4.2,
      image: "",
      link: "",
      tags: ["WIFI", "AIR_CONDITIONING"],
    },
    {
      source: "MOCK",
      sourceId: `${sessionCode}-hotel-2`,
      title: `Budget Rooms (${destination})`,
      subtitle: "Sample hotel result",
      price: 85,
      currency: "GBP",
      rating: 3.9,
      image: "",
      link: "",
      tags: ["WIFI", "BREAKFAST_INCLUDED"],
    },
  ];
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    mongoConnected: mongoose.connection.readyState === 1,
    hasGeoapifyKey: Boolean(GEOAPIFY_API_KEY),
    hasTripadvisorKey: Boolean(TRIPADVISOR_API_KEY),
  });
});

app.post("/sessions/draft", async (req, res) => {
  try {
    const sessionCode = await createUniqueSessionCode();
    await Session.create({ sessionCode, stage: "DRAFT", isStarted: false });
    res.json({ sessionCode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/sessions/activate", async (req, res) => {
  try {
    const { sessionCode, displayName, planningType, sessionName, destination } = req.body;

    if (!sessionCode || !displayName || !planningType || !sessionName || !destination) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!["ACCOMMODATION", "ACTIVITIES"].includes(planningType)) {
      return res.status(400).json({ error: "Invalid planningType" });
    }

    const session = await Session.findOne({ sessionCode });
    if (!session) return res.status(404).json({ error: "Session not found" });

    if (session.stage !== "DRAFT") {
      return res.status(409).json({ error: "Session already activated" });
    }

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
      filters: { budgetMin: null, budgetMax: null, minRating: null, tags: [] },
    });

    res.json({ sessionCode, userId, session });
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
      filters: { budgetMin: null, budgetMax: null, minRating: null, tags: [] },
    });

    res.json({ sessionCode, userId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/sessions/:code/start", async (req, res) => {
  try {
    const sessionCode = req.params.code;
    const { userId } = req.body;

    if (!userId) return res.status(400).json({ error: "Missing userId" });

    const session = await Session.findOne({ sessionCode });
    if (!session) return res.status(404).json({ error: "Session not found" });

    if (session.hostUserId !== userId) {
      return res.status(403).json({ error: "Only the host can start the session" });
    }

    session.stage = "SEARCH";
    session.isStarted = true;
    session.startedAt = new Date();
    session.currentVoteRound = 1;
    session.tieBreakOptionIds = [];
    await session.save();

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
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/sessions/:code/lobby", async (req, res) => {
  try {
    const sessionCode = req.params.code;

    const session = await Session.findOne({ sessionCode }).lean();
    if (!session) return res.status(404).json({ error: "Session not found" });

    const users = await User.find({ sessionCode }).sort({ joinedAt: 1 }).lean();

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
        currentVoteRound: session.currentVoteRound || 1,
      },
      users: users.map((u) => ({
        userId: u.userId,
        displayName: u.displayName,
        sessionCode: u.sessionCode,
        joinedAt: u.joinedAt,
        filters: u.filters || { budgetMin: null, budgetMax: null, minRating: null, tags: [] },
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

    if (!userId) return res.status(400).json({ error: "Missing userId" });

    const session = await Session.findOne({ sessionCode }).lean();
    if (!session) return res.status(404).json({ error: "Session not found" });

    const user = await User.findOne({ sessionCode, userId });
    if (!user) return res.status(404).json({ error: "User not found in this session" });

    const next = { ...(user.filters?.toObject?.() ?? user.filters ?? {}) };

    if (filters && typeof filters === "object") {
      if ("budgetMin" in filters) {
        next.budgetMin = filters.budgetMin === "" || filters.budgetMin === null ? null : Number(filters.budgetMin);
      }
      if ("budgetMax" in filters) {
        next.budgetMax = filters.budgetMax === "" || filters.budgetMax === null ? null : Number(filters.budgetMax);
      }
      if ("minRating" in filters) {
        next.minRating = filters.minRating === "" || filters.minRating === null ? null : Number(filters.minRating);
      }
      if ("tags" in filters) {
        next.tags = Array.isArray(filters.tags) ? filters.tags.map((t) => String(t)).filter(Boolean) : [];
      }
    }

    if (
      typeof next.budgetMin === "number" &&
      typeof next.budgetMax === "number" &&
      next.budgetMin > next.budgetMax
    ) {
      return res.status(400).json({ error: "budgetMin cannot be greater than budgetMax" });
    }

    user.filters = next;
    await user.save();

    res.json({ sessionCode, userId, filters: user.filters });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/sessions/:code/options/search", async (req, res) => {
  try {
    const sessionCode = req.params.code;
    const userId = String(req.query.userId || "");

    const session = await Session.findOne({ sessionCode }).lean();
    if (!session) return res.status(404).json({ error: "Session not found" });

    if (session.stage !== "SEARCH") {
      return res.status(403).json({ error: "Search stage is not active" });
    }

    let userFilters = { budgetMin: null, budgetMax: null, minRating: null, tags: [] };

    if (userId) {
      const user = await User.findOne({ sessionCode, userId }).lean();
      if (user?.filters) userFilters = user.filters;
    }

    let results = [];

    try {
      if (session.planningType === "ACTIVITIES") {
        results = await searchGeoapifyActivities(session.destination, 12);
      } else {
        results = await searchTripadvisorHotels(session.destination, 12);
      }

      if (!Array.isArray(results) || results.length === 0) {
        throw new Error("No results returned from external API");
      }
    } catch (apiError) {
      results = buildMockResults(sessionCode, session.planningType, session.destination);
      console.error("Search API fallback used:", apiError.message);
    }

    const enrichedResults = results.map((option) => {
      const match = optionMatchesFilters(option, userFilters);
      return {
        ...option,
        ...match,
      };
    });

    res.json({
      sessionCode,
      planningType: session.planningType,
      destination: session.destination,
      filters: userFilters,
      results: enrichedResults,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/sessions/:code/submission", async (req, res) => {
  try {
    const sessionCode = req.params.code;
    const { userId, option } = req.body;

    if (!userId) return res.status(400).json({ error: "Missing userId" });
    if (!option || typeof option !== "object") return res.status(400).json({ error: "Missing option" });

    const session = await Session.findOne({ sessionCode });
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.stage !== "SEARCH") return res.status(403).json({ error: "Submission stage is not active" });

    const user = await User.findOne({ sessionCode, userId }).lean();
    if (!user) return res.status(404).json({ error: "User not found in this session" });

    const payload = {
      sessionCode,
      type: session.planningType,
      source: option.source || "MOCK",
      sourceId: String(option.sourceId || ""),
      title: String(option.title || ""),
      subtitle: String(option.subtitle || ""),
      price: typeof option.price === "number" ? option.price : safeNumber(option.price),
      currency: String(option.currency || "GBP"),
      rating: typeof option.rating === "number" ? option.rating : safeNumber(option.rating),
      image: String(option.image || ""),
      link: String(option.link || ""),
      tags: Array.isArray(option.tags) ? option.tags.map(String).filter(Boolean) : [],
    };

    if (!payload.sourceId || !payload.title) {
      return res.status(400).json({ error: "option.sourceId and option.title are required" });
    }

    let savedOption = await Option.findOne({
      sessionCode,
      type: payload.type,
      sourceId: payload.sourceId,
    });

    if (!savedOption) {
      savedOption = await Option.create(payload);
    }

    await Submission.findOneAndUpdate(
      { sessionCode, userId },
      { sessionCode, userId, optionId: savedOption._id },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    const totalUsers = await User.countDocuments({ sessionCode });
    const submittedCount = await Submission.countDocuments({ sessionCode });
    const allSubmitted = totalUsers > 0 && submittedCount === totalUsers;

    if (allSubmitted) {
      await Vote.deleteMany({ sessionCode });
      session.stage = "VOTING";
      session.currentVoteRound = 1;
      session.tieBreakOptionIds = [];
      await session.save();
    }

    res.json({
      sessionCode,
      submitted: true,
      allSubmitted,
      submissionCount: submittedCount,
      totalUsers,
      stage: allSubmitted ? "VOTING" : session.stage,
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: "Duplicate submission record detected" });
    }
    res.status(500).json({ error: err.message });
  }
});

app.get("/sessions/:code/submission-status", async (req, res) => {
  try {
    const sessionCode = req.params.code;
    const userId = String(req.query.userId || "");

    const session = await Session.findOne({ sessionCode }).lean();
    if (!session) return res.status(404).json({ error: "Session not found" });

    const totalUsers = await User.countDocuments({ sessionCode });
    const submissionCount = await Submission.countDocuments({ sessionCode });
    const currentUserSubmission = userId
      ? await Submission.findOne({ sessionCode, userId }).populate("optionId").lean()
      : null;

    res.json({
      sessionCode,
      stage: session.stage,
      allSubmitted: totalUsers > 0 && submissionCount === totalUsers,
      submissionCount,
      totalUsers,
      currentUserSubmitted: Boolean(currentUserSubmission),
      currentUserOption: currentUserSubmission?.optionId
        ? serialisePublicOption(currentUserSubmission.optionId)
        : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/sessions/:code/voting/candidates", async (req, res) => {
  try {
    const sessionCode = req.params.code;
    const userId = String(req.query.userId || "");

    const session = await Session.findOne({ sessionCode }).lean();
    if (!session) return res.status(404).json({ error: "Session not found" });

    if (!["VOTING", "TIEBREAK", "RESULT"].includes(session.stage)) {
      return res.status(403).json({ error: "Voting has not started yet" });
    }

    const user = await User.findOne({ sessionCode, userId }).lean();
    if (!user) return res.status(404).json({ error: "User not found in this session" });

    const [options, votes, ownership] = await Promise.all([
      getRoundOptions(session),
      Vote.find({ sessionCode, userId, roundNumber: session.currentVoteRound }).lean(),
      getSubmissionOwnership(sessionCode),
    ]);

    const ownedOptionIds = ownership.ownedOptionIdsByUserId.get(userId) || new Set();

    const candidates = options.map((option, index) => {
      const optionId = String(option._id);
      const existingVote = votes.find((vote) => String(vote.optionId) === optionId);
      const match = optionMatchesFilters(option, user.filters || {});
      const canVote = !ownedOptionIds.has(optionId);

      return {
        ...serialisePublicOption(option, index + 1),
        matchesUserFilters: match.matchesFilters,
        budgetOk: match.budgetOk,
        ratingOk: match.ratingOk,
        tagOk: match.tagOk,
        canVote,
        myVote: existingVote
          ? {
              approval: existingVote.approval,
              ranking: existingVote.ranking,
              acknowledgedFilterViolation: existingVote.acknowledgedFilterViolation,
            }
          : null,
      };
    });

    res.json({
      sessionCode,
      stage: session.stage,
      roundNumber: session.currentVoteRound,
      candidates,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/sessions/:code/votes/submit", async (req, res) => {
  try {
    const sessionCode = req.params.code;
    const { userId, votes } = req.body;

    if (!userId) return res.status(400).json({ error: "Missing userId" });
    if (!Array.isArray(votes)) return res.status(400).json({ error: "votes array is required" });

    const session = await Session.findOne({ sessionCode });
    if (!session) return res.status(404).json({ error: "Session not found" });

    if (!["VOTING", "TIEBREAK", "RESULT"].includes(session.stage)) {
      return res.status(403).json({ error: "Voting is not active" });
    }

    const user = await User.findOne({ sessionCode, userId }).lean();
    if (!user) return res.status(404).json({ error: "User not found in this session" });

    const [options, ownership] = await Promise.all([
      getRoundOptions(session),
      getSubmissionOwnership(sessionCode),
    ]);

    const ownedOptionIds = ownership.ownedOptionIdsByUserId.get(userId) || new Set();
    const votableOptionIds = options
      .map((option) => String(option._id))
      .filter((optionId) => !ownedOptionIds.has(optionId));

    const incomingByOptionId = new Map();
    for (const incomingVote of votes) {
      const optionId = String(incomingVote.optionId || "");
      if (incomingByOptionId.has(optionId)) {
        return res.status(400).json({ error: "Duplicate vote entries are not allowed" });
      }
      incomingByOptionId.set(optionId, incomingVote);
    }

    if (incomingByOptionId.size !== votableOptionIds.length) {
      return res.status(400).json({ error: "You must vote on every candidate except your own submission" });
    }

    for (const optionId of votableOptionIds) {
      if (!incomingByOptionId.has(optionId)) {
        return res.status(400).json({ error: "Missing vote for one or more candidates" });
      }
    }

    for (const ownedOptionId of ownedOptionIds) {
      if (incomingByOptionId.has(ownedOptionId)) {
        return res.status(400).json({ error: "You cannot vote on your own submission" });
      }
    }

    const optionMap = new Map(options.map((option) => [String(option._id), option]));

    for (const optionId of votableOptionIds) {
      const incomingVote = incomingByOptionId.get(optionId);
      const option = optionMap.get(optionId);

      if (!option) {
        return res.status(400).json({ error: "One or more vote options are invalid" });
      }

      const approval = incomingVote.approval === true;
      const approvalIsBoolean = typeof incomingVote.approval === "boolean";

      if (!approvalIsBoolean) {
        return res.status(400).json({ error: "Each vote must be approve or reject" });
      }

      const ranking = approval ? safeNumber(incomingVote.ranking) : null;

      if (approval && (ranking === null || ranking < 1 || ranking > 5)) {
        return res.status(400).json({ error: "Approved options must have a ranking from 1 to 5" });
      }

      const match = optionMatchesFilters(option, user.filters || {});
      const filterViolation = approval && !match.matchesFilters;
      const acknowledged = Boolean(incomingVote.acknowledgedFilterViolation);

      if (filterViolation && !acknowledged) {
        return res.status(400).json({ error: "Filter violation must be acknowledged before approving this option" });
      }

      await Vote.findOneAndUpdate(
        { sessionCode, userId, optionId: option._id, roundNumber: session.currentVoteRound },
        {
          sessionCode,
          userId,
          optionId: option._id,
          roundNumber: session.currentVoteRound,
          approval,
          ranking,
          acknowledgedFilterViolation: acknowledged,
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      );
    }

    const computation = await getVotingComputation(sessionCode);
    const sorted = [...computation.summaries].sort(compareSummaryValues);

    let winner = null;
    let movedToTieBreak = false;

    if (computation.allVotesComplete) {
      winner = sorted.length > 0 ? serialisePublicOption(sorted[0].option) : null;
      session.stage = "RESULT";
      await session.save();
    }

    res.json({
      sessionCode,
      saved: true,
      allVotesComplete: computation.allVotesComplete,
      movedToTieBreak,
      winner,
      tie: false,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/sessions/:code/voting-status", async (req, res) => {
  try {
    const sessionCode = req.params.code;
    const userId = String(req.query.userId || "");

    const computation = await getVotingComputation(sessionCode);
    const currentUserVotes = computation.voteCountByUserId.get(userId) || 0;
    const currentUserExpectedVotes = computation.expectedVotesByUserId.get(userId) || 0;

    let winner = null;

    if (computation.session.stage === "RESULT") {
      const sorted = [...computation.summaries].sort(compareSummaryValues);
      if (sorted.length > 0) {
        winner = serialisePublicOption(sorted[0].option);
      }
    }

    res.json({
      sessionCode,
      stage: computation.session.stage,
      roundNumber: computation.session.currentVoteRound || 1,
      totalUsers: computation.users.length,
      totalOptions: computation.options.length,
      totalVotesCast: computation.votes.length,
      totalExpectedVotes: computation.totalExpectedVotes,
      currentUserVotes,
      currentUserExpectedVotes,
      currentUserCompleted: currentUserVotes === currentUserExpectedVotes,
      completedUsers: computation.completedUsers,
      allVotesComplete: computation.allVotesComplete,
      winner,
      tie: false,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function start() {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is missing. Check server/.env");

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });

    const port = process.env.PORT || 4000;
    app.listen(port, () => console.log(`Server running on port ${port}`));
  } catch (err) {
    console.error("Server failed to start:", err.message);
    process.exit(1);
  }
}

start();