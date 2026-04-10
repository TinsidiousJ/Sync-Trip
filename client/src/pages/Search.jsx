import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import PageLayout from "../components/PageLayout.jsx";
import ConfirmPopup from "../components/ConfirmPopup.jsx";
import BottomBar from "../components/BottomBar.jsx";
import ItineraryPopup from "../components/ItineraryPopup.jsx";

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
  const [message, setMessage] = useState("");

  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [submittingChoice, setSubmittingChoice] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showSubmitPrompt, setShowSubmitPrompt] = useState(false);
  const [showItineraryPopup, setShowItineraryPopup] = useState(false);

  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [minRating, setMinRating] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [didLoadMyFilters, setDidLoadMyFilters] = useState(false);

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

  async function loadSession({ initialiseMyFilters = false } = {}) {
    try {
      setError("");
      setLoadingSession(true);

      const res = await fetch(`${API_BASE}/sessions/${code}/lobby`);
      const data = await readJsonSafely(res, "Failed to load session");

      if (!res.ok) throw new Error(data.error || "Failed to load session");

      if (
        data.session?.stage === "VOTING" ||
        data.session?.stage === "RESULT" ||
        data.session?.stage === "REPLAN_PROMPT"
      ) {
        navigate(`/vote/${code}?userId=${userId}&host=${queryHost || localStorage.getItem("host") || "0"}`);
        return;
      }

      if (data.session?.stage !== "SEARCH" && !data.session?.isStarted) {
        navigate(`/lobby/${code}?userId=${userId}&host=${queryHost || localStorage.getItem("host") || "0"}`);
        return;
      }

      setSession(data.session || null);
      setUsers(data.users || []);

      if ((initialiseMyFilters || !didLoadMyFilters) && userId) {
        const me = (data.users || []).find((user) => user.userId === userId);
        const myFilters = me?.filters;

        if (myFilters) {
          setBudgetMin(
            myFilters.budgetMin === null || typeof myFilters.budgetMin === "undefined"
              ? ""
              : String(myFilters.budgetMin)
          );
          setBudgetMax(
            myFilters.budgetMax === null || typeof myFilters.budgetMax === "undefined"
              ? ""
              : String(myFilters.budgetMax)
          );
          setMinRating(
            myFilters.minRating === null || typeof myFilters.minRating === "undefined"
              ? ""
              : String(myFilters.minRating)
          );
          setSelectedTags(Array.isArray(myFilters.tags) ? myFilters.tags : []);
        }

        setDidLoadMyFilters(true);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingSession(false);
    }
  }

  function buildCurrentFilters(overrides = {}) {
    return {
      budgetMin: budgetMin === "" ? null : Number(budgetMin),
      budgetMax: budgetMax === "" ? null : Number(budgetMax),
      minRating: minRating === "" ? null : Number(minRating),
      tags: selectedTags,
      ...overrides,
    };
  }

  async function saveFilters(nextFilters) {
    if (!userId) return;

    const res = await fetch(`${API_BASE}/sessions/${code}/filters`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, filters: nextFilters }),
    });

    const data = await readJsonSafely(res, "Failed to save filters");
    if (!res.ok) throw new Error(data.error || "Failed to save filters");
    return data;
  }

  async function applyFiltersAndRefresh() {
    try {
      setError("");
      setMessage("");
      await saveFilters(buildCurrentFilters());
      await fetchResults();
      setMessage("Filters updated.");
      setShowFilters(false);
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

      if (
        data.stage === "VOTING" ||
        data.stage === "RESULT" ||
        data.stage === "REPLAN_PROMPT" ||
        data.allSubmitted
      ) {
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
      setMessage("");
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

      if (data.skippedVoting && data.winner) {
        setMessage(`Everyone submitted the same option, so voting was skipped and "${data.winner.title}" was selected automatically.`);
      } else {
        setMessage("Choice submitted to the anonymous pool.");
      }

      await loadSubmissionStatus();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmittingChoice(false);
      setShowSubmitPrompt(false);
    }
  }

  function toggleTag(tag) {
    setSelectedTags((currentTags) =>
      currentTags.includes(tag)
        ? currentTags.filter((currentTag) => currentTag !== tag)
        : [...currentTags, tag]
    );
  }

function renderPrice(item) {
  if (item.price !== null && typeof item.price !== "undefined" && Number.isFinite(Number(item.price))) {
    return `${item.currency || "GBP"} ${Number(item.price)}`;
  }

  return "Price unavailable";
}

  function getPriceBadgeClass(item) {
    const hasAnyBudget = budgetMin !== "" || budgetMax !== "";
    if (!hasAnyBudget) return "badge";
    return item.budgetOk ? "badge badge--success" : "badge";
  }

  function getRatingBadgeClass(item) {
    if (minRating === "") return "badge";
    return item.ratingOk ? "badge badge--success" : "badge";
  }

  function getTagBadgeClass(tag) {
    return selectedTags.includes(tag) ? "badge badge--success" : "badge";
  }

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (budgetMin !== "") count += 1;
    if (budgetMax !== "") count += 1;
    if (minRating !== "") count += 1;
    if (selectedTags.length > 0) count += selectedTags.length;
    return count;
  }, [budgetMin, budgetMax, minRating, selectedTags]);

  useEffect(() => {
    if (!code) return;

    localStorage.setItem("sessionCode", code);
    if (queryUserId) localStorage.setItem("userId", queryUserId);
    if (queryHost) localStorage.setItem("host", queryHost);

    loadSession({ initialiseMyFilters: true });
    loadSubmissionStatus();
  }, [code, queryUserId, queryHost]);

  useEffect(() => {
    if (!didLoadMyFilters) return;
    fetchResults();
  }, [didLoadMyFilters]);

  useEffect(() => {
    const timer = setInterval(() => {
      loadSubmissionStatus();
    }, 2000);

    return () => clearInterval(timer);
  }, [code, userId]);

  return (
    <PageLayout
      pageTitle="Search and select"
      pageSubtitle="Refresh results, review your filters, and submit one choice to the anonymous group pool."
      headerAction={
        <button type="button" className="button button--secondary" onClick={() => setShowItineraryPopup(true)}>
          View Itinerary
        </button>
      }
    >
      {loadingSession ? <div className="alert">Loading session...</div> : null}
      {error ? <div className="alert alert--error" style={{ marginBottom: 20 }}>{error}</div> : null}
      {message ? <div className="alert alert--warning" style={{ marginBottom: 20 }}>{message}</div> : null}

      {session ? (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="info-list">
            <div className="info-row">
              <span className="info-row__label">Session code</span>
              <strong>{code}</strong>
            </div>
            <div className="info-row">
              <span className="info-row__label">Session</span>
              <strong>{session.sessionName}</strong>
            </div>
            <div className="info-row">
              <span className="info-row__label">Destination</span>
              <strong>{session.destination}</strong>
            </div>
            <div className="info-row">
              <span className="info-row__label">Planning type</span>
              <strong>{session.planningType}</strong>
            </div>
          </div>
        </div>
      ) : null}

      {submissionStatus.currentUserSubmitted ? (
        <div className="card">
          <h2 className="card__title">Choice submitted</h2>

          {submissionStatus.currentUserOption ? (
            <p>
              You submitted <strong>{submissionStatus.currentUserOption.title}</strong>.
            </p>
          ) : null}

          <div className="status-panel">
            <div className="info-row">
              <span className="info-row__label">Group progress</span>
              <strong>
                {submissionStatus.submissionCount} / {submissionStatus.totalUsers}
              </strong>
            </div>

            <div className="status-panel__progress">
              <span
                style={{
                  width: `${
                    submissionStatus.totalUsers > 0
                      ? (submissionStatus.submissionCount / submissionStatus.totalUsers) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>

          <p className="inline-note" style={{ marginTop: 14 }}>
            Voting will begin automatically once everyone has submitted one option.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid--2">
            <section className="card">
              <div className="button-row" style={{ marginBottom: 16 }}>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => setShowFilters((current) => !current)}
                >
                  {showFilters ? "Hide Filters" : `Filters${activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}`}
                </button>

                <button type="button" className="button button--secondary" onClick={fetchResults} disabled={loadingResults}>
                  {loadingResults ? "Refreshing..." : "Refresh Results"}
                </button>
              </div>

              {showFilters ? (
                <div className="filter-dropdown-panel">
                  <div className="form-grid">
                    <div className="form-grid form-grid--2">
                      <div className="field">
                        <label className="field__label">Budget min</label>
                        <input
                          className="input"
                          value={budgetMin}
                          onChange={(e) => setBudgetMin(e.target.value)}
                          placeholder="e.g. 50"
                        />
                      </div>

                      <div className="field">
                        <label className="field__label">Budget max</label>
                        <input
                          className="input"
                          value={budgetMax}
                          onChange={(e) => setBudgetMax(e.target.value)}
                          placeholder="e.g. 200"
                        />
                      </div>
                    </div>

                    <div className="field">
                      <label className="field__label">Minimum rating</label>
                      <select className="select" value={minRating} onChange={(e) => setMinRating(e.target.value)}>
                        <option value="">Any</option>
                        <option value="3">3+</option>
                        <option value="3.5">3.5+</option>
                        <option value="4">4+</option>
                        <option value="4.5">4.5+</option>
                      </select>
                    </div>

                    <div className="field">
                      <label className="field__label">
                        {session?.planningType === "ACTIVITIES" ? "Activity categories" : "Hotel amenities"}
                      </label>

                      <div className="checkbox-list">
                        {tagOptions.map((tag) => (
                          <label key={tag} className="choice-row">
                            <input
                              type="checkbox"
                              checked={selectedTags.includes(tag)}
                              onChange={() => toggleTag(tag)}
                            />
                            <span>{tag}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="button-row">
                      <button
                        type="button"
                        className="button button--primary"
                        onClick={applyFiltersAndRefresh}
                        disabled={loadingResults}
                      >
                        {loadingResults ? "Applying..." : "Apply Filters"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="inline-note">Use the Filters button to view or change your preferences.</p>
              )}
            </section>

            <aside className="card">
              <h2 className="card__title">Users in session</h2>

              {users.length === 0 ? (
                <div className="empty-state">No users yet.</div>
              ) : (
                <ul className="user-list">
                  {users.map((user) => (
                    <li key={user.userId} className="user-list__item">
                      <span className="user-list__name">{user.displayName}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="card__section">
                <h3 className="card__title">Current selection</h3>

                {!selectedChoice ? (
                  <p className="inline-note">
                    Select one option below. Your choice remains private until submitted.
                  </p>
                ) : (
                  <div className="card card--muted">
                    <strong>{selectedChoice.title}</strong>
                    {selectedChoice.subtitle ? <p className="inline-note">{selectedChoice.subtitle}</p> : null}

                    <div className="badge-row">
                      <span className="badge badge--primary">Selected</span>
                      <span className="badge">{renderPrice(selectedChoice)}</span>
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </div>

          <div style={{ marginTop: 20 }}>
            <h2 className="card__title">Search results</h2>

            {loadingResults ? <div className="alert">Loading results...</div> : null}
            {!loadingResults && results.length === 0 ? <div className="empty-state">No results found.</div> : null}

            <div className="option-grid">
              {results.map((item) => {
                const isSelected = selectedChoice?.sourceId === item.sourceId;

                return (
                  <div key={item.sourceId} className={`option-card ${isSelected ? "option-card--selected" : ""}`}>
                    {item.image ? (
                      <img src={item.image} alt={item.title} className="option-card__image" />
                    ) : (
                      <div className="option-card__image option-card__image--placeholder">No image available</div>
                    )}

                    <div>
                      <h3 className="option-card__title">{item.title}</h3>
                      {item.subtitle ? <p className="option-card__subtitle">{item.subtitle}</p> : null}
                    </div>

                    <div className="option-card__meta">
                      <span className={getRatingBadgeClass(item)}>Rating: {item.rating ?? "Unavailable"}</span>
                      {item.price !== null && typeof item.price !== "undefined" ? (
                        <span className={getPriceBadgeClass(item)}>Price: {renderPrice(item)}</span>
                      ) : null}
                    </div>

                    {item.tags?.length ? (
                      <div className="badge-row">
                        {item.tags.map((tag) => (
                          <span key={tag} className={getTagBadgeClass(tag)}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <div className="option-card__footer">
                      {item.link ? (
                        <a href={item.link} target="_blank" rel="noreferrer" className="inline-note">
                          View source
                        </a>
                      ) : (
                        <span className="inline-note">No source link</span>
                      )}

                      <button
                        type="button"
                        className={`button ${isSelected ? "button--secondary" : "button--primary"}`}
                        onClick={() => setSelectedChoice(item)}
                      >
                        {isSelected ? "Selected" : "Select Option"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      <BottomBar
        isVisible={!submissionStatus.currentUserSubmitted}
        title={selectedChoice ? `Ready to submit: ${selectedChoice.title}` : "Select one option to continue"}
        description={
          selectedChoice
            ? "Your submission stays private until it enters the anonymous group pool."
            : "Choose a hotel or activity card above, then submit it to the group pool."
        }
        mainButtonText={submittingChoice ? "Submitting..." : "Submit Choice"}
        onMainClick={() => setShowSubmitPrompt(true)}
        mainDisabled={!selectedChoice || submittingChoice}
        altButtonText={selectedChoice ? "Clear Selection" : ""}
        onAltClick={selectedChoice ? () => setSelectedChoice(null) : null}
      />

      <ConfirmPopup
        isOpen={showSubmitPrompt}
        title="Submit this choice?"
        message={
          selectedChoice
            ? `Submit "${selectedChoice.title}" to the anonymous group pool? You can only submit one option.`
            : "No option selected."
        }
        confirmText="Submit Choice"
        cancelText="Keep Editing"
        onConfirm={submitChoice}
        onCancel={() => setShowSubmitPrompt(false)}
        loading={submittingChoice}
      />

      <ItineraryPopup
        isOpen={showItineraryPopup}
        sessionCode={code}
        onClose={() => setShowItineraryPopup(false)}
      />
    </PageLayout>
  );
}