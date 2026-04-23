import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

import Session from "./models/Session.js";
import User from "./models/User.js";
import Option from "./models/Option.js";
import Submission from "./models/Submission.js";
import Vote from "./models/Vote.js";
import ItineraryItem from "./models/ItineraryItem.js";
import ItineraryChangeRequest from "./models/ItineraryChangeRequest.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = express();
app.use(cors());
app.use(express.json());

const TRIPADVISOR_API_KEY = process.env.TRIPADVISOR_API_KEY || "";
const YELP_API_KEY = process.env.YELP_API_KEY || "";

const POPULAR_DESTINATIONS = [
  ["Amsterdam", "Netherlands"],
  ["Athens", "Greece"],
  ["Barcelona", "Spain"],
  ["Berlin", "Germany"],
  ["Boston", "United States"],
  ["Brussels", "Belgium"],
  ["Budapest", "Hungary"],
  ["Cancun", "Mexico"],
  ["Chicago", "United States"],
  ["Copenhagen", "Denmark"],
  ["Dublin", "Ireland"],
  ["Dubai", "United Arab Emirates"],
  ["Edinburgh", "United Kingdom"],
  ["Florence", "Italy"],
  ["Hong Kong", "Hong Kong"],
  ["Istanbul", "Turkey"],
  ["Lisbon", "Portugal"],
  ["London", "United Kingdom"],
  ["Los Angeles", "United States"],
  ["Madrid", "Spain"],
  ["Miami", "United States"],
  ["Milan", "Italy"],
  ["New York", "United States"],
  ["Nice", "France"],
  ["Orlando", "United States"],
  ["Paris", "France"],
  ["Phuket", "Thailand"],
  ["Porto", "Portugal"],
  ["Prague", "Czech Republic"],
  ["Reykjavik", "Iceland"],
  ["Rome", "Italy"],
  ["San Francisco", "United States"],
  ["Singapore", "Singapore"],
  ["Sydney", "Australia"],
  ["Tokyo", "Japan"],
  ["Toronto", "Canada"],
  ["Valencia", "Spain"],
  ["Venice", "Italy"],
  ["Vienna", "Austria"],
  ["Zurich", "Switzerland"],
].map(([name, country]) => ({
  placeId: `popular-${name}-${country}`,
  name,
  subtitle: country,
  formatted: `${name}, ${country}`,
  resultType: "popular",
}));

function generateSessionCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

