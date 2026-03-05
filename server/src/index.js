import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import crypto from "crypto";

import Session from "./models/Session.js";
import User from "./models/User.js";
import Option from "./models/Option.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const GEOAPIFY_API_KEY = process.env.GEOAPIFY_API_KEY || "";
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || "";
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || "tripadvisor-com1.p.rapidapi.com";

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

async function geoapifyGeocode(destination) {
  if (!GEOAPIFY_API_KEY) throw new Error("Missing GEOAPIFY_API_KEY");

  const url =
    `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(destination)}` +
    `&limit=1&lang=en&apiKey=${encodeURIComponent(GEOAPIFY_API_KEY)}`;

  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.message || "Geoapify geocoding failed");
  }

  const feature = data?.features?.[0];
  if (!feature?.properties) {
    throw new Error("No destination found from Geoapify");
  }

  return {
    lat: feature.properties.lat,
    lon: feature.properties.lon,
    formatted: feature.properties.formatted || destination,
  };
}

async function searchGeoapifyActivities(destination, limit = 12) {
  const location = await geoapifyGeocode(destination);

  const categories = [
    "tourism.attraction",
    "entertainment",
    "catering",
    "leisure",
    "natural",
  ].join(",");

  const url =
    `https://api.geoapify.com/v2/places?categories=${encodeURIComponent(categories)}` +
    `&filter=circle:${location.lon},${location.lat},5000` +
    `&bias=proximity:${location.lon},${location.lat}` +
    `&limit=${limit}` +
    `&lang=en` +
    `&apiKey=${encodeURIComponent(GEOAPIFY_API_KEY)}`;

  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.message || "Geoapify places search failed");
  }

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

function normaliseTripAdvisorHotel(item, index = 0) {
  const name =
    item?.name ||
    item?.title ||
    item?.result_object?.name ||
    item?.hotel_name ||
    "Unnamed hotel";

  const locationId =
    item?.location_id ||
    item?.locationId ||
    item?.result_object?.location_id ||
    item?.id ||
    `tripadvisor-${index}`;

  const rating =
    parseRating(item?.rating) ??
    parseRating(item?.review_rating) ??
    parseRating(item?.bubble_rating) ??
    parseRating(item?.result_object?.rating);

  const price =
    parsePrice(item?.price) ??
    parsePrice(item?.price_level) ??
    parsePrice(item?.offer_group?.lowest_price) ??
    parsePrice(item?.price_for_display);

  const image =
    item?.photo?.images?.large?.url ||
    item?.photo?.images?.original?.url ||
    item?.result_object?.photo?.images?.large?.url ||
    item?.heroImgUrl ||
    item?.thumbnail ||
    "";

  const subtitle =
    item?.address ||
    item?.address_obj?.address_string ||
    item?.location_string ||
    item?.result_object?.location_string ||
    "";

  const link =
    item?.web_url ||
    item?.website ||
    item?.result_object?.web_url ||
    "";

  const textBlob = [
    name,
    subtitle,
    item?.price || "",
    item?.price_level || "",
    item?.ranking || "",
    item?.description || "",
    JSON.stringify(item?.amenities || []),
  ].join(" ");

  return {
    source: "TRIPADVISOR",
    sourceId: String(locationId),
    title: name,
    subtitle,
    price,
    currency: "GBP",
    rating,
    image,
    link,
    tags: inferAccommodationTagsFromText(textBlob),
  };
}

async function searchTripAdvisorHotels(destination, limit = 12) {
  if (!RAPIDAPI_KEY) throw new Error("Missing RAPIDAPI_KEY");

  const headers = {
    "Content-Type": "application/json",
    "x-rapidapi-key": RAPIDAPI_KEY,
    "x-rapidapi-host": RAPIDAPI_HOST,
  };

  const locationSearchUrl =
    `https://${RAPIDAPI_HOST}/locations/search?query=${encodeURIComponent(destination)}&language=en_US`;

  const locationRes = await fetch(locationSearchUrl, { headers });
  const locationData = await locationRes.json();

  if (!locationRes.ok) {
    throw new Error(locationData?.message || locationData?.error || "TripAdvisor location search failed");
  }

  const locationResults = Array.isArray(locationData?.data) ? locationData.data : [];
  const firstLocation = locationResults.find((item) => item?.geo_type === "CITY") || locationResults[0];

  const geoId =
    firstLocation?.result_object?.location_id ||
    firstLocation?.location_id ||
    firstLocation?.locationId ||
    null;

  if (!geoId) {
    throw new Error("No geoId found for destination");
  }

  const hotelSearchUrl = `https://${RAPIDAPI_HOST}/hotels/search?geoId=${encodeURIComponent(geoId)}`;

  const hotelRes = await fetch(hotelSearchUrl, { headers });
  const hotelData = await hotelRes.json();

  if (!hotelRes.ok) {
    throw new Error(hotelData?.message || hotelData?.error || "TripAdvisor hotel search failed");
  }

  const items = Array.isArray(hotelData?.data) ? hotelData.data : [];

  return items
    .map((item, index) => normaliseTripAdvisorHotel(item, index))
    .filter((item) => item.title && item.sourceId)
    .slice(0, limit);
}

function buildMockResults(sessionCode, planningType, destination) {
  if (planningType === "ACTIVITIES") {
    return [
      {
        source: "MOCK",
        sourceId: `${sessionCode}-activity-1`,
        title: `City Museum (${destination})`,
        subtitle: "Example activity fallback",
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
        subtitle: "Example activity fallback",
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
      subtitle: "Example hotel fallback",
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
      subtitle: "Example hotel fallback",
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
    hasRapidApiKey: Boolean(RAPIDAPI_KEY),
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

    if (session.stage !== "SEARCH" && !session.isStarted) {
      return res.status(403).json({ error: "Session has not started yet" });
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
        results = await searchTripAdvisorHotels(session.destination, 12);
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

app.get("/sessions/:code/options", async (req, res) => {
  try {
    const sessionCode = req.params.code;

    const session = await Session.findOne({ sessionCode }).lean();
    if (!session) return res.status(404).json({ error: "Session not found" });

    const options = await Option.find({ sessionCode }).sort({ createdAt: 1 }).lean();

    res.json({ sessionCode, options });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/sessions/:code/options", async (req, res) => {
  try {
    const sessionCode = req.params.code;
    const { userId, option } = req.body;

    if (!userId) return res.status(400).json({ error: "Missing userId" });
    if (!option || typeof option !== "object") return res.status(400).json({ error: "Missing option" });

    const session = await Session.findOne({ sessionCode }).lean();
    if (!session) return res.status(404).json({ error: "Session not found" });

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
      link: String(option.link || ""),
      tags: Array.isArray(option.tags) ? option.tags.map(String).filter(Boolean) : [],
      createdByUserId: userId,
    };

    if (!payload.sourceId || !payload.title) {
      return res.status(400).json({ error: "option.sourceId and option.title are required" });
    }

    let created;
    try {
      created = await Option.create(payload);
    } catch (e) {
      const existing = await Option.findOne({ sessionCode, sourceId: payload.sourceId }).lean();
      if (existing) {
        return res.json({ sessionCode, option: existing, alreadyExists: true });
      }
      throw e;
    }

    res.json({ sessionCode, option: created, alreadyExists: false });
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