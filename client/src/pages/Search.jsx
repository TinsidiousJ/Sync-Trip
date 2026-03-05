import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

const API_BASE = "http://localhost:4000";

const ACCOMMODATION_TAGS = [
  "WIFI",
  "BREAKFAST_INCLUDED",
  "PARKING",
  "POOL",
  "GYM",
  "AIR_CONDITIONING",
  "PET_FRIENDLY",
];

const ACTIVITY_TAGS = [
  "TOURISM",
  "ENTERTAINMENT",
  "CATERING",
  "LEISURE",
  "NATURAL",
];

export default function Search() {
  const navigate = useNavigate();
  const { code } = useParams();
  const [searchParams] = useSearchParams();

  const queryUserId = searchParams.get("userId") || "";
  const queryHost = searchParams.get("host") || "";

  const userId = useMemo(() => queryUserId || localStorage.getItem("userId") || "", [queryUserId]);

  const [session, setSession] = useState(null);
  const [users, setUsers] = useState([]);
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");

  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [submittingChoices, setSubmittingChoices] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");

  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [minRating, setMinRating] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [didInitForm, setDidInitForm] = useState(false);

  const draftStorageKey = useMemo(() => `sync_trip_draft_${code}_${userId}`, [code, userId]);
  const [draftChoices, setDraftChoices] = useState([]);

  const tagOptions = useMemo(() => {
    if (session?.planningType === "ACTIVITIES") return ACTIVITY_TAGS;
    return ACCOMMODATION_TAGS;
  }, [session?.planningType]);

  async function loadSession({ initForm = false } = {}) {
    try {
      setError("");
      setLoadingSession(true);

      const res = await fetch(`${API_BASE}/sessions/${code}/lobby`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to load session");

      if (data.session?.stage !== "SEARCH" && !data.session?.isStarted) {
        navigate(`/lobby/${code}?userId=${userId}&host=${queryHost || localStorage.getItem("host") || "0"}`);
        return;
      }

      setSession(data.session || null);
      setUsers(data.users || []);

      if ((initForm || !didInitForm) && userId) {
        const me = (data.users || []).find((u) => u.userId === userId);
        const f = me?.filters;

        if (f) {
          setBudgetMin(f.budgetMin === null || typeof f.budgetMin === "undefined" ? "" : String(f.budgetMin));
          setBudgetMax(f.budgetMax === null || typeof f.budgetMax === "undefined" ? "" : String(f.budgetMax));
          setMinRating(f.minRating === null || typeof f.minRating === "undefined" ? "" : String(f.minRating));
          setSelectedTags(Array.isArray(f.tags) ? f.tags : []);
        }

        setDidInitForm(true);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingSession(false);
    }
  }

  function currentFilterPayload(overrides = {}) {
    return {
      budgetMin: budgetMin === "" ? null : Number(budgetMin),
      budgetMax: budgetMax === "" ? null : Number(budgetMax),
      minRating: minRating === "" ? null : Number(minRating),
      tags: selectedTags,
      ...overrides,
    };
  }

  async function saveFilters(next) {
    if (!userId) return;

    const res = await fetch(`${API_BASE}/sessions/${code}/filters`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, filters: next }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to save filters");
    return data;
  }

  async function applyFiltersAndRefresh() {
    try {
      setError("");
      await saveFilters(currentFilterPayload());
      await fetchResults();
    } catch (e) {
      setError(e.message);
    }
  }

  async function fetchResults() {
    try {
      setError("");
      setLoadingResults(true);

      const res = await fetch(`${API_BASE}/sessions/${code}/options/search?userId=${encodeURIComponent(userId)}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to fetch search results");

      setResults(data.results || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingResults(false);
    }
  }

  function toggleTag(tag) {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function renderPrice(item) {
    if (item.price === null || typeof item.price === "undefined") return "Price unavailable";
    return `${item.currency || "GBP"} ${item.price}`;
  }

  function isInDraft(sourceId) {
    return draftChoices.some((item) => item.sourceId === sourceId);
  }

  function addToDraft(option) {
    setDraftChoices((prev) => {
      if (prev.some((item) => item.sourceId === option.sourceId)) return prev;
      return [...prev, option];
    });
  }

  function removeFromDraft(sourceId) {
    setDraftChoices((prev) => prev.filter((item) => item.sourceId !== sourceId));
  }

  async function submitChoices() {
    if (draftChoices.length === 0) {
      setError("Add at least one option before submitting.");
      return;
    }

    try {
      setError("");
      setSubmitMessage("");
      setSubmittingChoices(true);

      for (const option of draftChoices) {
        const res = await fetch(`${API_BASE}/sessions/${code}/options`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            option,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to submit choices");
      }

      setSubmitMessage("Choices submitted to the group pool.");
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmittingChoices(false);
    }
  }

  useEffect(() => {
    if (!draftStorageKey) return;

    const raw = localStorage.getItem(draftStorageKey);
    if (!raw) {
      setDraftChoices([]);
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      setDraftChoices(Array.isArray(parsed) ? parsed : []);
    } catch {
      setDraftChoices([]);
    }
  }, [draftStorageKey]);

  useEffect(() => {
    if (!draftStorageKey) return;
    localStorage.setItem(draftStorageKey, JSON.stringify(draftChoices));
  }, [draftChoices, draftStorageKey]);

  useEffect(() => {
    if (!code) return;

    localStorage.setItem("sessionCode", code);
    if (queryUserId) localStorage.setItem("userId", queryUserId);
    if (queryHost) localStorage.setItem("host", queryHost);

    loadSession({ initForm: true });
  }, [code, queryUserId, queryHost]);

  useEffect(() => {
    if (!didInitForm) return;
    fetchResults();
  }, [didInitForm]);

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Search</h1>

      {loadingSession ? <p>Loading session...</p> : null}
      {error ? <p>{error}</p> : null}
      {submitMessage ? <p>{submitMessage}</p> : null}

      {session ? (
        <div style={{ marginBottom: 20 }}>
          <p>
            Session Code: <strong>{code}</strong>
          </p>
          <p>
            Session: <strong>{session.sessionName}</strong>
          </p>
          <p>
            Destination: <strong>{session.destination}</strong>
          </p>
          <p>
            Planning Type: <strong>{session.planningType}</strong>
          </p>
        </div>
      ) : null}

      <button type="button" onClick={() => setShowFilters((prev) => !prev)} style={{ marginBottom: 12 }}>
        {showFilters ? "Hide Filters" : "Edit Filters"}
      </button>

      {showFilters ? (
        <div style={{ border: "1px solid #ccc", padding: 16, marginBottom: 20, borderRadius: 8 }}>
          <h2 style={{ marginTop: 0 }}>Your Filters</h2>

          <div style={{ marginBottom: 12 }}>
            <label>Budget Min</label>
            <br />
            <input value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} placeholder="e.g. 50" />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label>Budget Max</label>
            <br />
            <input value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} placeholder="e.g. 200" />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label>Minimum Rating</label>
            <br />
            <select value={minRating} onChange={(e) => setMinRating(e.target.value)}>
              <option value="">Any</option>
              <option value="3">3+</option>
              <option value="3.5">3.5+</option>
              <option value="4">4+</option>
              <option value="4.5">4.5+</option>
            </select>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label>{session?.planningType === "ACTIVITIES" ? "Activity Categories" : "Hotel Amenities"}</label>
            <div>
              {tagOptions.map((tag) => (
                <label key={tag} style={{ display: "block" }}>
                  <input type="checkbox" checked={selectedTags.includes(tag)} onChange={() => toggleTag(tag)} />
                  {tag}
                </label>
              ))}
            </div>
          </div>

          <button type="button" onClick={applyFiltersAndRefresh} disabled={loadingResults}>
            {loadingResults ? "Applying..." : "Apply Filters"}
          </button>
        </div>
      ) : null}

      <div style={{ marginBottom: 20 }}>
        <button type="button" onClick={fetchResults} disabled={loadingResults}>
          {loadingResults ? "Refreshing..." : "Refresh Results"}
        </button>
      </div>

      <h2>Your Draft Choices</h2>
      {draftChoices.length === 0 ? (
        <p>No draft choices selected yet.</p>
      ) : (
        <div style={{ marginBottom: 20 }}>
          {draftChoices.map((item) => (
            <div
              key={item.sourceId}
              style={{
                border: "1px solid #ccc",
                padding: 12,
                marginBottom: 12,
                borderRadius: 8,
              }}
            >
              <p style={{ margin: "0 0 8px 0" }}>
                <strong>{item.title}</strong>
              </p>
              {item.subtitle ? <p style={{ margin: "0 0 8px 0" }}>{item.subtitle}</p> : null}
              <p style={{ margin: "0 0 8px 0" }}>
                <strong>Price:</strong> {renderPrice(item)}
              </p>
              <button type="button" onClick={() => removeFromDraft(item.sourceId)}>
                Remove
              </button>
            </div>
          ))}

          <button type="button" onClick={submitChoices} disabled={submittingChoices}>
            {submittingChoices ? "Submitting..." : "Submit Choices"}
          </button>
        </div>
      )}

      <h2>Search Results</h2>

      {loadingResults ? <p>Loading results...</p> : null}
      {!loadingResults && results.length === 0 ? <p>No results found.</p> : null}

      <div>
        {results.map((item) => {
          const alreadyInDraft = isInDraft(item.sourceId);

          return (
            <div
              key={item.sourceId}
              style={{
                border: "1px solid #ccc",
                padding: 16,
                marginBottom: 16,
                borderRadius: 8,
              }}
            >
              {item.image ? (
                <img
                  src={item.image}
                  alt={item.title}
                  style={{
                    width: "100%",
                    maxWidth: 320,
                    height: 180,
                    objectFit: "cover",
                    display: "block",
                    marginBottom: 12,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    maxWidth: 320,
                    height: 180,
                    border: "1px solid #ddd",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 12,
                  }}
                >
                  No image
                </div>
              )}

              <h3 style={{ margin: "0 0 8px 0" }}>{item.title}</h3>

              {item.subtitle ? <p style={{ margin: "0 0 8px 0" }}>{item.subtitle}</p> : null}

              <p style={{ margin: "0 0 8px 0" }}>
                <strong>Rating:</strong>{" "}
                {item.rating !== null && typeof item.rating !== "undefined" ? item.rating : "Unavailable"}
              </p>

              <p style={{ margin: "0 0 8px 0" }}>
                <strong>Price:</strong> {renderPrice(item)}
              </p>

              <p style={{ margin: "0 0 8px 0" }}>
                <strong>Matches your filters:</strong> {item.matchesFilters ? "Yes" : "No"}
              </p>

              {item.tags?.length ? (
                <p style={{ margin: "0 0 8px 0" }}>
                  <strong>Tags:</strong> {item.tags.join(", ")}
                </p>
              ) : null}

              {item.link ? (
                <p style={{ margin: "0 0 12px 0" }}>
                  <a href={item.link} target="_blank" rel="noreferrer">
                    View source
                  </a>
                </p>
              ) : null}

              {alreadyInDraft ? (
                <button type="button" onClick={() => removeFromDraft(item.sourceId)}>
                  Remove from Draft
                </button>
              ) : (
                <button type="button" onClick={() => addToDraft(item)}>
                  Add to Draft
                </button>
              )}
            </div>
          );
        })}
      </div>

      <h2>Users in Session</h2>
      {users.length === 0 ? (
        <p>No users yet</p>
      ) : (
        <ul>
          {users.map((u) => (
            <li key={u.userId}>{u.displayName}</li>
          ))}
        </ul>
      )}
    </div>
  );
}