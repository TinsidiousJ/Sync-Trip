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
  const [submittingChoice, setSubmittingChoice] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [minRating, setMinRating] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [didInitForm, setDidInitForm] = useState(false);

  const [selectedChoice, setSelectedChoice] = useState(null);
  const [submissionStatus, setSubmissionStatus] = useState({
    currentUserSubmitted: false,
    allSubmitted: false,
    submissionCount: 0,
    totalUsers: 0,
    currentUserOption: null,
  });

  const tagOptions = useMemo(() => {
    if (session?.planningType === "ACTIVITIES") return ACTIVITY_TAGS;
    return ACCOMMODATION_TAGS;
  }, [session?.planningType]);

  async function readJsonSafely(res, fallbackMessage) {
    const text = await res.text();

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(fallbackMessage);
    }
  }

  async function loadSession({ initForm = false } = {}) {
    try {
      setError("");
      setLoadingSession(true);

      const res = await fetch(`${API_BASE}/sessions/${code}/lobby`);
      const data = await readJsonSafely(res, "Failed to load session");

      if (!res.ok) throw new Error(data.error || "Failed to load session");

      if (data.session?.stage === "VOTING" || data.session?.stage === "RESULT") {
        navigate(`/vote/${code}?userId=${userId}&host=${queryHost || localStorage.getItem("host") || "0"}`);
        return;
      }

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

    const data = await readJsonSafely(res, "Failed to save filters");
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
      const data = await readJsonSafely(res, "Failed to fetch search results");

      if (!res.ok) throw new Error(data.error || "Failed to fetch search results");

      setResults(data.results || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingResults(false);
    }
  }

  async function loadSubmissionStatus() {
    try {
      const res = await fetch(`${API_BASE}/sessions/${code}/submission-status?userId=${encodeURIComponent(userId)}`);
      const data = await readJsonSafely(res, "Submission status route missing or failed");

      if (!res.ok) throw new Error(data.error || "Failed to load submission status");

      setSubmissionStatus(data);

      if (data.currentUserOption) {
        setSelectedChoice(data.currentUserOption);
      }

      if (data.stage === "VOTING" || data.stage === "RESULT" || data.allSubmitted) {
        navigate(`/vote/${code}?userId=${userId}&host=${queryHost || localStorage.getItem("host") || "0"}`);
      }
    } catch (e) {
      setError(e.message);
    }
  }

  async function submitChoice() {
    if (!selectedChoice) {
      setError("Select one option before submitting.");
      return;
    }

    try {
      setError("");
      setSubmittingChoice(true);

      const res = await fetch(`${API_BASE}/sessions/${code}/submission`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          option: selectedChoice,
        }),
      });

      const data = await readJsonSafely(res, "Submission route missing or failed");
      if (!res.ok) throw new Error(data.error || "Failed to submit choice");

      await loadSubmissionStatus();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmittingChoice(false);
    }
  }

  function toggleTag(tag) {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function renderPrice(item) {
    if (item.price === null || typeof item.price === "undefined") return "Price unavailable";
    return `${item.currency || "GBP"} ${item.price}`;
  }

  useEffect(() => {
    if (!code) return;

    localStorage.setItem("sessionCode", code);
    if (queryUserId) localStorage.setItem("userId", queryUserId);
    if (queryHost) localStorage.setItem("host", queryHost);

    loadSession({ initForm: true });
    loadSubmissionStatus();
  }, [code, queryUserId, queryHost]);

  useEffect(() => {
    if (!didInitForm) return;
    fetchResults();
  }, [didInitForm]);

  useEffect(() => {
    const timer = setInterval(() => {
      loadSubmissionStatus();
    }, 2000);

    return () => clearInterval(timer);
  }, [code, userId]);

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Search</h1>

      {loadingSession ? <p>Loading session...</p> : null}
      {error ? <p>{error}</p> : null}

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

      {submissionStatus.currentUserSubmitted ? (
        <div style={{ border: "1px solid #ccc", padding: 16, borderRadius: 8, marginBottom: 20 }}>
          <h2 style={{ marginTop: 0 }}>Choice Submitted</h2>
          {submissionStatus.currentUserOption ? (
            <p>
              You submitted: <strong>{submissionStatus.currentUserOption.title}</strong>
            </p>
          ) : null}
          <p>
            Waiting for everyone else: <strong>{submissionStatus.submissionCount}</strong> /{" "}
            <strong>{submissionStatus.totalUsers}</strong> submitted
          </p>
          <p>Voting will begin automatically once all users have submitted one option.</p>
        </div>
      ) : (
        <>
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

          <h2>Your Selected Choice</h2>
          {!selectedChoice ? (
            <p>Select one option below. You can only submit one option to the pool.</p>
          ) : (
            <div style={{ border: "1px solid #ccc", padding: 16, borderRadius: 8, marginBottom: 20 }}>
              <p style={{ margin: "0 0 8px 0" }}>
                <strong>{selectedChoice.title}</strong>
              </p>
              {selectedChoice.subtitle ? <p style={{ margin: "0 0 8px 0" }}>{selectedChoice.subtitle}</p> : null}
              <p style={{ margin: "0 0 8px 0" }}>
                <strong>Price:</strong> {renderPrice(selectedChoice)}
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => setSelectedChoice(null)}>
                  Remove Choice
                </button>
                <button type="button" onClick={submitChoice} disabled={submittingChoice}>
                  {submittingChoice ? "Submitting..." : "Submit Choice"}
                </button>
              </div>
            </div>
          )}

          <h2>Search Results</h2>

          {loadingResults ? <p>Loading results...</p> : null}
          {!loadingResults && results.length === 0 ? <p>No results found.</p> : null}

          <div>
            {results.map((item) => {
              const isSelected = selectedChoice?.sourceId === item.sourceId;

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

                  <button type="button" onClick={() => setSelectedChoice(item)}>
                    {isSelected ? "Selected" : "Select This Option"}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

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