async function createUniqueSessionCode() {
  for (let i = 0; i < 10; i += 1) {
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

  const matches = value.match(/\d+(\.\d+)?/g);
  if (!matches || matches.length === 0) return null;

  const first = Number(matches[0]);
  return Number.isFinite(first) ? first : null;
}

function hasActualPriceText(value) {
  return /\d/.test(String(value || ""));
}

function parseRating(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getTripadvisorErrorMessage(data, fallback) {
  return data?.message || data?.Message || data?.error || data?.Error || fallback;
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

  if (
    textIncludesAny(joined, [
      "tourism",
      "attraction",
      "museum",
      "monument",
      "castle",
      "historic",
      "heritage",
      "sightseeing",
      "landmark",
      "tour",
    ])
  ) {
    tags.push("TOURISM");
  }

  if (
    textIncludesAny(joined, [
      "entertainment",
      "cinema",
      "theatre",
      "concert",
      "nightlife",
      "night club",
      "nightclub",
      "comedy",
      "music venue",
      "arcade",
      "amusement",
      "zoo",
      "aquarium",
    ])
  ) {
    tags.push("ENTERTAINMENT");
  }

  if (
    textIncludesAny(joined, [
      "catering",
      "restaurant",
      "cafe",
      "bar",
      "pub",
      "food",
      "meal",
      "bakery",
      "brunch",
      "dessert",
    ])
  ) {
    tags.push("CATERING");
  }

  if (
    textIncludesAny(joined, [
      "leisure",
      "spa",
      "shopping",
      "sports",
      "recreation",
      "bowling",
      "fitness",
      "game",
      "park",
      "play",
      "escape",
    ])
  ) {
    tags.push("LEISURE");
  }

  if (
    textIncludesAny(joined, [
      "natural",
      "beach",
      "garden",
      "river",
      "lake",
      "forest",
      "nature",
      "waterfall",
      "mountain",
      "outdoor",
      "hiking",
    ])
  ) {
    tags.push("NATURAL");
  }

  if (tags.length === 0) {
    tags.push("LEISURE");
  }

  return uniqueStrings(tags);
}

function optionMatchesFilters(option, filters) {
  const minRating = safeNumber(filters?.minRating);
  const selectedTags = Array.isArray(filters?.tags) ? filters.tags : [];

  let ratingOk = true;
  if (option.rating !== null && minRating !== null && option.rating < minRating) ratingOk = false;

  const tagOk =
    selectedTags.length === 0 ||
    selectedTags.some((tag) => Array.isArray(option.tags) && option.tags.includes(tag));

  return {
    budgetOk: true,
    ratingOk,
    tagOk,
    matchesFilters: ratingOk && tagOk,
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
    priceLevelText: option.priceLevelText || "",
    currency: option.currency,
    rating: option.rating,
    image: option.image,
    link: option.link,
    tags: option.tags || [],
    type: option.type,
  };
}

function serialiseItineraryItem(item, number = 1) {
  return {
    itineraryItemId: String(item._id),
    optionId: String(item.optionId),
    type: item.type,
    title: item.title,
    subtitle: item.subtitle,
    price: item.price,
    priceLevelText: item.priceLevelText || "",
    currency: item.currency,
    rating: item.rating,
    image: item.image,
    link: item.link,
    tags: item.tags || [],
    orderIndex: item.orderIndex ?? number,
    scheduledDate: item.scheduledDate || "",
    scheduledTime: item.scheduledTime || "",
  };
}

function buildEmptyReplanPrompt() {
  return {
    active: false,
    promptId: "",
    requestedByUserId: "",
    planningType: "",
    acceptedUserIds: [],
    declinedUserIds: [],
    createdAt: null,
  };
}

function buildReplanPromptObject(planningType, requestedByUserId, acceptedUserIds = []) {
  return {
    active: true,
    promptId: crypto.randomUUID(),
    requestedByUserId,
    planningType,
    acceptedUserIds,
    declinedUserIds: [],
    createdAt: new Date(),
  };
}

function getEarliestApprovalTimestamp(summary) {
  const approvalVotes = Array.isArray(summary.optionVotes)
    ? summary.optionVotes.filter((vote) => vote.approval === true && vote.submittedAt)
    : [];

  if (approvalVotes.length === 0) return null;

  let earliest = null;

  for (const vote of approvalVotes) {
    const time = new Date(vote.submittedAt).getTime();
    if (Number.isNaN(time)) continue;
    if (earliest === null || time < earliest) earliest = time;
  }

  return earliest;
}

function compareSummaryValues(a, b) {
  if (b.approvalRate !== a.approvalRate) return b.approvalRate - a.approvalRate;
  if (b.approvalCount !== a.approvalCount) return b.approvalCount - a.approvalCount;
  if (b.averageRanking !== a.averageRanking) return b.averageRanking - a.averageRanking;

  const aEarliestApproval = getEarliestApprovalTimestamp(a);
  const bEarliestApproval = getEarliestApprovalTimestamp(b);

  if (aEarliestApproval !== null && bEarliestApproval !== null) {
    const timeDifferenceMs = Math.abs(aEarliestApproval - bEarliestApproval);
    const oneMinuteMs = 60 * 1000;

    if (timeDifferenceMs > oneMinuteMs) {
      return aEarliestApproval - bEarliestApproval;
    }
  }

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
  const ownerUserIdsByOptionId = new Map();

  for (const submission of submissions) {
    const userId = String(submission.userId);
    const optionId = String(submission.optionId);

    if (!ownedOptionIdsByUserId.has(userId)) {
      ownedOptionIdsByUserId.set(userId, new Set());
    }
    ownedOptionIdsByUserId.get(userId).add(optionId);

    if (!ownerUserIdsByOptionId.has(optionId)) {
      ownerUserIdsByOptionId.set(optionId, new Set());
    }
    ownerUserIdsByOptionId.get(optionId).add(userId);
  }

  for (const [optionId, ownerSet] of ownerUserIdsByOptionId.entries()) {
    ownerCountByOptionId.set(optionId, ownerSet.size);
  }

  function isExclusivelyOwnedByUser(optionId, userId) {
    const owners = ownerUserIdsByOptionId.get(String(optionId));
    if (!owners || owners.size === 0) return false;
    return owners.size === 1 && owners.has(String(userId));
  }

  function isSharedSubmissionForUser(optionId, userId) {
    const owners = ownerUserIdsByOptionId.get(String(optionId));
    if (!owners || owners.size === 0) return false;
    return owners.size > 1 && owners.has(String(userId));
  }

  return {
    submissions,
    ownedOptionIdsByUserId,
    ownerCountByOptionId,
    ownerUserIdsByOptionId,
    isExclusivelyOwnedByUser,
    isSharedSubmissionForUser,
  };
}

async function getRoundOptions(session) {
  if (
    session.stage === "TIEBREAK" &&
    Array.isArray(session.tieBreakOptionIds) &&
    session.tieBreakOptionIds.length > 0
  ) {
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
    const userId = String(user.userId);
    const currentRoundOptionIds = options.map((option) => String(option._id));

    const exclusivelyOwnedInCurrentRound = currentRoundOptionIds.filter((optionId) =>
      ownership.isExclusivelyOwnedByUser(optionId, userId)
    ).length;

    expectedVotesByUserId.set(userId, Math.max(options.length - exclusivelyOwnedInCurrentRound, 0));
  }

  const totalExpectedVotes = [...expectedVotesByUserId.values()].reduce((sum, value) => sum + value, 0);

  const summaries = options.map((option) => {
    const optionId = String(option._id);
    const optionVotes = votesByOptionId.get(optionId) || [];
    const approvals = optionVotes.filter((vote) => vote.approval === true);
    const approvalCount = approvals.length;
    const rankingTotal = approvals.reduce((sum, vote) => sum + (vote.ranking || 0), 0);
    const averageRanking = approvalCount > 0 ? rankingTotal / approvalCount : 0;
    const ownerIds = ownership.ownerUserIdsByOptionId.get(optionId) || new Set();
    const ownerCount = ownerIds.size;
    const exclusivelyOwned = ownerCount === 1;
    const eligibleVoters = exclusivelyOwned ? Math.max(users.length - 1, 0) : users.length;
    const approvalRate = eligibleVoters > 0 ? approvalCount / eligibleVoters : 0;

    return {
      option,
      optionVotes,
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

function normaliseDestinationQuery(text) {
  return String(text || "").trim().replace(/\s+/g, " ");
}

function destinationStartsWith(destination, query) {
  const needle = query.toLowerCase();
  return (
    String(destination.name || "").toLowerCase().startsWith(needle) ||
    String(destination.formatted || "").toLowerCase().startsWith(needle)
  );
}

function mergeDestinationResults(groups, query, limit = 8) {
  const seen = new Set();
  const merged = [];

  for (const group of groups) {
    for (const destination of group || []) {
      const key = String(destination.formatted || destination.name || destination.placeId || "").toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(destination);
    }
  }

  return merged
    .sort((a, b) => {
      const aStarts = destinationStartsWith(a, query) ? 1 : 0;
      const bStarts = destinationStartsWith(b, query) ? 1 : 0;
      if (bStarts !== aStarts) return bStarts - aStarts;
      return 0;
    })
    .slice(0, limit);
}

function searchPopularDestinations(text, limit = 8) {
  const query = normaliseDestinationQuery(text);
  if (!query) return [];

  return POPULAR_DESTINATIONS.filter((destination) => destinationStartsWith(destination, query)).slice(0, limit);
}

async function fetchTripadvisorGeoLocationRows(text, limit = 8) {
  if (!TRIPADVISOR_API_KEY) return [];

  const url =
    `https://api.content.tripadvisor.com/api/v1/location/search` +
    `?key=${encodeURIComponent(TRIPADVISOR_API_KEY)}` +
    `&searchQuery=${encodeURIComponent(text)}` +
    `&category=geos` +
    `&language=en`;

  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(getTripadvisorErrorMessage(data, "Tripadvisor destination search failed"));
  }

  const rows = Array.isArray(data?.data) ? data.data : [];
  return rows.filter((row) => row?.location_id && row?.name).slice(0, limit);
}

async function tripadvisorGeocodeDestination(destination) {
  const rows = await fetchTripadvisorGeoLocationRows(destination, 5);
  const query = normaliseDestinationQuery(destination).toLowerCase();
  const row =
    rows.find((item) => String(item.name || "").toLowerCase() === query) ||
    rows.find((item) => String(item.name || "").toLowerCase().startsWith(query)) ||
    rows[0];

  if (!row?.location_id) throw new Error("No destination found from Tripadvisor");

  const details = await fetchTripadvisorLocationDetails(row.location_id);
  const lat = safeNumber(details?.latitude ?? row?.latitude);
  const lon = safeNumber(details?.longitude ?? row?.longitude);

  if (lat === null || lon === null) {
    throw new Error("No destination coordinates found from Tripadvisor");
  }

  return {
    lat,
    lon,
    formatted: details?.address_obj?.address_string || details?.name || row.name || destination,
  };
}

async function searchDestinationsFromTripadvisor(text, limit = 8) {
  const rows = await fetchTripadvisorGeoLocationRows(text, limit);

  return rows.map((row) => {
    const name = String(row.name || "").trim();
    const address = String(row.address_obj?.address_string || row.address_string || "").trim();
    const formatted = address && address.toLowerCase().includes(name.toLowerCase()) ? address : [name, address].filter(Boolean).join(", ");

    return {
      placeId: `tripadvisor-${row.location_id}`,
      name,
      subtitle: address && address !== name ? address : "",
      formatted: formatted || name,
      resultType: "tripadvisor",
    };
  });
}

async function searchDestinations(text, limit = 8) {
  const query = normaliseDestinationQuery(text);
  if (!query) return [];

  const popularResults = searchPopularDestinations(query, limit);
  let tripadvisorResults = [];

  try {
    tripadvisorResults = await searchDestinationsFromTripadvisor(query, limit);
  } catch (err) {
    console.error("Tripadvisor destination suggestions fallback:", err.message);
  }

  return mergeDestinationResults([popularResults, tripadvisorResults], query, limit);
}

function extractTripadvisorImage(base = {}, item = {}, photos = []) {
  const firstPhoto = Array.isArray(photos) && photos.length > 0 ? photos[0] : null;

  return (
    firstPhoto?.images?.original?.url ||
    firstPhoto?.images?.large?.url ||
    firstPhoto?.images?.medium?.url ||
    firstPhoto?.images?.small?.url ||
    firstPhoto?.images?.thumbnail?.url ||
    firstPhoto?.image?.url ||
    firstPhoto?.url ||
    base?.photo?.images?.original?.url ||
    base?.photo?.images?.large?.url ||
    base?.photo?.images?.medium?.url ||
    base?.photo?.images?.small?.url ||
    base?.photo?.images?.thumbnail?.url ||
    base?.photo?.image?.url ||
    base?.photo?.url ||
    base?.images?.original?.url ||
    base?.images?.large?.url ||
    base?.images?.medium?.url ||
    base?.images?.small?.url ||
    base?.images?.thumbnail?.url ||
    item?.photo?.images?.original?.url ||
    item?.photo?.images?.large?.url ||
    item?.photo?.images?.medium?.url ||
    item?.photo?.images?.small?.url ||
    item?.photo?.images?.thumbnail?.url ||
    item?.photo?.image?.url ||
    item?.photo?.url ||
    item?.images?.original?.url ||
    item?.images?.large?.url ||
    item?.images?.medium?.url ||
    item?.images?.small?.url ||
    item?.images?.thumbnail?.url ||
    ""
  );
}

function extractTripadvisorRating(base = {}, item = {}) {
  return (
    parseRating(base?.rating) ??
    parseRating(item?.rating) ??
    safeNumber(base?.rating) ??
    safeNumber(item?.rating) ??
    null
  );
}

function extractTripadvisorPrice(base = {}, item = {}) {
  return (
    parsePrice(base?.price) ??
    parsePrice(item?.price) ??
    parsePrice(base?.price_range) ??
    parsePrice(item?.price_range) ??
    null
  );
}

function extractTripadvisorPriceText(base = {}, item = {}) {
  const values = [
    base?.price_range,
    item?.price_range,
    base?.price,
    item?.price,
    base?.price_level,
    item?.price_level,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return values.find(hasActualPriceText) || values[0] || "";
}

async function fetchTripadvisorLocationDetails(locationId) {
  const url =
    `https://api.content.tripadvisor.com/api/v1/location/${encodeURIComponent(locationId)}/details` +
    `?key=${encodeURIComponent(TRIPADVISOR_API_KEY)}&language=en&currency=GBP`;

  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(getTripadvisorErrorMessage(data, `Tripadvisor details failed for ${locationId}`));
  }

  return data;
}

async function fetchTripadvisorLocationPhotos(locationId) {
  if (!TRIPADVISOR_API_KEY) return [];

  const url =
    `https://api.content.tripadvisor.com/api/v1/location/${encodeURIComponent(locationId)}/photos` +
    `?key=${encodeURIComponent(TRIPADVISOR_API_KEY)}` +
    `&language=en` +
    `&limit=5`;

  try {
    const res = await fetch(url, {
      headers: {
        accept: "application/json",
      },
    });

    const data = await res.json();

    if (!res.ok) {
      console.error(
        `Tripadvisor photos fallback for ${locationId}:`,
        getTripadvisorErrorMessage(data, res.statusText)
      );
      return [];
    }

    return Array.isArray(data?.data) ? data.data : [];
  } catch (err) {
    console.error(`Tripadvisor photos fallback for ${locationId}:`, err.message);
    return [];
  }
}

async function searchTripadvisorHotelLocations(destination, limit = 12) {
  const searchUrl =
    `https://api.content.tripadvisor.com/api/v1/location/search` +
    `?key=${encodeURIComponent(TRIPADVISOR_API_KEY)}` +
    `&searchQuery=${encodeURIComponent(`hotels in ${destination}`)}` +
    `&category=hotels` +
    `&language=en`;

  const res = await fetch(searchUrl);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(getTripadvisorErrorMessage(data, "Tripadvisor hotel location search failed"));
  }

  const rows = Array.isArray(data?.data) ? data.data : [];

  return rows.filter((row) => row?.location_id).slice(0, limit);
}

async function searchTripadvisorNearbyHotelLocations(destination, limit = 12) {
  const location = await tripadvisorGeocodeDestination(destination);

  const nearbyUrl =
    `https://api.content.tripadvisor.com/api/v1/location/nearby_search` +
    `?key=${encodeURIComponent(TRIPADVISOR_API_KEY)}` +
    `&latLong=${encodeURIComponent(`${location.lat},${location.lon}`)}` +
    `&category=hotels` +
    `&language=en`;

  const res = await fetch(nearbyUrl);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(getTripadvisorErrorMessage(data, "Tripadvisor nearby hotel search failed"));
  }

  const rows = Array.isArray(data?.data) ? data.data : [];

  return rows.filter((row) => row?.location_id).slice(0, limit);
}

function normaliseTripadvisorNearbyHotel(item, detail = null, photos = []) {
  const base = detail || {};
  const fallback = item || {};

  const title = base?.name || fallback?.name || "Unnamed hotel";
  const sourceId = base?.location_id || fallback?.location_id || crypto.randomUUID();

  const subtitle =
    base?.address_obj?.address_string ||
    base?.address_string ||
    fallback?.address_obj?.address_string ||
    fallback?.address_string ||
    "";

  const rating = extractTripadvisorRating(base, fallback);
  const price = extractTripadvisorPrice(base, fallback);
  const priceLevelText = extractTripadvisorPriceText(base, fallback);
  const link = base?.web_url || fallback?.web_url || "";
  const image = extractTripadvisorImage(base, fallback, photos);

  const textBlob = [
    title,
    subtitle,
    base?.price_level || "",
    fallback?.price_level || "",
    base?.description || "",
    fallback?.description || "",
    JSON.stringify(base?.amenities || []),
    JSON.stringify(fallback?.amenities || []),
    JSON.stringify(base?.subcategory || []),
    JSON.stringify(fallback?.subcategory || []),
  ].join(" ");

  return {
    source: "TRIPADVISOR",
    sourceId: String(sourceId),
    title,
    subtitle,
    price,
    priceLevelText,
    currency: "GBP",
    rating,
    image,
    link,
    tags: inferAccommodationTagsFromText(textBlob),
  };
}

async function searchTripadvisorHotels(destination, limit = 12) {
  if (!TRIPADVISOR_API_KEY) throw new Error("Missing TRIPADVISOR_API_KEY");

  let rows = [];

  try {
    rows = await searchTripadvisorNearbyHotelLocations(destination, limit);
  } catch (err) {
    console.error("Tripadvisor nearby hotel search failed:", err.message);
  }

  if (!rows.length) {
    try {
      rows = await searchTripadvisorHotelLocations(destination, limit);
    } catch (err) {
      console.error("Tripadvisor location search failed:", err.message);
      throw err;
    }
  }

  if (!rows.length) return [];

  const seenLocationIds = new Set();
  const uniqueRows = rows.filter((row) => {
    const id = String(row.location_id || "");
    if (!id || seenLocationIds.has(id)) return false;
    seenLocationIds.add(id);
    return true;
  });

  const enrichedRows = await Promise.all(
    uniqueRows.map(async (row) => {
      const locationId = row?.location_id;

      let detail = null;
      let photos = [];

      try {
        detail = await fetchTripadvisorLocationDetails(locationId);
      } catch (err) {
        console.error(`Tripadvisor details fallback for ${locationId}:`, err.message);
      }

      try {
        photos = await fetchTripadvisorLocationPhotos(locationId);
      } catch (err) {
        console.error(`Tripadvisor photos fallback for ${locationId}:`, err.message);
      }

      return { row, detail, photos };
    })
  );

  return enrichedRows
    .map(({ row, detail, photos }) => normaliseTripadvisorNearbyHotel(row, detail, photos))
    .filter((item) => item.title && item.sourceId)
    .sort((a, b) => {
      const aHasImage = a.image ? 1 : 0;
      const bHasImage = b.image ? 1 : 0;
      if (bHasImage !== aHasImage) return bHasImage - aHasImage;

      const aRating = typeof a.rating === "number" ? a.rating : -Infinity;
      const bRating = typeof b.rating === "number" ? b.rating : -Infinity;
      if (bRating !== aRating) return bRating - aRating;

      return a.title.localeCompare(b.title);
    })
    .slice(0, limit);
}

function normaliseYelpActivity(business = {}) {
  const categories = Array.isArray(business.categories)
    ? business.categories.map((category) => category?.title || category?.alias).filter(Boolean)
    : [];

  const title = String(business.name || "").trim();
  if (!title) return null;

  const subtitle = [business.location?.address1, business.location?.city, business.location?.country]
    .filter(Boolean)
    .join(", ");

  const textBlob = [title, subtitle, ...categories].join(" ");

  return {
    source: "YELP",
    sourceId: String(business.id || crypto.randomUUID()),
    title,
    subtitle,
    price: null,
    priceLevelText: business.price || "",
    currency: "GBP",
    rating: typeof business.rating === "number" ? business.rating : null,
    image: business.image_url || "",
    link: business.url || "",
    tags: inferActivityTags(categories, textBlob),
  };
}

async function fetchYelpBusinessDetails(businessId) {
  const res = await fetch(`https://api.yelp.com/v3/businesses/${encodeURIComponent(businessId)}`, {
    headers: {
      Authorization: `Bearer ${YELP_API_KEY}`,
      Accept: "application/json",
    },
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error?.description || "Yelp business details failed");
  }

  return data;
}

async function searchYelpActivities(destination, limit = 12) {
  if (!YELP_API_KEY) throw new Error("Missing YELP_API_KEY");

  const categories = ["arts", "museums", "landmarks", "tours", "nightlife", "active", "food"].join(",");

  const searchUrl =
    `https://api.yelp.com/v3/businesses/search?location=${encodeURIComponent(destination)}` +
    `&categories=${encodeURIComponent(categories)}` +
    `&sort_by=rating` +
    `&limit=${limit}`;

  const searchRes = await fetch(searchUrl, {
    headers: {
      Authorization: `Bearer ${YELP_API_KEY}`,
      Accept: "application/json",
    },
  });

  const searchData = await searchRes.json();

  if (!searchRes.ok) {
    throw new Error(searchData?.error?.description || "Yelp business search failed");
  }

  const businesses = Array.isArray(searchData.businesses) ? searchData.businesses : [];

  const detailedBusinesses = await Promise.all(
    businesses.map(async (business) => {
      try {
        return await fetchYelpBusinessDetails(business.id);
      } catch {
        return business;
      }
    })
  );

  return detailedBusinesses.map(normaliseYelpActivity).filter((item) => item && item.title && item.sourceId);
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
      priceLevelText: "£££",
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
      priceLevelText: "££",
      currency: "GBP",
      rating: 3.9,
      image: "",
      link: "",
      tags: ["WIFI", "BREAKFAST_INCLUDED"],
    },
  ];
}

async function addWinnerToItinerary(sessionCode, winningOption) {
  if (!winningOption?._id) return null;

  const existingItems = await ItineraryItem.find({ sessionCode }).sort({ orderIndex: 1 }).lean();
  const nextOrderIndex = existingItems.length + 1;

  const existingMatch = await ItineraryItem.findOne({
    sessionCode,
    optionId: winningOption._id,
  }).lean();

  if (existingMatch) {
    return existingMatch;
  }

  const created = await ItineraryItem.create({
    sessionCode,
    optionId: winningOption._id,
    type: winningOption.type,
    title: winningOption.title,
    subtitle: winningOption.subtitle || "",
    price: winningOption.price ?? null,
    priceLevelText: winningOption.priceLevelText || "",
    currency: winningOption.currency || "GBP",
    rating: winningOption.rating ?? null,
    image: winningOption.image || "",
    link: winningOption.link || "",
    tags: Array.isArray(winningOption.tags) ? winningOption.tags : [],
    orderIndex: nextOrderIndex,
    scheduledDate: "",
    scheduledTime: "",
  });

  return created;
}

async function applyAutoSortToItinerary(sessionCode) {
  const items = await ItineraryItem.find({ sessionCode }).sort({ orderIndex: 1, createdAt: 1 });

  const scheduled = [];
  const unscheduled = [];

  for (const item of items) {
    if (item.scheduledDate) {
      scheduled.push(item);
    } else {
      unscheduled.push(item);
    }
  }

  scheduled.sort((a, b) => {
    const aKey = `${a.scheduledDate || ""} ${a.scheduledTime || "99:99"}`;
    const bKey = `${b.scheduledDate || ""} ${b.scheduledTime || "99:99"}`;
    return aKey.localeCompare(bKey);
  });

  const finalOrder = [...scheduled, ...unscheduled];

  for (let i = 0; i < finalOrder.length; i += 1) {
    finalOrder[i].orderIndex = i + 1;
    await finalOrder[i].save();
  }

  return finalOrder;
}

async function beginNextPlanningRound(session, acceptedUserIds = []) {
  await Submission.deleteMany({ sessionCode: session.sessionCode });
  await Vote.deleteMany({ sessionCode: session.sessionCode });
  await Option.deleteMany({ sessionCode: session.sessionCode });
  await ItineraryChangeRequest.deleteMany({ sessionCode: session.sessionCode, status: "PENDING" });

  session.stage = "SEARCH";
  session.isStarted = true;
  session.startedAt = new Date();
  session.currentVoteRound = 1;
  session.tieBreakOptionIds = [];
  session.replanPrompt = buildEmptyReplanPrompt();

  await session.save();

  return {
    stage: session.stage,
    acceptedUserIds,
  };
}

app.post("/sessions/:code/replan/request", async (req, res) => {
  try {
    const sessionCode = req.params.code;
    const { userId, planningType } = req.body;

    if (!userId || !planningType) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!["ACCOMMODATION", "ACTIVITIES"].includes(planningType)) {
      return res.status(400).json({ error: "Invalid planningType" });
    }

    const session = await Session.findOne({ sessionCode });
    if (!session) return res.status(404).json({ error: "Session not found" });

    if (session.hostUserId !== userId) {
      return res.status(403).json({ error: "Only the host can request another planning round" });
    }

    session.stage = "REPLAN_PROMPT";
    session.planningType = planningType;
    session.replanPrompt = buildReplanPromptObject(planningType, userId, [userId]);
    await session.save();

    res.json({
      sessionCode,
      stage: session.stage,
      replanPrompt: session.replanPrompt,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/sessions/:code/replan/respond", async (req, res) => {
  try {
    const sessionCode = req.params.code;
    const { userId, accept, promptId } = req.body;

    if (!userId || typeof accept !== "boolean") {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const session = await Session.findOne({ sessionCode });
    if (!session) return res.status(404).json({ error: "Session not found" });

    const user = await User.findOne({ sessionCode, userId });
    if (!user) return res.status(404).json({ error: "User not found in this session" });

    if (session.stage !== "REPLAN_PROMPT" || !session.replanPrompt?.active) {
      return res.status(400).json({ error: "There is no active replan prompt" });
    }

    if (promptId && session.replanPrompt.promptId && promptId !== session.replanPrompt.promptId) {
      return res.status(409).json({ error: "This replan prompt is no longer current" });
    }

    const accepted = Array.isArray(session.replanPrompt.acceptedUserIds)
      ? session.replanPrompt.acceptedUserIds.map(String)
      : [];

    const declined = Array.isArray(session.replanPrompt.declinedUserIds)
      ? session.replanPrompt.declinedUserIds.map(String)
      : [];

    if (accept) {
      if (!accepted.includes(userId)) accepted.push(userId);
      session.replanPrompt.acceptedUserIds = accepted;
      session.replanPrompt.declinedUserIds = declined;

      const totalUsers = await User.countDocuments({ sessionCode });

      if (accepted.length >= totalUsers) {
        const result = await beginNextPlanningRound(session, accepted);

        return res.json({
          sessionCode,
          stage: result.stage,
          acceptedUserIds: accepted,
          removedFromSession: false,
        });
      }

      await session.save();

      return res.json({
        sessionCode,
        stage: session.stage,
        acceptedUserIds: accepted,
        removedFromSession: false,
      });
    }

    if (!declined.includes(userId)) declined.push(userId);
    session.replanPrompt.declinedUserIds = declined;
    await session.save();

    await User.deleteOne({ sessionCode, userId });
    await Submission.deleteMany({ sessionCode, userId });
    await Vote.deleteMany({ sessionCode, userId });

    const remainingUsers = await User.countDocuments({ sessionCode });
    const acceptedStillInSession = accepted.filter((acceptedUserId) => acceptedUserId !== userId);

    if (remainingUsers > 0 && acceptedStillInSession.length >= remainingUsers) {
      const result = await beginNextPlanningRound(session, acceptedStillInSession);

      return res.json({
        sessionCode,
        removedFromSession: true,
        stage: result.stage,
      });
    }

    return res.json({
      sessionCode,
      removedFromSession: true,
      stage: session.stage,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    mongoConnected: mongoose.connection.readyState === 1,
    hasTripadvisorKey: Boolean(TRIPADVISOR_API_KEY),
    hasYelpKey: Boolean(YELP_API_KEY),
  });
});

app.get("/locations/destinations", async (req, res) => {
  try {
    const text = normaliseDestinationQuery(req.query.text);

    if (text.length < 1) {
      return res.json({ results: [] });
    }

    const results = await searchDestinations(text, 8);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/sessions/draft", async (req, res) => {
  try {
    const sessionCode = await createUniqueSessionCode();
    await Session.create({
      sessionCode,
      stage: "DRAFT",
      isStarted: false,
      currentVoteRound: 1,
      tieBreakOptionIds: [],
      replanPrompt: buildEmptyReplanPrompt(),
    });
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
    session.currentVoteRound = 1;
    session.tieBreakOptionIds = [];
    session.replanPrompt = buildEmptyReplanPrompt();
    await session.save();

    await User.create({
      userId,
      displayName,
      sessionCode,
      filters: { minRating: null, tags: [] },
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
      filters: { minRating: null, tags: [] },
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
        replanPrompt: session.replanPrompt || null,
      },
      users: users.map((u) => ({
        userId: u.userId,
        displayName: u.displayName,
        sessionCode: u.sessionCode,
        joinedAt: u.joinedAt,
        filters: u.filters || { minRating: null, tags: [] },
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
      if ("minRating" in filters) {
        next.minRating = filters.minRating === "" || filters.minRating === null ? null : Number(filters.minRating);
      }
      if ("tags" in filters) {
        next.tags = Array.isArray(filters.tags) ? filters.tags.map((t) => String(t)).filter(Boolean) : [];
      }
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

    let userFilters = { minRating: null, tags: [] };

    if (userId) {
      const user = await User.findOne({ sessionCode, userId }).lean();
      if (user?.filters) userFilters = user.filters;
    }

    let results = [];

    try {
      if (session.planningType === "ACTIVITIES") {
        results = await searchYelpActivities(session.destination, 12);
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
      priceLevelText: String(option.priceLevelText || ""),
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
      const submissions = await Submission.find({ sessionCode }).lean();
      const uniqueOptionIds = [...new Set(submissions.map((submission) => String(submission.optionId)))];

      await Vote.deleteMany({ sessionCode });

      if (uniqueOptionIds.length === 1) {
        const winningOption = await Option.findById(uniqueOptionIds[0]);
        let itineraryItem = null;

        if (winningOption) {
          const createdItem = await addWinnerToItinerary(sessionCode, winningOption);
          if (createdItem) {
            itineraryItem = serialiseItineraryItem(createdItem, createdItem.orderIndex || 1);
            await applyAutoSortToItinerary(sessionCode);
          }
        }

        session.stage = "RESULT";
        session.currentVoteRound = 1;
        session.tieBreakOptionIds = [];
        session.replanPrompt = buildEmptyReplanPrompt();
        await session.save();

        return res.json({
          sessionCode,
          submitted: true,
          allSubmitted: true,
          submissionCount: submittedCount,
          totalUsers,
          stage: "RESULT",
          skippedVoting: true,
          winner: winningOption ? serialisePublicOption(winningOption) : null,
          itineraryItem,
        });
      }

      session.stage = "VOTING";
      session.currentVoteRound = 1;
      session.tieBreakOptionIds = [];
      session.replanPrompt = buildEmptyReplanPrompt();
      await session.save();
    }

    res.json({
      sessionCode,
      submitted: true,
      allSubmitted,
      submissionCount: submittedCount,
      totalUsers,
      stage: allSubmitted ? "VOTING" : session.stage,
      skippedVoting: false,
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

    if (!["VOTING", "TIEBREAK", "RESULT", "REPLAN_PROMPT"].includes(session.stage)) {
      return res.status(403).json({ error: "Voting has not started yet" });
    }

    const user = await User.findOne({ sessionCode, userId }).lean();
    if (!user) return res.status(404).json({ error: "User not found in this session" });

    const [options, votes, ownership] = await Promise.all([
      getRoundOptions(session),
      Vote.find({ sessionCode, userId, roundNumber: session.currentVoteRound }).lean(),
      getSubmissionOwnership(sessionCode),
    ]);

    const candidates = options.map((option, index) => {
      const optionId = String(option._id);
      const existingVote = votes.find((vote) => String(vote.optionId) === optionId);
      const match = optionMatchesFilters(option, user.filters || {});
      const canVote = !ownership.isExclusivelyOwnedByUser(optionId, userId);
      const ownerCount = ownership.ownerCountByOptionId.get(optionId) || 0;
      const sharedSubmission = ownership.isSharedSubmissionForUser(optionId, userId);

      return {
        ...serialisePublicOption(option, index + 1),
        matchesUserFilters: match.matchesFilters,
        budgetOk: true,
        ratingOk: match.ratingOk,
        tagOk: match.tagOk,
        canVote,
        sharedSubmission,
        sharedSubmissionCount: ownerCount,
        sharedSubmissionMessage: sharedSubmission
          ? ownerCount === 2
            ? "You and someone else submitted this same option, so you are both allowed to vote on it."
            : "You and other users submitted this same option, so you are all allowed to vote on it."
          : "",
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
      replanPrompt: session.replanPrompt || null,
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

    if (!["VOTING", "TIEBREAK", "RESULT", "REPLAN_PROMPT"].includes(session.stage)) {
      return res.status(403).json({ error: "Voting is not active" });
    }

    const user = await User.findOne({ sessionCode, userId }).lean();
    if (!user) return res.status(404).json({ error: "User not found in this session" });

    const [options, ownership] = await Promise.all([
      getRoundOptions(session),
      getSubmissionOwnership(sessionCode),
    ]);

    const exclusivelyOwnedOptionIds = options
      .map((option) => String(option._id))
      .filter((optionId) => ownership.isExclusivelyOwnedByUser(optionId, userId));

    const votableOptionIds = options
      .map((option) => String(option._id))
      .filter((optionId) => !ownership.isExclusivelyOwnedByUser(optionId, userId));

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

    for (const ownedOptionId of exclusivelyOwnedOptionIds) {
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
          submittedAt: new Date(),
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      );
    }

    const computation = await getVotingComputation(sessionCode);
    const sorted = [...computation.summaries].sort(compareSummaryValues);

    let winner = null;
    let itineraryItem = null;

    if (computation.allVotesComplete) {
      if (sorted.length > 0) {
        winner = serialisePublicOption(sorted[0].option);
        const createdItem = await addWinnerToItinerary(sessionCode, sorted[0].option);
        if (createdItem) {
          itineraryItem = serialiseItineraryItem(createdItem, createdItem.orderIndex || 1);
          await applyAutoSortToItinerary(sessionCode);
        }
      }

      session.stage = "RESULT";
      session.replanPrompt = buildEmptyReplanPrompt();
      await session.save();
    }

    res.json({
      sessionCode,
      saved: true,
      allVotesComplete: computation.allVotesComplete,
      movedToTieBreak: false,
      winner,
      tie: false,
      itineraryItem,
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

    if (["RESULT", "REPLAN_PROMPT"].includes(computation.session.stage)) {
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
      replanPrompt: computation.session.replanPrompt || null,
      hostUserId: computation.session.hostUserId || "",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/sessions/:code/itinerary", async (req, res) => {
  try {
    const sessionCode = req.params.code;
    const currentUserId = String(req.query.userId || "");

    const session = await Session.findOne({ sessionCode }).lean();
    if (!session) return res.status(404).json({ error: "Session not found" });

    const items = await ItineraryItem.find({ sessionCode }).sort({ orderIndex: 1, createdAt: 1 }).lean();
    const pendingRequest = await ItineraryChangeRequest.findOne({ sessionCode, status: "PENDING" }).lean();
    const pendingRequestItem = pendingRequest
      ? items.find((item) => String(item._id) === String(pendingRequest.itineraryItemId))
      : null;
    const totalUsers = await User.countDocuments({ sessionCode });

    const approvals = Array.isArray(pendingRequest?.approvals)
      ? pendingRequest.approvals.map((id) => String(id))
      : [];

    const currentUserHasApproved = currentUserId ? approvals.includes(currentUserId) : false;

    res.json({
      sessionCode,
      title: `Itinerary - ${session.sessionName || sessionCode}`,
      session: {
        sessionCode: session.sessionCode,
        sessionName: session.sessionName,
        destination: session.destination,
        planningType: session.planningType,
        stage: session.stage,
        hostUserId: session.hostUserId || "",
        replanPrompt: session.replanPrompt || null,
      },
      items: items.map((item, index) => serialiseItineraryItem(item, index + 1)),
      pendingRequest: pendingRequest
        ? {
            requestId: String(pendingRequest._id),
            type: pendingRequest.type,
            moveDirection: pendingRequest.moveDirection || "",
            requestedByUserId: pendingRequest.requestedByUserId || "",
            itineraryItemId: String(pendingRequest.itineraryItemId),
            itineraryItemTitle: pendingRequestItem?.title || "",
            approvalCount: approvals.length,
            approvals,
            totalUsers,
            currentUserHasApproved,
          }
        : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/sessions/:code/itinerary/export", async (req, res) => {
  try {
    const sessionCode = req.params.code;

    const session = await Session.findOne({ sessionCode }).lean();
    if (!session) return res.status(404).send("Session not found");

    const items = await ItineraryItem.find({ sessionCode }).sort({ orderIndex: 1, createdAt: 1 }).lean();

    let output = `Itinerary - ${session.sessionName || sessionCode}\n`;
    output += `Destination: ${session.destination || ""}\n\n`;

    if (!items.length) {
      output += "No itinerary items yet.\n";
    } else {
      for (const item of items) {
        output += `${item.orderIndex}. ${item.title}\n`;
        if (item.subtitle) output += `   ${item.subtitle}\n`;
        if (item.scheduledDate) output += `   Date: ${item.scheduledDate}\n`;
        if (item.scheduledTime) output += `   Time: ${item.scheduledTime}\n`;
        if (typeof item.price === "number") output += `   Price: ${item.currency || "GBP"} ${item.price}\n`;
        if (typeof item.rating === "number") output += `   Rating: ${item.rating}\n`;
        if (item.link) output += `   Link: ${item.link}\n`;
        output += "\n";
      }
    }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${`itinerary-${(session.sessionName || sessionCode).replace(/[^a-z0-9-_ ]/gi, "")}.txt`}"`
    );
    res.send(output);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.put("/sessions/:code/itinerary/items/:itemId/schedule", async (req, res) => {
  try {
    const sessionCode = req.params.code;
    const itemId = req.params.itemId;
    const { userId, scheduledDate, scheduledTime } = req.body;

    if (!userId) return res.status(400).json({ error: "Missing userId" });

    const user = await User.findOne({ sessionCode, userId }).lean();
    if (!user) return res.status(404).json({ error: "User not found in this session" });

    const item = await ItineraryItem.findOne({ _id: itemId, sessionCode });
    if (!item) return res.status(404).json({ error: "Itinerary item not found" });

    item.scheduledDate = scheduledDate ? String(scheduledDate) : "";
    item.scheduledTime = scheduledTime ? String(scheduledTime) : "";
    await item.save();

    await applyAutoSortToItinerary(sessionCode);

    const refreshed = await ItineraryItem.findOne({ _id: itemId, sessionCode }).lean();

    res.json({
      sessionCode,
      item: serialiseItineraryItem(refreshed, refreshed.orderIndex || 1),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/sessions/:code/itinerary/request-remove", async (req, res) => {
  try {
    const sessionCode = req.params.code;
    const { userId, itineraryItemId } = req.body;

    if (!userId || !itineraryItemId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const user = await User.findOne({ sessionCode, userId }).lean();
    if (!user) {
      return res.status(404).json({ error: "User not found in this session" });
    }

    const item = await ItineraryItem.findOne({ _id: itineraryItemId, sessionCode }).lean();
    if (!item) {
      return res.status(404).json({ error: "Itinerary item not found" });
    }

    const existingPending = await ItineraryChangeRequest.findOne({
      sessionCode,
      status: "PENDING",
    }).lean();

    if (existingPending) {
      return res.status(409).json({ error: "Resolve the current pending itinerary request first" });
    }

    const request = await ItineraryChangeRequest.create({
      sessionCode,
      type: "REMOVE",
      itineraryItemId,
      requestedByUserId: String(userId),
      approvals: [String(userId)],
      moveDirection: "",
      status: "PENDING",
    });

    return res.json({
      sessionCode,
      requestId: String(request._id),
      approvalCount: request.approvals.length,
      message: "Removal request created",
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/sessions/:code/itinerary/request-move", async (req, res) => {
  try {
    const sessionCode = req.params.code;
    const { userId, itineraryItemId, direction } = req.body;

    if (!userId || !itineraryItemId || !direction) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!["UP", "DOWN"].includes(direction)) {
      return res.status(400).json({ error: "direction must be UP or DOWN" });
    }

    const user = await User.findOne({ sessionCode, userId }).lean();
    if (!user) {
      return res.status(404).json({ error: "User not found in this session" });
    }

    const item = await ItineraryItem.findOne({ _id: itineraryItemId, sessionCode });
    if (!item) {
      return res.status(404).json({ error: "Itinerary item not found" });
    }

    if (item.type !== "ACTIVITIES") {
      return res.status(400).json({ error: "Only activities can be manually reordered" });
    }

    if (item.scheduledDate || item.scheduledTime) {
      return res.status(400).json({ error: "Scheduled activities cannot be manually moved" });
    }

    const orderedItems = await ItineraryItem.find({ sessionCode }).sort({ orderIndex: 1, createdAt: 1 });
    const movableActivities = orderedItems.filter(
      (entry) => entry.type === "ACTIVITIES" && !entry.scheduledDate && !entry.scheduledTime
    );

    const currentIndex = movableActivities.findIndex(
      (entry) => String(entry._id) === String(itineraryItemId)
    );

    if (currentIndex === -1) {
      return res.status(400).json({ error: "This activity is not movable" });
    }

    if (direction === "UP" && currentIndex === 0) {
      return res.status(400).json({ error: "This activity is already at the top of the unscheduled activity list" });
    }

    if (direction === "DOWN" && currentIndex === movableActivities.length - 1) {
      return res.status(400).json({ error: "This activity is already at the bottom of the unscheduled activity list" });
    }

    const targetIndex = direction === "UP" ? currentIndex - 1 : currentIndex + 1;
    const currentItem = movableActivities[currentIndex];
    const targetItem = movableActivities[targetIndex];

    const tempOrder = currentItem.orderIndex;
    currentItem.orderIndex = targetItem.orderIndex;
    targetItem.orderIndex = tempOrder;

    await currentItem.save();
    await targetItem.save();
    await applyAutoSortToItinerary(sessionCode);

    return res.json({
      sessionCode,
      message: `Item moved ${direction.toLowerCase()}`,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/sessions/:code/itinerary/requests/:requestId/approve", async (req, res) => {
  try {
    const sessionCode = req.params.code;
    const requestId = req.params.requestId;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    const user = await User.findOne({ sessionCode, userId }).lean();
    if (!user) {
      return res.status(404).json({ error: "User not found in this session" });
    }

    const request = await ItineraryChangeRequest.findOne({
      _id: requestId,
      sessionCode,
      status: "PENDING",
    });

    if (!request) {
      return res.status(404).json({ error: "Pending request not found" });
    }

    if (!Array.isArray(request.approvals)) {
      request.approvals = [];
    }

    const requestApprovals = request.approvals.map((id) => String(id));
    if (!requestApprovals.includes(String(userId))) {
      request.approvals.push(String(userId));
      await request.save();
    }

    const totalUsers = await User.countDocuments({ sessionCode });
    let applied = false;

    const refreshedApprovals = Array.isArray(request.approvals)
      ? request.approvals.map((id) => String(id))
      : [];

    if (refreshedApprovals.length >= totalUsers) {
      if (request.type === "REMOVE") {
        const item = await ItineraryItem.findOne({
          _id: request.itineraryItemId,
          sessionCode,
        });

        if (item) {
          await ItineraryItem.deleteOne({ _id: item._id });
          await applyAutoSortToItinerary(sessionCode);
        }
      }

      request.status = "APPLIED";
      await request.save();
      applied = true;
    }

    return res.json({
      sessionCode,
      applied,
      approvalCount: refreshedApprovals.length,
      totalUsers,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
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
